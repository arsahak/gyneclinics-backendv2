import crypto from "crypto";
import bcrypt from "bcryptjs";

// Every code the shop sends — sign-in, checkout, sign-up and password reset.
export const OTP_LENGTH = 4;
export const OTP_TTL_MINUTES = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_MAX_ATTEMPTS = 5;

export function generateOtp(): string {
  return crypto.randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

export function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, 8);
}

export function compareOtp(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash);
}

// ── Password-reset token ────────────────────────────────────────────────────
// Issued once a reset OTP is confirmed; presenting it is what authorizes
// setting the new password.

export const RESET_TOKEN_TTL_MINUTES = 15;

export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// The token is long and random, so a plain SHA-256 (no salt, no slow hash) is
// enough to keep the stored value useless to anyone who reads the database.
export function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
