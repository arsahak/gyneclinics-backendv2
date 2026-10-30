import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "../config/env";
import { OtpCode } from "../models/otpCode.model";
import { ApiError } from "./ApiError";
import { getTwilioClient, isFictional, sendSms, type SmsResult } from "./sms";

// Phone sign-in codes.
//
// With TWILIO_VERIFY_SERVICE_SID set (the normal setup), Twilio Verify makes,
// texts and checks the code. Verify chooses a sender that works in each
// country, so codes reach numbers anywhere in the world.
//
// Without it, we make the code ourselves, keep only its hash, and text it
// through the Messaging Service (utils/sms.ts). That only reaches countries
// the service has a sender for.
//
// Either way, our own resend wait and hourly limit (OTP_RULES) apply.

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

const usesVerify = () => Boolean(env.twilio.verifyServiceSid);

const hashCode = (phone: string, code: string) =>
  createHmac("sha256", env.jwtSecret).update(`${phone}:${code}`).digest("hex");

const sameHash = (a: string, b: string) => {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
};

// Twilio errors we can explain. https://www.twilio.com/docs/api/errors
function smsError(code?: number): ApiError {
  // Bad number (Messaging: 21211, 21614; Verify: 60200).
  if (code === 21211 || code === 21614 || code === 60200) return new ApiError(422, "Please enter a valid mobile number");
  // Landline or other number that can't get texts (Messaging: 21612; Verify: 60205).
  if (code === 21612 || code === 60205) return new ApiError(422, "We can't text this number. Please use a mobile number");
  if (code === 21610) return new ApiError(403, "This number has opted out of our texts. Reply START to us, then try again");
  // Country switched off (Messaging: 21408; Verify: 60605).
  if (code === 21408 || code === 60605) {
    console.error(
      `Twilio ${code}: SMS to this country is switched off. Turn it on in Console → ` +
        (code === 60605 ? "Verify → Settings → Geo permissions." : "Messaging → Settings → Geo permissions.")
    );
    return new ApiError(403, "We can't send codes to numbers in this country yet");
  }
  // Verify's own send limit for one number (5 codes in 10 minutes).
  if (code === 60203) return new ApiError(429, "Too many codes sent. Please wait 10 minutes and try again");
  // Verify Fraud Guard or a blocked number prefix.
  if (code === 60410) {
    console.error("Twilio 60410: Verify blocked this send as possible SMS fraud (Fraud Guard). Check Console → Verify → Fraud Guard.");
    return new ApiError(403, "We can't send a code to this number. Please contact us");
  }
  if (code === 20429) return new ApiError(429, "Too many requests. Please try again in a minute");
  if (code === 20404 && usesVerify()) {
    console.error("Twilio 20404: TWILIO_VERIFY_SERVICE_SID doesn't match a Verify service on this account.");
    return new ApiError(503, "We can't send codes right now. Please try again later");
  }
  if (code === 20003) {
    console.error("Twilio 20003: check the Twilio credentials, and that the Primary Customer Profile is approved (Console → Trust Hub).");
    return new ApiError(503, "We can't send codes right now. Please try again later");
  }
  if (code === 21703) {
    console.error(
      "Twilio 21703: the Messaging Service has no sender for this country. Set TWILIO_VERIFY_SERVICE_SID so codes go through Twilio Verify, which reaches every country."
    );
    return new ApiError(403, "We can't send a code to this number yet. Please try again later");
  }
  if (code === 21608) {
    console.error("Twilio 21608: approve a Primary Compliance Profile in Trust Hub, or verify this number for testing.");
    return new ApiError(403, "We can't send a code to this number yet. Please try again later");
  }
  return new ApiError(502, "Could not send the code. Please try again");
}

/** Asks Twilio Verify to text a code. Never throws. */
async function startVerification(phone: string): Promise<SmsResult> {
  const client = getTwilioClient();
  if (!client) {
    console.log(`[otp] Twilio not configured, no code sent to ${phone}`);
    return { status: "skipped", reason: "SMS is not configured" };
  }
  if (isFictional(phone)) {
    console.log(`[otp] test number, no code sent to ${phone}`);
    return { status: "skipped", reason: "Test number" };
  }
  try {
    const verification = await client.verify.v2
      .services(env.twilio.verifyServiceSid)
      .verifications.create({ to: phone, channel: "sms" });
    return { status: "sent", sid: verification.sid };
  } catch (error) {
    const { code, message } = error as { code?: number; message?: string };
    console.error(`[otp] Verify could not send to ${phone}:`, code, message);
    return { status: "failed", code, error: message ?? "Could not send the code" };
  }
}

/** Asks Twilio Verify whether the code is right. Each code works once. */
async function checkVerification(phone: string, code: string): Promise<boolean> {
  const client = getTwilioClient();
  if (!client) return false;
  try {
    const check = await client.verify.v2
      .services(env.twilio.verifyServiceSid)
      .verificationChecks.create({ to: phone, code });
    return check.status === "approved";
  } catch (error) {
    const { code: twilioCode, message } = error as { code?: number; message?: string };
    // No code waiting for this number: it expired, was used, or was never sent.
    if (twilioCode === 20404) return false;
    if (twilioCode === 60202) throw new ApiError(429, "Too many incorrect attempts. Please request a new code");
    console.error(`[otp] Verify could not check the code for ${phone}:`, twilioCode, message);
    throw new ApiError(502, "Could not check the code. Please try again");
  }
}

/** A test number from OTP_TEST_NUMBERS: signs in with OTP_TEST_CODE, no SMS. */
export const isTestNumber = (phone: string) => env.otpTestNumbers.includes(phone);

/** Makes a new code for this phone and texts it. `phone` must be E.164, e.g. +447700900123. */
export async function sendOtp(phone: string): Promise<void> {
  if (isTestNumber(phone)) {
    console.log(`[otp] test number ${phone}: no SMS, sign in with the test code.`);
    return;
  }
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

  // With Verify, Twilio makes and keeps the code; we only track the limits.
  const code = usesVerify() ? null : String(randomInt(0, 10 ** OTP_RULES.digits)).padStart(OTP_RULES.digits, "0");
  const windowStart = windowOpen ? existing.windowStart : now;
  const expiresAt = new Date(now.getTime() + OTP_RULES.expiresMinutes * MINUTE);
  await OtpCode.updateOne(
    { phone },
    {
      $set: {
        ...(code && { codeHash: hashCode(phone, code) }),
        expiresAt,
        attempts: 0,
        sentAt: now,
        windowStart,
        sendCount: (windowOpen ? existing.sendCount : 0) + 1,
        // Keep the row for the hourly limit, or until the code expires.
        purgeAt: new Date(Math.max(windowStart.getTime() + 60 * MINUTE, expiresAt.getTime())),
      },
      ...(!code && { $unset: { codeHash: 1 } }),
    },
    { upsert: true }
  );

  const sms = code
    ? await sendSms(
        phone,
        `GyneClinics code: ${code}. It expires in ${OTP_RULES.expiresMinutes} minutes. Never share this code.`
      )
    : await startVerification(phone);
  if (sms.status === "sent") return;
  if (sms.status === "skipped" && sms.reason === "Test number") return; // already logged
  if (sms.status === "skipped" && env.otpBypassCode) return; // dev without SMS: use the bypass code
  // Nothing reached the phone: drop the code, and don't count this try
  // against the resend wait or the hourly limit.
  await OtpCode.updateOne({ phone }, { $unset: { codeHash: 1 }, $set: { sentAt: new Date(0) }, $inc: { sendCount: -1 } });
  if (sms.status === "failed" && env.otpBypassCode) {
    // Dev: don't lock anyone out while SMS isn't working; the bypass code still signs in.
    console.warn(`[otp] SMS failed (${sms.code}); sign in with the dev bypass code instead.`);
    return;
  }
  if (sms.status === "skipped") throw new ApiError(500, "SMS sign-in is not configured");
  throw smsError(sms.code);
}

/** True when the code is right for this phone. Each code works once. */
export async function checkOtp(phone: string, code: string): Promise<boolean> {
  // Dev only (never set in production): a fixed code for any number.
  if (env.otpBypassCode && code === env.otpBypassCode) return true;
  // Test numbers: the test code, in any environment.
  if (isTestNumber(phone)) return code === env.otpTestCode;

  if (usesVerify()) return checkVerification(phone, code);

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
