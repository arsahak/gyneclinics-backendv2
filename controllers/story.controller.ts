import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../middleware/asyncHandler";
import { Story, type StoryStatus } from "../models/story.model";
import { User } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { deleteStoredFile, uploadImage } from "../utils/storage";
import { linkFor, notify } from "../utils/notify";
import { alertStaff, moneyText } from "../utils/staffAlerts";

const SORTS: Record<string, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  title_asc: { title: 1 },
  title_desc: { title: -1 },
};

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const withPeople = (id: unknown) =>
  Story.findById(id).populate("patient", "fullName phone").populate("reviewedBy", "fullName");

async function storyOr404(id: string) {
  const story = await Story.findById(id);
  if (!story) throw new ApiError(404, "Story not found");
  return story;
}

// ── Patients ────────────────────────────────────────────────────────────────

/** A patient shares a story. It waits for review. Optional "image" file. */
export const createStory = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const b = req.body;
  const story = new Story({
    title: b.title,
    body: b.body,
    topic: b.topic,
    anonymous: b.anonymous ?? true,
    // Shown only when not anonymous; defaults to their account name.
    authorName: (b.authorName || user.fullName || "").trim() || undefined,
    patient: user._id,
  });
  if (req.file) {
    const stored = await uploadImage(req.file, "stories");
    story.imageUrl = stored.url;
    story.imageKey = stored.key;
  }
  try {
    await story.save();
  } catch (error) {
    await deleteStoredFile(story.imageKey);
    throw error;
  }
  await alertStaff({
    type: "story_submitted",
    areas: ["stories"],
    title: "Story to review",
    body: `"${story.title}" by ${story.anonymous ? "an anonymous patient" : story.authorName || "a patient"}.`,
    link: "/stories",
  });
  return ApiResponse(res, 201, "Thank you. Your story will be reviewed before it's published.", story);
});

/** The signed-in patient's own stories, with their review status. */
export const listMyStories = asyncHandler(async (req: Request, res: Response) => {
  const stories = await Story.find({ patient: req.user!._id }).sort({ createdAt: -1 }).select("-body").limit(100);
  return ApiResponse(res, 200, "Stories fetched successfully", stories);
});

// ── Everyone signed in: the Learn feed ──────────────────────────────────────

const FEED_FIELDS = "title body topic anonymous authorName imageUrl publishedAt createdAt";

/** Approved stories, newest first. */
export const listFeedStories = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 50);
  const filter = { status: "approved" };
  const [stories, total] = await Promise.all([
    Story.find(filter).select(FEED_FIELDS).sort({ publishedAt: -1 }).skip((page - 1) * limit).limit(limit),
    Story.countDocuments(filter),
  ]);
  return ApiResponse(res, 200, "Stories fetched successfully", {
    stories,
    pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

export const getFeedStory = asyncHandler(async (req: Request, res: Response) => {
  const story = await Story.findOne({ _id: req.params.id, status: "approved" }).select(FEED_FIELDS);
  if (!story) throw new ApiError(404, "Story not found");
  return ApiResponse(res, 200, "Story fetched successfully", story);
});

// ── Staff ───────────────────────────────────────────────────────────────────

export const listStories = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const status = String(req.query.status ?? "all");
  const sort = SORTS[String(req.query.sort ?? "newest")] ?? SORTS.newest;
  const search = String(req.query.search ?? "").trim();

  const filter: Record<string, unknown> = {};
  if (status !== "all") filter.status = status;
  if (req.query.topic) filter.topic = String(req.query.topic);
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    const patients = await User.find({ role: "patient", $or: [{ fullName: pattern }, { phone: pattern }] }).distinct("_id");
    filter.$or = [{ title: pattern }, { body: pattern }, { authorName: pattern }, { patient: { $in: patients } }];
  }

  const [stories, total, counts] = await Promise.all([
    Story.find(filter)
      .sort(sort)
      .collation({ locale: "en" })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("patient", "fullName phone"),
    Story.countDocuments(filter),
    Story.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
  ]);
  const count = (s: string) => counts.find((c) => c._id === s)?.n ?? 0;

  return ApiResponse(res, 200, "Stories fetched successfully", {
    stories,
    pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
    stats: {
      total: counts.reduce((sum, c) => sum + c.n, 0),
      pending: count("pending"),
      approved: count("approved"),
      rejected: count("rejected"),
      hidden: count("hidden"),
    },
  });
});

export const getStory = asyncHandler(async (req: Request, res: Response) => {
  const story = await withPeople(req.params.id);
  if (!story) throw new ApiError(404, "Story not found");
  return ApiResponse(res, 200, "Story fetched successfully", story);
});

/** Staff corrections. Send only what changes. */
export const updateStory = asyncHandler(async (req: Request, res: Response) => {
  const story = await storyOr404(req.params.id);
  const b = req.body;
  for (const key of ["title", "body", "topic", "anonymous"] as const) if (b[key] !== undefined) story.set(key, b[key]);
  if (b.authorName !== undefined) story.authorName = String(b.authorName).trim() || undefined;
  if (b.imageUrl !== undefined && b.imageUrl !== story.imageUrl) {
    // A replaced or removed upload is deleted from storage.
    await deleteStoredFile(story.imageKey);
    story.imageKey = undefined;
    story.imageUrl = b.imageUrl ? String(b.imageUrl).trim() : undefined;
  }
  await story.save();
  return ApiResponse(res, 200, "Story updated", await withPeople(story._id));
});

const STATUS_MESSAGES: Record<StoryStatus, string> = {
  approved: "Approved: it now shows in Learn",
  rejected: "Story rejected",
  hidden: "Hidden from Learn",
  pending: "Moved back to review",
};

/** Approve, reject (optional reason the patient sees), hide or move back to pending. */
export const setStoryStatus = asyncHandler(async (req: Request, res: Response) => {
  const story = await storyOr404(req.params.id);
  const status = req.body.status as StoryStatus;
  story.status = status;
  story.rejectionReason = status === "rejected" ? req.body.reason || undefined : undefined;
  if (status === "pending") {
    story.reviewedBy = undefined;
    story.reviewedAt = undefined;
  } else {
    story.reviewedBy = req.user!._id as mongoose.Types.ObjectId;
    story.reviewedAt = new Date();
  }
  if (status === "approved" && !story.publishedAt) story.publishedAt = new Date();
  await story.save();
  if (status === "approved" || status === "rejected") {
    await notify([story.patient], {
      autoKey: "story_reviewed",
      title: status === "approved" ? "Your story is live" : "Your story wasn't published",
      body:
        status === "approved"
          ? `Your story "${story.title}" is now live in Learn. Thank you for sharing.`
          : `Your story "${story.title}" wasn't published.${story.rejectionReason ? ` ${story.rejectionReason}` : ""} You can edit it and send it again.`,
      link: linkFor(status === "approved" ? "learn" : "share_story", "patient"),
    });
  }
  return ApiResponse(res, 200, STATUS_MESSAGES[status], await withPeople(story._id));
});

export const deleteStory = asyncHandler(async (req: Request, res: Response) => {
  const story = await storyOr404(req.params.id);
  await story.deleteOne();
  await deleteStoredFile(story.imageKey);
  return ApiResponse(res, 200, "Story deleted");
});
