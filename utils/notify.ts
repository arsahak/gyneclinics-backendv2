import mongoose from "mongoose";
import type { LinkTarget } from "../models/announcement.model";
import { Notification } from "../models/notification.model";
import { NotificationSetting } from "../models/notificationSetting.model";
import { emitUserNotification } from "../realtime/messagesRealtime";

// Automatic messages: sent by the app when something happens. Each can be
// switched off in the dashboard (Notifications → Automatic messages).
//   live    = sent today
//   planned = designed, needs a scheduler before it can be switched on

export type AutoKey =
  | "login_code"
  | "booking_confirmed"
  | "doctor_new_booking"
  | "story_reviewed"
  | "profile_reviewed"
  | "payout_update"
  | "report_closed"
  | "reminder_24h"
  | "reminder_10m"
  | "follow_up_ending"
  | "doctor_waiting"
  | "period_reminder";

export interface AutoMessage {
  key: AutoKey;
  name: string;
  trigger: string;
  to: "patient" | "doctor" | "both";
  channels: ("in_app" | "push" | "sms")[];
  template: string;
  state: "live" | "planned";
  /** Can't be switched off (people couldn't sign in). */
  locked?: boolean;
}

export const AUTO_MESSAGES: AutoMessage[] = [
  {
    key: "login_code",
    name: "Login code",
    trigger: "When someone signs in with their phone",
    to: "both",
    channels: ["sms"],
    template: "GyneClinics code: {code}. It expires in 10 minutes. Never share this code.",
    state: "live",
    locked: true,
  },
  {
    key: "booking_confirmed",
    name: "Booking confirmed",
    trigger: "Right after the payment goes through",
    to: "patient",
    channels: ["sms", "in_app"],
    template: "Your consultation with {doctor} is confirmed. It starts {time}. Ref {reference}",
    state: "live",
  },
  {
    key: "doctor_new_booking",
    name: "New booking for the doctor",
    trigger: "When a patient books the doctor",
    to: "doctor",
    channels: ["in_app"],
    template: "New consultation: {patient} booked you for {time}.",
    state: "live",
  },
  {
    key: "story_reviewed",
    name: "Story approved or not",
    trigger: "When the team approves or rejects a story",
    to: "patient",
    channels: ["in_app"],
    template: "Your story \"{title}\" is now live in Learn. Thank you for sharing.",
    state: "live",
  },
  {
    key: "profile_reviewed",
    name: "Doctor profile reviewed",
    trigger: "When the team approves or turns down a doctor or a profile update",
    to: "doctor",
    channels: ["in_app"],
    template: "Your GyneClinics profile is approved. Patients can now book you.",
    state: "live",
  },
  {
    key: "payout_update",
    name: "Withdrawal sent or not",
    trigger: "When the team sends (with Stripe) or rejects a withdrawal",
    to: "doctor",
    channels: ["in_app"],
    template: "We've sent {amount} to your Stripe account. Stripe pays it into your bank or card.",
    state: "live",
  },
  {
    key: "report_closed",
    name: "Report answered",
    trigger: "When the team resolves or dismisses a report",
    to: "both",
    channels: ["in_app"],
    template: "We've looked into your report: {note}",
    state: "live",
  },
  {
    key: "reminder_24h",
    name: "Reminder: 24 hours before",
    trigger: "24 hours before a scheduled consultation",
    to: "patient",
    channels: ["sms", "push"],
    template: "Reminder: your consultation with {doctor} is tomorrow at {time}. Ref {reference}",
    state: "planned",
  },
  {
    key: "reminder_10m",
    name: "Reminder: 10 minutes before",
    trigger: "10 minutes before a scheduled consultation",
    to: "patient",
    channels: ["sms", "push"],
    template: "Your consultation with {doctor} starts in 10 minutes. Open GyneClinics to join.",
    state: "planned",
  },
  {
    key: "follow_up_ending",
    name: "Follow-up ending soon",
    trigger: "1 day before the 7-day follow-up ends",
    to: "patient",
    channels: ["push", "in_app"],
    template: "Your free follow-up with {doctor} ends tomorrow. Any last questions?",
    state: "planned",
  },
  {
    key: "doctor_waiting",
    name: "Patient waiting for a reply",
    trigger: "When a patient has waited 1 hour for the doctor",
    to: "doctor",
    channels: ["push", "sms"],
    template: "{patient} has been waiting 1 hour for your reply on GyneClinics.",
    state: "planned",
  },
  {
    key: "period_reminder",
    name: "Period reminder",
    trigger: "2 days before the predicted period (if the patient turned it on)",
    to: "patient",
    channels: ["push"],
    template: "Your period may start in about 2 days. Tap to log how you feel.",
    state: "planned",
  },
];

/** App page for each link target, per role. */
const LINKS: Record<LinkTarget, { patient: string; doctor: string }> = {
  home: { patient: "/patient", doctor: "/doctor" },
  doctors: { patient: "/patient/doctors", doctor: "/doctor" },
  learn: { patient: "/patient/learn", doctor: "/doctor" },
  share_story: { patient: "/patient/learn/share-story", doctor: "/doctor" },
  cycle: { patient: "/patient/calendar", doctor: "/doctor" },
  consultations: { patient: "/patient/consultations", doctor: "/doctor" },
  messages: { patient: "/patient/messages", doctor: "/doctor/messages" },
  earnings: { patient: "/patient", doctor: "/doctor/earnings" },
};

export const linkFor = (target: LinkTarget | undefined, role: "patient" | "doctor") => (target ? LINKS[target][role] : undefined);

// Settings are read often and change rarely: keep them for a short while.
let cache: { at: number; off: Set<string> } | null = null;
const CACHE_MS = 30_000;

export async function disabledAutoKeys(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.off;
  const rows = await NotificationSetting.find({ enabled: false }).select("key").lean();
  cache = { at: Date.now(), off: new Set(rows.map((r) => r.key)) };
  return cache.off;
}

export function forgetSettingsCache() {
  cache = null;
}

/** Whether an automatic message is switched on (live ones only). */
export async function isAutoOn(key: AutoKey) {
  const msg = AUTO_MESSAGES.find((m) => m.key === key);
  if (!msg || msg.state !== "live") return false;
  if (msg.locked) return true;
  return !(await disabledAutoKeys()).has(key);
}

/**
 * Puts a notification in each user's inbox. For automatic messages pass
 * `autoKey`: nothing is sent if that message is switched off. Never throws:
 * a failed notification must not break the action that caused it.
 */
/**
 * Sends new inbox items to the app right away (socket.io room user:<id>), with
 * each person's unread count. Big announcements go in chunks.
 */
async function pushLive(items: { user: string; item: unknown }[]) {
  try {
    for (let i = 0; i < items.length; i += 500) {
      const chunk = items.slice(i, i + 500);
      const ids = [...new Set(chunk.map((c) => c.user))].map((id) => new mongoose.Types.ObjectId(id));
      const counts = await Notification.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
        { $match: { user: { $in: ids }, readAt: { $exists: false } } },
        { $group: { _id: "$user", n: { $sum: 1 } } },
      ]);
      const unread = new Map(counts.map((c) => [String(c._id), c.n]));
      for (const c of chunk) emitUserNotification(c.user, { notification: c.item, unread: unread.get(c.user) ?? 1 });
    }
  } catch (error) {
    console.error(`Live notification push failed: ${(error as Error).message}`);
  }
}

export async function notify(
  users: (mongoose.Types.ObjectId | string)[],
  message: { title: string; body: string; link?: string; autoKey?: AutoKey; announcement?: mongoose.Types.ObjectId }
) {
  try {
    if (!users.length) return 0;
    if (message.autoKey && !(await isAutoOn(message.autoKey))) return 0;
    const docs = users.map((user) => ({
      user,
      title: message.title.slice(0, 120),
      body: message.body.slice(0, 600),
      link: message.link,
      autoKey: message.autoKey,
      announcement: message.announcement,
    }));
    const saved = await Notification.insertMany(docs, { ordered: false });
    await pushLive(saved.map((d) => ({ user: String(d.user), item: { _id: d._id, title: d.title, body: d.body, link: d.link, createdAt: d.createdAt } })));
    return docs.length;
  } catch (error) {
    console.error(`notify failed: ${(error as Error).message}`);
    return 0;
  }
}
