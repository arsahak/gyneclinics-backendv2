import mongoose, { Schema, Document } from "mongoose";

// One row per phone: the current sign-in code (hashed, never stored as is)
// and how many codes were sent this hour. Rows delete themselves (TTL).

export interface IOtpCode extends Document {
  phone: string;
  /** HMAC of the code; unset once used, after too many wrong tries, or if the SMS failed. */
  codeHash?: string;
  expiresAt: Date;
  /** Wrong guesses for the current code. */
  attempts: number;
  /** When the current code was sent (for the resend wait). */
  sentAt: Date;
  /** Codes sent since `windowStart` (hourly limit). */
  sendCount: number;
  windowStart: Date;
  /** The row is deleted at this time. */
  purgeAt: Date;
}

const otpCodeSchema = new Schema<IOtpCode>({
  phone: { type: String, required: true, unique: true },
  codeHash: { type: String },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  sentAt: { type: Date, required: true },
  sendCount: { type: Number, default: 0 },
  windowStart: { type: Date, required: true },
  purgeAt: { type: Date, required: true },
});

otpCodeSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

export const OtpCode = mongoose.model<IOtpCode>("OtpCode", otpCodeSchema);
