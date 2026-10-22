import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../middleware/asyncHandler";
import { Notification } from "../models/notification.model";
import { NotificationSetting } from "../models/notificationSetting.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { AUTO_MESSAGES, disabledAutoKeys, forgetSettingsCache } from "../utils/notify";
import { createUserRealtimeTicket, emitUserUnread } from "../realtime/messagesRealtime";
import { dispatchDueAnnouncements } from "./announcement.controller";

const DAY = 86_400_000;

// ── Patients and doctors: the bell ──────────────────────────────────────────

/** Your notifications, newest first, with how many are unread. */
export const listMyNotifications = asyncHandler(async (req: Request, res: Response) => {
  await dispatchDueAnnouncements();
  const limit = Number(req.query.limit ?? 30);
  const [items, unread] = await Promise.all([
    Notification.find({ user: req.user!._id }).sort({ createdAt: -1 }).limit(limit).select("title body link readAt createdAt"),
    Notification.countDocuments({ user: req.user!._id, readAt: { $exists: false } }),
  ]);
  return ApiResponse(res, 200, "Notifications fetched successfully", { notifications: items, unread });
});

const unreadOf = (userId: unknown) => Notification.countDocuments({ user: userId, readAt: { $exists: false } });

export const markRead = asyncHandler(async (req: Request, res: Response) => {
  const n = await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user!._id }, { $set: { readAt: new Date() } }, { new: true });
  if (!n) throw new ApiError(404, "Notification not found");
  const unread = await unreadOf(req.user!._id);
  emitUserUnread(String(req.user!._id), unread);
  return ApiResponse(res, 200, "Marked as read", { _id: n._id, readAt: n.readAt, unread });
});

export const markAllRead = asyncHandler(async (req: Request, res: Response) => {
  const r = await Notification.updateMany({ user: req.user!._id, readAt: { $exists: false } }, { $set: { readAt: new Date() } });
  emitUserUnread(String(req.user!._id), 0);
  return ApiResponse(res, 200, "All marked as read", { updated: r.modifiedCount, unread: 0 });
});

/** A 15-minute ticket for live notifications (socket.io, event "notification:new"). */
export const notificationTicket = asyncHandler(async (req: Request, res: Response) => {
  return ApiResponse(res, 200, "Ticket issued", { ticket: createUserRealtimeTicket(String(req.user!._id)), path: "/socket.io" });
});

// ── Staff: automatic messages ───────────────────────────────────────────────

/** Every automatic message with its on/off state and how many went out this week. */
export const listAutoMessages = asyncHandler(async (_req: Request, res: Response) => {
  const off = await disabledAutoKeys();
  const weekAgo = new Date(Date.now() - 7 * DAY);
  const sent = await Notification.aggregate<{ _id: string; n: number }>([
    { $match: { autoKey: { $exists: true }, createdAt: { $gte: weekAgo } } },
    { $group: { _id: "$autoKey", n: { $sum: 1 } } },
  ]);
  return ApiResponse(
    res,
    200,
    "Automatic messages fetched successfully",
    AUTO_MESSAGES.map((m) => ({
      ...m,
      enabled: m.locked ? true : !off.has(m.key),
      sent7d: m.channels.includes("in_app") ? sent.find((s) => s._id === m.key)?.n ?? 0 : null,
    }))
  );
});

export const setAutoMessage = asyncHandler(async (req: Request, res: Response) => {
  const msg = AUTO_MESSAGES.find((m) => m.key === req.params.key);
  if (!msg) throw new ApiError(404, "Unknown automatic message");
  if (msg.locked) throw new ApiError(409, `${msg.name} can't be switched off`);
  const enabled = Boolean(req.body.enabled);
  await NotificationSetting.findOneAndUpdate(
    { key: msg.key },
    { enabled, updatedBy: req.user!._id as mongoose.Types.ObjectId },
    { upsert: true, new: true }
  );
  forgetSettingsCache();
  return ApiResponse(res, 200, `${msg.name} turned ${enabled ? "on" : "off"}`, { key: msg.key, enabled });
});
