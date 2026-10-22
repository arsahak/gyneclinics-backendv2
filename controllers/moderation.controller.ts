import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../middleware/asyncHandler";
import { ChatFlag, FLAG_KINDS, type FlagKind, type FlagStatus } from "../models/chatFlag.model";
import { ChatMessage } from "../models/chatMessage.model";
import { User } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";

const DAY = 86_400_000;

/**
 * Chat Moderation queue: what the safety filter caught. Status "new" by
 * default (urgent health first). Each item has the sender, the recipient,
 * the last few messages before it and how often the sender was caught before.
 */
export const listFlags = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 8);
  const status = String(req.query.status ?? "new");

  const filter: Record<string, unknown> = {};
  if (status !== "all") filter.status = status;
  if (req.query.kind) filter.kind = String(req.query.kind);

  const monthAgo = new Date(Date.now() - 30 * DAY);
  const [ids, total, byKind, statusCounts, newUrgent] = await Promise.all([
    ChatFlag.aggregate<{ _id: mongoose.Types.ObjectId }>([
      { $match: filter },
      { $addFields: { urgentFirst: { $cond: [{ $and: [{ $eq: ["$kind", "urgent_health"] }, { $eq: ["$status", "new"] }] }, 0, 1] } } },
      { $sort: { urgentFirst: 1, createdAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      { $project: { _id: 1 } },
    ]),
    ChatFlag.countDocuments(filter),
    ChatFlag.aggregate<{ _id: FlagKind; n: number }>([{ $match: { createdAt: { $gte: monthAgo } } }, { $group: { _id: "$kind", n: { $sum: 1 } } }]),
    ChatFlag.aggregate<{ _id: FlagStatus; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    ChatFlag.countDocuments({ status: "new", kind: "urgent_health" }),
  ]);

  const docs = await ChatFlag.find({ _id: { $in: ids.map((x) => x._id) } })
    .populate("sender", "fullName phone avatar isActive")
    .populate("recipient", "fullName phone")
    .populate("handledBy", "fullName");
  const flags = await Promise.all(
    ids
      .map((x) => docs.find((d) => String(d._id) === String(x._id)))
      .filter((d): d is NonNullable<typeof d> => Boolean(d))
      .map(async (f) => {
        const senderId = (f.sender as unknown as { _id?: mongoose.Types.ObjectId } | null)?._id ?? f.sender;
        const [previousFlags, context] = await Promise.all([
          // Rule-breaking only: asking for urgent help is not held against anyone.
          ChatFlag.countDocuments({ sender: senderId, kind: { $ne: "urgent_health" }, createdAt: { $lt: f.createdAt } }),
          ChatMessage.find({ chat: f.chat, createdAt: { $lt: f.createdAt } }).sort({ createdAt: -1 }).limit(3).select("senderRole text createdAt"),
        ]);
        return { ...(f.toJSON() as Record<string, unknown>), previousFlags, context: context.reverse() };
      })
  );
  const kindCount = (k: FlagKind) => byKind.find((x) => x._id === k)?.n ?? 0;
  const statusCount = (s: FlagStatus) => statusCounts.find((x) => x._id === s)?.n ?? 0;

  return ApiResponse(res, 200, "Flags fetched successfully", {
    flags,
    pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
    stats: {
      new: statusCount("new"),
      newUrgent,
      warned: statusCount("warned"),
      suspended: statusCount("suspended"),
      escalated: statusCount("escalated"),
      allowed: statusCount("allowed"),
      total: statusCounts.reduce((s, x) => s + x.n, 0),
      last30Days: {
        ...Object.fromEntries(FLAG_KINDS.map((k) => [k, kindCount(k)])),
        blocked: kindCount("phone") + kindCount("email") + kindCount("link") + kindCount("social"),
      },
    },
  });
});

/**
 * Decide: allowed (false alarm), warned, suspended (the sender can't sign in
 * any more) or escalated (sent to the clinical lead).
 */
export const setFlagStatus = asyncHandler(async (req: Request, res: Response) => {
  const flag = await ChatFlag.findById(req.params.id);
  if (!flag) throw new ApiError(404, "Flag not found");
  const status = req.body.status as Exclude<FlagStatus, "new">;

  if (status === "suspended") {
    const sender = await User.findById(flag.sender);
    if (sender && sender.isActive) {
      sender.isActive = false;
      sender.suspensionReason = `Broke the chat rules (${flag.kind.replace("_", " ")})`;
      sender.suspendedAt = new Date();
      await sender.save();
    }
  }
  flag.status = status;
  flag.handledBy = req.user!._id as mongoose.Types.ObjectId;
  flag.handledAt = new Date();
  await flag.save();

  const messages: Record<typeof status, string> = {
    allowed: "Marked as a false alarm",
    warned: "Marked as warned",
    suspended: "Account suspended",
    escalated: "Sent to the clinical lead",
  };
  return ApiResponse(res, 200, messages[status], flag);
});
