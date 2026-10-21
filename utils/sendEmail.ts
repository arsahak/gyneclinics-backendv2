import { env } from "../config/env";
import { ApiError } from "./ApiError";
import { OTP_TTL_MINUTES } from "./otp";

const RESEND_API_URL = "https://api.resend.com/emails";
const BRAND_NAME = "Gyneclinics";

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  if (!env.resend.apiKey) {
    throw new ApiError(500, "Email delivery is not configured");
  }

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resend.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.resend.fromEmail,
      to,
      subject: `Your ${BRAND_NAME} OTP is ${otp}`,
      html: `<p>Your ${BRAND_NAME} verification code is <strong>${otp}</strong>.</p><p>It expires in ${OTP_TTL_MINUTES} minutes. If you didn't request this, you can ignore this email.</p>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("Resend email send failed:", res.status, body);
    throw new ApiError(502, "Could not send verification email");
  }
}
