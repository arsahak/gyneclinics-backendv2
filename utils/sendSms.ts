import { env } from "../config/env";
import { ApiError } from "./ApiError";

const BULKSMS_API_URL = "http://bulksmsbd.net/api/smsapi";
const BULKSMS_SUCCESS_CODE = "202";
const BRAND_NAME = "Gyneclinics";

export async function sendOtpSms(to: string, otp: string): Promise<void> {
  if (!env.bulkSms.apiKey || !env.bulkSms.senderId) {
    throw new ApiError(500, "SMS delivery is not configured");
  }

  const params = new URLSearchParams({
    api_key: env.bulkSms.apiKey,
    type: "text",
    number: to,
    senderid: env.bulkSms.senderId,
    message: `Your ${BRAND_NAME} OTP is ${otp}`,
  });

  const res = await fetch(`${BULKSMS_API_URL}?${params.toString()}`, {
    signal: AbortSignal.timeout(10_000),
  });
  const raw = await res.text();

  // BulkSMSBD returns a bare status code or a small JSON body, not a
  // conventional HTTP error status — 202 means "submitted successfully".
  let code: string;
  try {
    const parsed = JSON.parse(raw);
    code = String(parsed.response_code ?? parsed.responseCode ?? parsed.code ?? raw);
  } catch {
    code = raw.trim();
  }

  if (code !== BULKSMS_SUCCESS_CODE) {
    console.error("BulkSMSBD send failed:", raw);
    throw new ApiError(502, "Could not send verification SMS");
  }
}
