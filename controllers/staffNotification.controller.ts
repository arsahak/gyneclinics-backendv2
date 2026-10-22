import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../middleware/asyncHandler";
import { StaffNotification } from "../models/staffNotification.model";
import { createStaffRealtimeTicket, emitStaffUnread } from "../realtime/messagesRealtime";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";

// The dashboard bell: your own notifications, newest first.

const unreadOf = (userId: unknown) => StaffNotification.countDocuments({ user: userId, readAt: { $exists: false } });

/** GET /staff-notifications?filter=all|unread&page&limit */
export const listMine = asyncHandler(async (req: Request, res: Response) => {
  const me = req.user!._id;
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 15);
  const filter: Record<string, unknown> = { user: me };
  if (req.query.filter === "unread") filter.readAt = { $exists: false };
  const [items, total, unread] = await Promise.all([
    StaffNotification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    StaffNotification.countDocuments(filter),
    unreadOf(me),
  ]);
  return ApiResponse(res, 200, "Notifications fetched successfully", {
    notifications: items,
    unread,
    pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)), hasMore: page * limit < total },
  });
});

/** PATCH /staff-notifications/:id { read: true | false } */
export const setRead = asyncHandler(async (req: Request, res: Response) => {
  const me = req.user!._id;
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, "Notification not found");
  const read = req.body.read !== false;
  const n = await StaffNotification.findOneAndUpdate(
    { _id: req.params.id, user: me },
    read ? { $set: { readAt: new Date() } } : { $unset: { readAt: 1 } },
    { new: true }
  );
  if (!n) throw new ApiError(404, "Notification not found");
  const unread = await unreadOf(me);
  emitStaffUnread(String(me), unread);
  return ApiResponse(res, 200, read ? "Marked as read" : "Marked as unread", { notification: n, unread });
});

/** PATCH /staff-notifications/read-all */
export const readAll = asyncHandler(async (req: Request, res: Response) => {
  const me = req.user!._id;
  const result = await StaffNotification.updateMany({ user: me, readAt: { $exists: false } }, { $set: { readAt: new Date() } });
  emitStaffUnread(String(me), 0);
  return ApiResponse(res, 200, result.modifiedCount ? `Marked ${result.modifiedCount} as read` : "Nothing unread", { unread: 0 });
});

/** POST /staff-notifications/ticket — a 15-minute ticket for the live socket (socket.io, path /socket.io). */
export const realtimeTicket = asyncHandler(async (req: Request, res: Response) => {
  return ApiResponse(res, 200, "Ticket issued", { ticket: createStaffRealtimeTicket(String(req.user!._id)), path: "/socket.io", event: "staff:notification" });
});
