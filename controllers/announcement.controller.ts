import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../middleware/asyncHandler";
import { Announcement, type AnnouncementAudience, type AnnouncementStatus, type IAnnouncement } from "../models/announcement.model";
import { Doctor } from "../models/doctor.model";
import { Notification } from "../models/notification.model";
import { User } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { linkFor, notify } from "../utils/notify";
import { COUNTRY_REGION, REGION_IDS, type RegionId } from "../utils/regions";

// Announcements go to each person's in-app inbox. Push and SMS are stored as
// wanted channels; push isn't connected yet and SMS is paused (Twilio), so
// today only the in-app part is delivered.

const DAY = 86_400_000;

/** Active patients and/or approved, active doctors — optionally in one region. */
async function recipients(audience: AnnouncementAudience, region?: RegionId) {
  const countries = region ? { country: { $in: COUNTRY_REGION[region] } } : {};
  const people: { _id: mongoose.Types.ObjectId; role: "patient" | "doctor" }[] = [];
  if (audience !== "doctors") {
    const patients = await User.find({ role: "patient", isActive: true, ...countries }).select("_id").lean();
    people.push(...patients.map((p) => ({ _id: p._id as mongoose.Types.ObjectId, role: "patient" as const })));
  }
  if (audience !== "patients") {
    const approved = await Doctor.find({ verificationStatus: "approved" }).distinct("user");
    const doctors = await User.find({ _id: { $in: approved }, role: "doctor", isActive: true, ...countries }).select("_id").lean();
    people.push(...doctors.map((d) => ({ _id: d._id as mongoose.Types.ObjectId, role: "doctor" as const })));
  }
  return people;
}

/** Delivers to inboxes and records the reach. */
async function deliver(a: IAnnouncement) {
  const people = await recipients(a.audience, a.region);
  const byRole = { patient: people.filter((p) => p.role === "patient"), doctor: people.filter((p) => p.role === "doctor") };
  for (const role of ["patient", "doctor"] as const) {
    if (byRole[role].length) {
      await notify(
        byRole[role].map((p) => p._id),
        { title: a.title, body: a.body, link: linkFor(a.link, role), announcement: a._id as mongoose.Types.ObjectId }
      );
    }
  }
  a.reach = people.length;
  await a.save();
  return a;
}

/**
 * Sends scheduled announcements whose time has come. Called when inboxes and
 * the staff list are read; claiming each one first means it's sent only once.
 */
export async function dispatchDueAnnouncements() {
  const now = new Date();
  for (;;) {
    const due = await Announcement.findOneAndUpdate({ status: "scheduled", scheduledAt: { $lte: now } }, { status: "sent", sentAt: now }, { new: true });
    if (!due) break;
    await deliver(due);
  }
}

/** How many people each audience reaches now, also per region (for the composer). */
export const getAudience = asyncHandler(async (_req: Request, res: Response) => {
  const approved = await Doctor.find({ verificationStatus: "approved" }).distinct("user");
  const [patients, doctors, patientCountries, doctorCountries] = await Promise.all([
    User.countDocuments({ role: "patient", isActive: true }),
    User.countDocuments({ _id: { $in: approved }, role: "doctor", isActive: true }),
    User.aggregate<{ _id: string; n: number }>([{ $match: { role: "patient", isActive: true } }, { $group: { _id: "$country", n: { $sum: 1 } } }]),
    User.aggregate<{ _id: string; n: number }>([{ $match: { _id: { $in: approved }, role: "doctor", isActive: true } }, { $group: { _id: "$country", n: { $sum: 1 } } }]),
  ]);
  const perRegion = (rows: { _id: string; n: number }[]) =>
    Object.fromEntries(REGION_IDS.map((id) => [id, rows.filter((r) => COUNTRY_REGION[id].includes(String(r._id ?? "").toUpperCase())).reduce((s, r) => s + r.n, 0)]));
  return ApiResponse(res, 200, "Audience fetched successfully", {
    patients,
    doctors,
    regions: { patients: perRegion(patientCountries), doctors: perRegion(doctorCountries) },
  });
});

/** Staff list (newest first; scheduled ones by their time) with 30-day stats and open rates. */
export const listAnnouncements = asyncHandler(async (req: Request, res: Response) => {
  await dispatchDueAnnouncements();
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 8);
  const status = String(req.query.status ?? "all");
  const filter: Record<string, unknown> = status === "all" ? {} : { status };

  const monthAgo = new Date(Date.now() - 30 * DAY);
  const [items, total, counts, recent] = await Promise.all([
    Announcement.aggregate<{ _id: mongoose.Types.ObjectId }>([
      { $match: filter },
      { $addFields: { at: { $ifNull: ["$sentAt", { $ifNull: ["$scheduledAt", "$createdAt"] }] } } },
      { $sort: { at: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      { $project: { _id: 1 } },
    ]),
    Announcement.countDocuments(filter),
    Announcement.aggregate<{ _id: AnnouncementStatus; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    Announcement.find({ status: "sent", sentAt: { $gte: monthAgo } }).select("_id reach").lean(),
  ]);

  const ids = items.map((x) => x._id);
  const [docs, opened, openedRecent] = await Promise.all([
    Announcement.find({ _id: { $in: ids } }).populate("createdBy", "fullName"),
    Notification.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
      { $match: { announcement: { $in: ids }, readAt: { $exists: true } } },
      { $group: { _id: "$announcement", n: { $sum: 1 } } },
    ]),
    Notification.countDocuments({ announcement: { $in: recent.map((r) => r._id) }, readAt: { $exists: true } }),
  ]);
  const reach30 = recent.reduce((s, r) => s + (r.reach ?? 0), 0);
  const count = (s: AnnouncementStatus) => counts.find((c) => c._id === s)?.n ?? 0;

  return ApiResponse(res, 200, "Announcements fetched successfully", {
    announcements: ids
      .map((id) => docs.find((d) => String(d._id) === String(id)))
      .filter((d): d is NonNullable<typeof d> => Boolean(d))
      .map((d) => {
        const n = opened.find((o) => String(o._id) === String(d._id))?.n ?? 0;
        return { ...(d.toJSON() as Record<string, unknown>), opened: n, openRate: d.status === "sent" && d.reach ? n / d.reach : null };
      }),
    pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
    stats: {
      sent30d: recent.length,
      reach30d: reach30,
      openRate30d: reach30 ? openedRecent / reach30 : null,
      sent: count("sent"),
      scheduled: count("scheduled"),
      drafts: count("draft"),
      cancelled: count("cancelled"),
      total: counts.reduce((s, c) => s + c.n, 0),
    },
  });
});

/** Send now, schedule, or save as a draft. `fromDraft` removes the draft it came from. */
export const createAnnouncement = asyncHandler(async (req: Request, res: Response) => {
  const b = req.body;
  const action = b.action as "send" | "schedule" | "draft";
  if (action === "schedule" && new Date(b.scheduledAt) <= new Date()) throw new ApiError(422, "Choose a time in the future");

  const announcement = await Announcement.create({
    title: String(b.title).trim(),
    body: String(b.body ?? "").trim(),
    audience: b.audience,
    region: b.audience !== "doctors" || b.region ? b.region || undefined : undefined,
    channels: b.channels,
    link: b.link || undefined,
    status: action === "send" ? "sent" : action === "schedule" ? "scheduled" : "draft",
    scheduledAt: action === "schedule" ? new Date(b.scheduledAt) : undefined,
    sentAt: action === "send" ? new Date() : undefined,
    createdBy: req.user!._id,
  });
  if (action === "send") await deliver(announcement);
  if (b.fromDraft) await Announcement.deleteOne({ _id: b.fromDraft, status: "draft" });

  const messages = { send: `Sent to ${announcement.reach} ${announcement.reach === 1 ? "person" : "people"}`, schedule: "Scheduled", draft: "Draft saved" };
  return ApiResponse(res, 201, messages[action], announcement);
});

export const cancelAnnouncement = asyncHandler(async (req: Request, res: Response) => {
  const a = await Announcement.findOneAndUpdate({ _id: req.params.id, status: "scheduled" }, { status: "cancelled" }, { new: true });
  if (!a) throw new ApiError(409, "Only a scheduled announcement can be cancelled");
  return ApiResponse(res, 200, "Scheduled announcement cancelled", a);
});

/** Drafts and cancelled ones can be removed; sent ones stay as a record. */
export const deleteAnnouncement = asyncHandler(async (req: Request, res: Response) => {
  const a = await Announcement.findOneAndDelete({ _id: req.params.id, status: { $in: ["draft", "cancelled"] } });
  if (!a) throw new ApiError(409, "Only drafts and cancelled announcements can be deleted");
  return ApiResponse(res, 200, "Deleted");
});
