import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "../config/env";
import { OtpCode } from "../models/otpCode.model";
import { ApiError } from "./ApiError";
import { sendSms } from "./sms";

// Phone sign-in codes. We make the code, keep only its hash, and text it
// through the Twilio Messaging Service (utils/sms.ts).

export const OTP_RULES = {
  digits: 6,
  expiresMinutes: 10,
  /** Wrong guesses before the code stops working. */
  maxAttempts: 5,
  /** Wait before another code can be sent to the same phone. */
  resendSeconds: 30,
  /** Codes per phone per hour. */
  maxPerHour: 5,
};

const MINUTE = 60_000;

const hashCode = (phone: string, code: string) =>
  createHmac("sha256", env.jwtSecret).update(`${phone}:${code}`).digest("hex");

const sameHash = (a: string, b: string) => {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
};

// Twilio errors we can explain. https://www.twilio.com/docs/api/errors
function smsError(code?: number): ApiError {
  if (code === 21211 || code === 21614) return new ApiError(422, "Please enter a valid mobile number");
  if (code === 21612) return new ApiError(422, "We can't text this number. Please use a mobile number");
  if (code === 21610) return new ApiError(403, "This number has opted out of our texts. Reply START to us, then try again");
  if (code === 21408) return new ApiError(403, "We can't send codes to numbers in this country yet");
  if (code === 20003) {
    console.error("Twilio 20003: the Primary Customer Profile isn't approved. Finish KYC in Console → Trust Hub.");
    return new ApiError(503, "We can't send codes right now. Please try again later");
  }
  if (code === 21608) {
    console.error("Twilio 21608: approve a Primary Compliance Profile in Trust Hub, or verify this number for testing.");
    return new ApiError(403, "We can't send a code to this number yet. Please try again later");
  }
  return new ApiError(502, "Could not send the code. Please try again");
}

/** Makes a new code for this phone and texts it. `phone` must be E.164, e.g. +447700900123. */
export async function sendOtp(phone: string): Promise<void> {
  const now = new Date();
  const existing = await OtpCode.findOne({ phone });

  if (existing && now.getTime() - existing.sentAt.getTime() < OTP_RULES.resendSeconds * 1000) {
    const wait = Math.ceil((existing.sentAt.getTime() + OTP_RULES.resendSeconds * 1000 - now.getTime()) / 1000);
    throw new ApiError(429, `A code was just sent. Please wait ${wait} seconds before asking for another`);
  }
  const windowOpen = existing && now.getTime() - existing.windowStart.getTime() < 60 * MINUTE;
  if (windowOpen && existing.sendCount >= OTP_RULES.maxPerHour) {
    const minutes = Math.ceil((existing.windowStart.getTime() + 60 * MINUTE - now.getTime()) / MINUTE);
    throw new ApiError(429, `Too many codes sent. Please try again in ${minutes} minutes`);
  }

  const code = String(randomInt(0, 10 ** OTP_RULES.digits)).padStart(OTP_RULES.digits, "0");
  const windowStart = windowOpen ? existing.windowStart : now;
  const expiresAt = new Date(now.getTime() + OTP_RULES.expiresMinutes * MINUTE);
  await OtpCode.updateOne(
    { phone },
    {
      $set: {
        codeHash: hashCode(phone, code),
        expiresAt,
        attempts: 0,
        sentAt: now,
        windowStart,
        sendCount: (windowOpen ? existing.sendCount : 0) + 1,
        // Keep the row for the hourly limit, or until the code expires.
        purgeAt: new Date(Math.max(windowStart.getTime() + 60 * MINUTE, expiresAt.getTime())),
      },
    },
    { upsert: true }
  );

  const sms = await sendSms(
    phone,
    `GyneClinics code: ${code}. It expires in ${OTP_RULES.expiresMinutes} minutes. Never share this code.`
  );
  if (sms.status === "sent") return;
  if (sms.status === "skipped" && sms.reason === "Test number") return; // logged by sendSms
  if (sms.status === "skipped" && env.otpBypassCode) return; // dev without SMS: use the bypass code
  if (sms.status === "failed" && env.otpBypassCode) {
    // Dev: don't lock anyone out while SMS isn't working; the bypass code still signs in.
    console.warn(`[otp] SMS failed (${sms.code}); sign in with the dev bypass code instead.`);
    await OtpCode.updateOne({ phone }, { $unset: { codeHash: 1 } });
    return;
  }

  // The patient never got this code, so don't leave it usable.
  await OtpCode.updateOne({ phone }, { $unset: { codeHash: 1 } });
  if (sms.status === "skipped") throw new ApiError(500, "SMS sign-in is not configured");
  throw smsError(sms.code);
}

/** True when the code is right for this phone. Each code works once. */
export async function checkOtp(phone: string, code: string): Promise<boolean> {
  // Dev only (never set in production): a fixed code for test accounts.
  if (env.otpBypassCode && code === env.otpBypassCode) return true;

  // Count the guess first, so parallel guesses can't get past the limit.
  const row = await OtpCode.findOneAndUpdate(
    { phone, codeHash: { $exists: true }, expiresAt: { $gt: new Date() } },
    { $inc: { attempts: 1 } },
    { new: true }
  );
  if (!row?.codeHash) return false;
  if (row.attempts > OTP_RULES.maxAttempts) {
    await OtpCode.updateOne({ _id: row._id }, { $unset: { codeHash: 1 } });
    throw new ApiError(429, "Too many incorrect attempts. Please request a new code");
  }
  if (!sameHash(row.codeHash, hashCode(phone, code))) return false;

  // Used: only the request that clears it signs in.
  const used = await OtpCode.updateOne({ _id: row._id, codeHash: row.codeHash }, { $unset: { codeHash: 1 } });
  return used.modifiedCount === 1;
}
