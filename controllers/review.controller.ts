import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../middleware/asyncHandler";
import { Consultation } from "../models/consultation.model";
import { Doctor } from "../models/doctor.model";
import { Review, type ReviewStatus } from "../models/review.model";
import { User } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { describeBlocked, scanForContactDetails } from "../utils/contactGuard";
import { alertStaff, moneyText } from "../utils/staffAlerts";

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Keeps the doctor's rating and review count in step with their published reviews. */
export async function refreshDoctorRating(doctorId: mongoose.Types.ObjectId | string) {
  const [row] = await Review.aggregate<{ avg: number; n: number }>([
    { $match: { doctor: new mongoose.Types.ObjectId(String(doctorId)), status: "published" } },
    { $group: { _id: null, avg: { $avg: "$rating" }, n: { $sum: 1 } } },
  ]);
  await Doctor.updateOne({ _id: doctorId }, { rating: row ? round1(row.avg) : 0, reviewCount: row?.n ?? 0 });
}

// ── Patients ────────────────────────────────────────────────────────────────

/**
 * A patient reviews a doctor they've had a consultation with (once per doctor).
 * 1–2 stars wait for a team check before they show.
 */
export const createReview = asyncHandler(async (req: Request, res: Response) => {
  const patient = req.user!;
  const { doctorId, rating } = req.body as { doctorId: string; rating: number };
  const text = String(req.body.text).trim();

  const blocked = scanForContactDetails(text);
  if (blocked.length) throw new ApiError(422, describeBlocked(blocked));

  const doctor = await Doctor.findById(doctorId).populate<{ user: { fullName?: string } | null }>("user", "fullName");
  if (!doctor) throw new ApiError(404, "Doctor not found");
  const name = doctor.user?.fullName || "this doctor";

  const consultation = await Consultation.findOne({
    patient: patient._id,
    doctor: doctor._id,
    status: { $in: ["confirmed", "completed"] },
    startsAt: { $lte: new Date() },
  }).sort({ startsAt: -1 });
  if (!consultation) throw new ApiError(403, `You can review ${name} after a consultation with them.`);

  if (await Review.exists({ doctor: doctor._id, patient: patient._id })) {
    throw new ApiError(409, `You've already reviewed ${name}.`);
  }

  const held = rating <= 2;
  const review = await Review.create({
    doctor: doctor._id,
    patient: patient._id,
    consultation: consultation._id,
    rating,
    text,
    status: held ? "held" : "published",
    holdReason: held ? "low_rating" : undefined,
  });
  if (!held) await refreshDoctorRating(doctor._id);
  else {
    await alertStaff({
      type: "review_held",
      areas: ["reviews"],
      title: `${rating}-star review on hold`,
      body: `${patient.fullName || "A patient"} rated ${name} ${rating}/5${text ? `: "${String(text).slice(0, 120)}"` : ""}. Check it before it appears.`,
      link: "/doctor-reviews",
    });
  }

  return ApiResponse(
    res,
    201,
    held ? "Thank you. We check 1 and 2 star reviews before they appear, usually within a day." : "Thank you. Your review is now on the doctor's profile.",
    review
  );
});

/** Published reviews of one doctor (any signed-in user), newest first. Authors stay anonymous. */
export const listDoctorReviews = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);
  const doctor = req.params.doctorId;
  const filter = { doctor, status: "published" };

  const [reviews, total, mine] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).select("rating text createdAt"),
    Review.countDocuments(filter),
    // The signed-in patient's own review, even while it waits for a check.
    Review.findOne({ doctor, patient: req.user!._id }).select("rating text status createdAt"),
  ]);

  return ApiResponse(res, 200, "Reviews fetched successfully", {
    reviews: reviews.map((r) => ({ _id: r._id, rating: r.rating, text: r.text, createdAt: r.createdAt, author: "Verified patient" })),
    mine: mine ? { _id: mine._id, rating: mine.rating, text: mine.text, status: mine.status, createdAt: mine.createdAt } : null,
    pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

// ── Staff ───────────────────────────────────────────────────────────────────

/** Staff list with filters, plus the rating breakdown and each doctor's average. */
export const listReviews = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const status = String(req.query.status ?? "all");
  const search = String(req.query.search ?? "").trim();

  const filter: Record<string, unknown> = {};
  if (status !== "all") filter.status = status;
  if (req.query.doctorId) filter.doctor = String(req.query.doctorId);
  if (req.query.rating) filter.rating = Number(req.query.rating);
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    const [patients, doctorUsers] = await Promise.all([
      User.find({ role: "patient", $or: [{ fullName: pattern }, { phone: pattern }] }).distinct("_id"),
      User.find({ role: "doctor", fullName: pattern }).distinct("_id"),
    ]);
    const doctors = doctorUsers.length ? await Doctor.find({ user: { $in: doctorUsers } }).distinct("_id") : [];
    filter.$or = [{ text: pattern }, { patient: { $in: patients } }, { doctor: { $in: doctors } }];
  }

  const [reviews, total, statusCounts, ratingCounts, doctorRows] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("patient", "fullName phone avatar")
      .populate("consultation", "reference startsAt")
      .populate("reviewedBy", "fullName")
      .populate({ path: "doctor", select: "title specialization rating reviewCount user", populate: { path: "user", select: "fullName avatar" } }),
    Review.countDocuments(filter),
    Review.aggregate<{ _id: ReviewStatus; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    Review.aggregate<{ _id: number; n: number }>([{ $match: { status: "published" } }, { $group: { _id: "$rating", n: { $sum: 1 } } }]),
    Review.aggregate<{ _id: mongoose.Types.ObjectId; avg: number; n: number; all: number }>([
      {
        $group: {
          _id: "$doctor",
          avg: { $avg: { $cond: [{ $eq: ["$status", "published"] }, "$rating", null] } },
          n: { $sum: { $cond: [{ $eq: ["$status", "published"] }, 1, 0] } },
          all: { $sum: 1 },
        },
      },
    ]),
  ]);

  const doctorNames = await Doctor.find({ _id: { $in: doctorRows.map((d) => d._id) } })
    .select("user")
    .populate<{ user: { fullName?: string; avatar?: string } | null }>("user", "fullName avatar");
  const count = (s: ReviewStatus) => statusCounts.find((c) => c._id === s)?.n ?? 0;
  const published = ratingCounts.reduce((sum, r) => sum + r.n, 0);
  const average = published ? round1(ratingCounts.reduce((sum, r) => sum + r._id * r.n, 0) / published) : 0;

  return ApiResponse(res, 200, "Reviews fetched successfully", {
    reviews,
    pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
    stats: {
      total: statusCounts.reduce((sum, c) => sum + c.n, 0),
      published: count("published"),
      held: count("held"),
      hidden: count("hidden"),
      average,
      byRating: Object.fromEntries([5, 4, 3, 2, 1].map((n) => [n, ratingCounts.find((r) => r._id === n)?.n ?? 0])),
    },
    doctors: doctorRows
      .map((row) => {
        const d = doctorNames.find((x) => String(x._id) === String(row._id));
        return { _id: row._id, name: d?.user?.fullName ?? "Doctor removed", avatar: d?.user?.avatar, average: row.avg ? round1(row.avg) : 0, published: row.n, total: row.all };
      })
      .sort((a, b) => b.average - a.average || b.published - a.published),
  });
});

/** Publish, hold or hide (with a reason, for the team). The doctor's rating follows. */
export const setReviewStatus = asyncHandler(async (req: Request, res: Response) => {
  const review = await Review.findById(req.params.id);
  if (!review) throw new ApiError(404, "Review not found");
  const status = req.body.status as ReviewStatus;

  review.status = status;
  review.hiddenReason = status === "hidden" ? String(req.body.reason ?? "").trim() || "Hidden by the team" : undefined;
  if (status === "published") review.holdReason = undefined;
  review.reviewedBy = req.user!._id as mongoose.Types.ObjectId;
  review.reviewedAt = new Date();
  await review.save();
  await refreshDoctorRating(review.doctor);

  const messages: Record<ReviewStatus, string> = {
    published: "Published on the doctor's profile",
    held: "Held for a check",
    hidden: "Review hidden",
  };
  return ApiResponse(res, 200, messages[status], review);
});

export const deleteReview = asyncHandler(async (req: Request, res: Response) => {
  const review = await Review.findByIdAndDelete(req.params.id);
  if (!review) throw new ApiError(404, "Review not found");
  await refreshDoctorRating(review.doctor);
  return ApiResponse(res, 200, "Review deleted");
});
