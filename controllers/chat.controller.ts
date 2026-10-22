import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../middleware/asyncHandler";
import { Chat, type IChat } from "../models/chat.model";
import { ChatFlag } from "../models/chatFlag.model";
import { ChatMessage } from "../models/chatMessage.model";
import { Consultation } from "../models/consultation.model";
import { Doctor, type IDoctor } from "../models/doctor.model";
import { User } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { findMessageFlag } from "../utils/chatSafety";
import { consultationTimes, stageFilter } from "../utils/consultationStage";
import { describeBlocked, findContactDetail } from "../utils/contactGuard";
import { alertStaff, moneyText } from "../utils/staffAlerts";

const FLAG_LABEL: Record<string, string> = { phone: "a phone number", email: "an email address", link: "a link", social: "a social handle", abuse: "abusive words", urgent_health: "an urgent health concern" };

const MAX_MESSAGES = 300;
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const preview = (text: string) => (text.length > 120 ? `${text.slice(0, 117)}…` : text);

/** free = no consultation running; consultation = the 24h chat; follow_up = the 7 days after. */
export type ChatType = "free" | "consultation" | "follow_up";

async function myDoctorProfile(userId: unknown) {
  const doctor = await Doctor.findOne({ user: userId });
  if (!doctor) throw new ApiError(403, "Finish your doctor profile first");
  return doctor;
}

/** The consultation between these two that is open right now (24h chat or follow-up), if any. */
async function openConsultation(patient: unknown, doctor: unknown) {
  const now = new Date();
  const consultation = await Consultation.findOne({
    patient,
    doctor,
    $or: [stageFilter("live", now), stageFilter("follow_up", now)],
  }).sort({ startsAt: -1 });
  if (!consultation) return null;
  const { sessionEndsAt } = consultationTimes(consultation.startsAt);
  return { consultation, type: (now < sessionEndsAt && consultation.status === "confirmed" ? "consultation" : "follow_up") as ChatType };
}

/** Can this patient write to this doctor now? */
async function patientCanWrite(patientId: unknown, doctor: IDoctor) {
  if (doctor.messaging?.free) return { ok: true as const };
  if (await openConsultation(patientId, doctor._id)) return { ok: true as const };
  return { ok: false as const, reason: "Book a consultation to message this doctor. The chat opens when it starts." };
}

/** Marks the chat read for one side. */
async function markRead(chat: IChat, role: "patient" | "doctor") {
  const field = role === "patient" ? "patientUnread" : "doctorUnread";
  if (chat[field] > 0) await Chat.updateOne({ _id: chat._id }, { [field]: 0 });
}

// ── Patients and doctors ────────────────────────────────────────────────────

/** Your conversations, newest first, with the other person and unread count. */
export const listMyChats = asyncHandler(async (req: Request, res: Response) => {
  const me = req.user!;
  const filter =
    me.role === "patient" ? { patient: me._id, messageCount: { $gt: 0 } } : { doctor: (await myDoctorProfile(me._id))._id, messageCount: { $gt: 0 } };
  const chats = await Chat.find(filter)
    .sort({ lastMessageAt: -1 })
    .limit(100)
    .populate("patient", "fullName avatar")
    .populate({ path: "doctor", select: "title specialization user", populate: { path: "user", select: "fullName avatar" } });
  return ApiResponse(res, 200, "Chats fetched successfully", chats);
});

/** Patient: the chat with one doctor (messages, and whether you can write now). */
export const getChatWithDoctor = asyncHandler(async (req: Request, res: Response) => {
  const me = req.user!;
  const doctor = await Doctor.findById(req.params.doctorId);
  if (!doctor) throw new ApiError(404, "Doctor not found");
  const [chat, access, open] = await Promise.all([
    Chat.findOne({ patient: me._id, doctor: doctor._id }),
    patientCanWrite(me._id, doctor),
    openConsultation(me._id, doctor._id),
  ]);
  const messages = chat ? await ChatMessage.find({ chat: chat._id }).sort({ createdAt: -1 }).limit(MAX_MESSAGES).select("senderRole text createdAt") : [];
  if (chat) await markRead(chat, "patient");
  return ApiResponse(res, 200, "Chat fetched successfully", {
    chat: chat ? { _id: chat._id } : null,
    messages: messages.reverse(),
    canSend: access.ok,
    reason: access.ok ? undefined : access.reason,
    type: open?.type ?? "free",
  });
});

/** Doctor: one of your chats with its messages. */
export const getChatForDoctor = asyncHandler(async (req: Request, res: Response) => {
  const me = req.user!;
  const doctor = await myDoctorProfile(me._id);
  const chat = await Chat.findOne({ _id: req.params.id, doctor: doctor._id }).populate("patient", "fullName avatar");
  if (!chat) throw new ApiError(404, "Chat not found");
  const [messages, open] = await Promise.all([
    ChatMessage.find({ chat: chat._id }).sort({ createdAt: -1 }).limit(MAX_MESSAGES).select("senderRole text createdAt"),
    openConsultation(chat.patient, doctor._id),
  ]);
  await markRead(chat, "doctor");
  return ApiResponse(res, 200, "Chat fetched successfully", { chat, messages: messages.reverse(), canSend: true, type: open?.type ?? "free" });
});

/**
 * Send a message. Patients pass doctorId, doctors pass chatId.
 * Contact details are refused and logged for Chat Moderation; abusive or
 * urgent-health words are delivered and flagged for the team.
 */
export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const me = req.user!;
  const text = String(req.body.text).trim();
  let chat: IChat;
  let recipient: mongoose.Types.ObjectId;
  const role = me.role as "patient" | "doctor";

  if (role === "patient") {
    if (!req.body.doctorId) throw new ApiError(422, "Choose the doctor you're writing to");
    const doctor = await Doctor.findById(req.body.doctorId);
    if (!doctor) throw new ApiError(404, "Doctor not found");
    const access = await patientCanWrite(me._id, doctor);
    if (!access.ok) throw new ApiError(403, access.reason);
    const found = await Chat.findOneAndUpdate({ patient: me._id, doctor: doctor._id }, { $setOnInsert: { patient: me._id, doctor: doctor._id } }, { upsert: true, new: true });
    if (!found) throw new ApiError(500, "Couldn't open the chat. Please try again.");
    chat = found;
    recipient = doctor.user;
  } else {
    if (!req.body.chatId) throw new ApiError(422, "Choose the chat you're replying to");
    const doctor = await myDoctorProfile(me._id);
    const found = await Chat.findOne({ _id: req.body.chatId, doctor: doctor._id });
    if (!found) throw new ApiError(404, "Chat not found");
    chat = found;
    recipient = chat.patient;
  }

  const contact = findContactDetail(text);
  if (contact) {
    await Promise.all([
      ChatFlag.create({ chat: chat._id, sender: me._id, senderRole: role, recipient, kind: contact.reason, outcome: "blocked", text, match: contact.match }),
      Chat.updateOne({ _id: chat._id }, { $inc: { flaggedCount: 1 } }),
    ]);
    await alertStaff({
      type: "chat_flagged",
      areas: ["chat_moderation"],
      title: "Chat message blocked",
      body: `${me.fullName || `A ${role}`} tried to share ${FLAG_LABEL[contact.reason] ?? contact.reason}. It wasn't sent.`,
      link: "/chat-moderation",
    });
    throw new ApiError(422, describeBlocked([contact.reason]));
  }

  const flag = findMessageFlag(text);
  const message = await ChatMessage.create({ chat: chat._id, sender: me._id, senderRole: role, text, flags: flag ? [flag.kind] : [] });
  const now = message.createdAt;
  const update: Record<string, unknown> = {
    $set: {
      lastMessageAt: now,
      lastMessageText: preview(text),
      lastSenderRole: role,
      ...(role === "patient" && !chat.firstMessageAt && { firstMessageAt: now }),
      ...(role === "doctor" && chat.firstMessageAt && !chat.firstReplyAt && { firstReplyAt: now }),
    },
    $inc: { messageCount: 1, ...(flag && { flaggedCount: 1 }), [role === "patient" ? "doctorUnread" : "patientUnread"]: 1 },
  };
  await Promise.all([
    Chat.updateOne({ _id: chat._id }, update),
    flag && ChatFlag.create({ chat: chat._id, message: message._id, sender: me._id, senderRole: role, recipient, kind: flag.kind, outcome: "delivered", text, match: flag.match }),
  ]);
  if (flag) {
    await alertStaff({
      type: "chat_flagged",
      areas: ["chat_moderation"],
      title: flag.kind === "urgent_health" ? "Urgent health message" : "Chat message flagged",
      body: `${me.fullName || `A ${role}`} wrote ${FLAG_LABEL[flag.kind] ?? flag.kind}: "${preview(text)}"`,
      link: "/chat-moderation",
      priority: flag.kind === "urgent_health" ? "urgent" : "normal",
    });
  }

  return ApiResponse(res, 201, "Message sent", { _id: message._id, senderRole: role, text: message.text, createdAt: message.createdAt, flags: message.flags });
});

// ── Staff (Chat Monitoring, read only) ──────────────────────────────────────

/** Patient–doctor pairs with a consultation in this stage right now. */
async function pairsIn(stage: "live" | "follow_up") {
  const rows = await Consultation.find(stageFilter(stage)).select("patient doctor").lean();
  return rows.map((r) => ({ patient: r.patient, doctor: r.doctor }));
}

/**
 * Staff list of chats: type (free / consultation / follow_up), waiting for whom,
 * doctor, flagged, search. Stats: open, waiting for a doctor (and over 1 hour),
 * median first reply, flagged.
 */
export const listChats = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);
  const now = new Date();
  const [livePairs, followPairs] = await Promise.all([pairsIn("live"), pairsIn("follow_up")]);

  const parts: Record<string, unknown>[] = [{ messageCount: { $gt: 0 } }];
  const type = String(req.query.type ?? "");
  if (type === "consultation") parts.push(livePairs.length ? { $or: livePairs } : { _id: null });
  if (type === "follow_up") parts.push(followPairs.length ? { $or: followPairs } : { _id: null });
  if (type === "free" && livePairs.length + followPairs.length) parts.push({ $nor: [...livePairs, ...followPairs] });
  if (req.query.waiting === "doctor") parts.push({ lastSenderRole: "patient" });
  if (req.query.waiting === "patient") parts.push({ lastSenderRole: "doctor" });
  if (req.query.doctorId) parts.push({ doctor: String(req.query.doctorId) });
  if (req.query.flagged === "true") parts.push({ flaggedCount: { $gt: 0 } });
  const search = String(req.query.search ?? "").trim();
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    const users = await User.find({ $or: [{ fullName: pattern }, { phone: pattern }] }).distinct("_id");
    const doctors = await Doctor.find({ user: { $in: users } }).distinct("_id");
    parts.push({ $or: [{ patient: { $in: users } }, { doctor: { $in: doctors } }, { lastMessageText: pattern }] });
  }
  const filter = parts.length === 1 ? parts[0] : { $and: parts };

  const hourAgo = new Date(now.getTime() - 3_600_000);
  const [chats, total, open, waiting, waitingLong, flagged, replyRows, doctorIds] = await Promise.all([
    Chat.find(filter)
      .sort({ lastMessageAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("patient", "fullName phone avatar")
      .populate({ path: "doctor", select: "title specialization user", populate: { path: "user", select: "fullName avatar" } }),
    Chat.countDocuments(filter),
    Chat.countDocuments({ messageCount: { $gt: 0 } }),
    Chat.countDocuments({ messageCount: { $gt: 0 }, lastSenderRole: "patient" }),
    Chat.countDocuments({ messageCount: { $gt: 0 }, lastSenderRole: "patient", lastMessageAt: { $lt: hourAgo } }),
    Chat.countDocuments({ flaggedCount: { $gt: 0 } }),
    Chat.find({ firstReplyAt: { $exists: true } }).sort({ firstReplyAt: -1 }).limit(500).select("firstMessageAt firstReplyAt").lean(),
    Chat.distinct("doctor", { messageCount: { $gt: 0 } }),
  ]);

  const minutes = replyRows
    .filter((r) => r.firstMessageAt && r.firstReplyAt)
    .map((r) => Math.round((r.firstReplyAt!.getTime() - r.firstMessageAt!.getTime()) / 60_000))
    .sort((a, b) => a - b);
  const doctors = await Doctor.find({ _id: { $in: doctorIds } })
    .select("user")
    .populate<{ user: { fullName?: string } | null }>("user", "fullName");
  // Populated or not, the id is the same.
  const idOf = (v: unknown) => String((v as { _id?: unknown } | null)?._id ?? v);
  const key = (p: { patient: unknown; doctor: unknown }) => `${idOf(p.patient)}|${idOf(p.doctor)}`;
  const live = new Set(livePairs.map(key));
  const follow = new Set(followPairs.map(key));
  const typeOf = (c: IChat): ChatType => (live.has(key(c)) ? "consultation" : follow.has(key(c)) ? "follow_up" : "free");

  return ApiResponse(res, 200, "Chats fetched successfully", {
    chats: chats.map((c) => ({ ...(c.toJSON() as Record<string, unknown>), type: typeOf(c) })),
    pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
    stats: {
      open,
      waitingDoctor: waiting,
      waitingOverHour: waitingLong,
      flagged,
      medianFirstReplyMinutes: minutes.length ? minutes[Math.floor(minutes.length / 2)] : null,
    },
    doctors: doctors.map((d) => ({ _id: d._id, name: d.user?.fullName ?? "Doctor" })).sort((a, b) => a.name.localeCompare(b.name)),
  });
});

/** Staff: one chat with all its messages, read only. Doesn't mark anything read. */
export const getChatForStaff = asyncHandler(async (req: Request, res: Response) => {
  const chat = await Chat.findById(req.params.id)
    .populate("patient", "fullName phone avatar")
    .populate({ path: "doctor", select: "title specialization user", populate: { path: "user", select: "fullName avatar" } });
  if (!chat) throw new ApiError(404, "Chat not found");
  const doctorId = (chat.doctor as unknown as { _id: mongoose.Types.ObjectId })._id;
  const patientId = (chat.patient as unknown as { _id: mongoose.Types.ObjectId })._id;
  const [messages, open, consultation] = await Promise.all([
    ChatMessage.find({ chat: chat._id }).sort({ createdAt: 1 }).limit(1000).select("senderRole text flags createdAt"),
    openConsultation(patientId, doctorId),
    Consultation.findOne({ patient: patientId, doctor: doctorId }).sort({ startsAt: -1 }).select("reference startsAt status"),
  ]);
  return ApiResponse(res, 200, "Chat fetched successfully", { chat, messages, type: open?.type ?? "free", consultation });
});
