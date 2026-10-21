import twilio from "twilio";
import { env } from "../config/env";

// Text messages we send (sign-in codes, booking confirmations), through the
// Twilio Messaging Service in TWILIO_MESSAGING_SERVICE_SID.

export type SmsResult =
  | { status: "sent"; sid: string }
  | { status: "failed"; error: string; code?: number }
  | { status: "skipped"; reason: string };

let client: twilio.Twilio | null = null;

function getClient() {
  const { accountSid, authToken, apiKeySid, apiKeySecret } = env.twilio;
  if (!accountSid || (!(apiKeySid && apiKeySecret) && !authToken)) return null;
  client ??= apiKeySid && apiKeySecret ? twilio(apiKeySid, apiKeySecret, { accountSid }) : twilio(accountSid, authToken);
  return client;
}

/** Ofcom's reserved drama numbers (+44 7700 900000–900999): fictional, used for test accounts. */
const isFictional = (phone: string) => /^\+447700900\d{3}$/.test(phone);

/** Sends one SMS. Never throws: a failed message must not undo what triggered it. */
export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const { messagingServiceSid } = env.twilio;
  const twilioClient = getClient();
  if (!messagingServiceSid || !twilioClient) {
    console.log(`[sms] not configured, not sent to ${to}: ${body}`);
    return { status: "skipped", reason: "SMS is not configured" };
  }
  if (isFictional(to)) {
    console.log(`[sms] test number, not sent to ${to}: ${body}`);
    return { status: "skipped", reason: "Test number" };
  }
  try {
    const message = await twilioClient.messages.create({ to, body, messagingServiceSid });
    return { status: "sent", sid: message.sid };
  } catch (error) {
    const { code, message } = error as { code?: number; message?: string };
    console.error(`[sms] failed to ${to}:`, code, message);
    return { status: "failed", code, error: message ?? "Could not send the SMS" };
  }
}
