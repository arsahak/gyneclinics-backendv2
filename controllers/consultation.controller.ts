import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { Consultation } from "../models/consultation.model";
import { Doctor } from "../models/doctor.model";
import { User } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { CONSULTATION_STAGES, consultationTimes, stageFilter, stageOf, type ConsultationStage } from "../utils/consultationStage";
import { bookableDoctor, newBookingReference, saveBooking } from "../utils/booking";
import { getFees } from "../utils/money";
import { REGION_IDS, regionalFee, type RegionId } from "../utils/regions";

/**
 * A free booking (the doctor's fee is 0): nothing to pay, so it's saved now.
 * Paid bookings go through Stripe: POST /consultations/checkout, then confirm.
 */
export const createConsultation = asyncHandler(async (req: Request, res: Response) => {
  const patient = req.user!;
  const b = req.body;
  const { doctor, doctorUser } = await bookableDoctor(b.doctorId);
  const regionId = (REGION_IDS as string[]).includes(b.regionId) ? (b.regionId as RegionId) : "europe";
  const fee = regionalFee(doctor.feeGBP, regionId, (await getFees()).regionMultipliers);
  if (fee.amount > 0) throw new ApiError(402, "This consultation needs payment. Please pay to book it.");

  const startsAt: Date = b.mode === "instant" ? new Date() : b.startsAt;
  if (b.mode === "scheduled" && startsAt.getTime() < Date.now() - 5 * 60_000) {
    throw new ApiError(422, "That time has already passed. Please pick another slot");
  }

  try {
    const { consultation, sms } = await saveBooking({
      reference: b.reference ?? (await newBookingReference()),
      patient,
      doctor,
      doctorUser,
      mode: b.mode,
      concern: b.concern,
      startsAt,
      timezone: b.timezone,
      payment: { amount: 0, currency: fee.currency, regionId, method: "free", reference: "FREE", provider: "free", paidAt: new Date() },
    });
    return ApiResponse(res, 201, "Consultation booked", { consultation, sms });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new ApiError(409, "This booking was already saved");
    throw error;
  }
});

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const SORTS: Record<string, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  starts_soon: { startsAt: 1 },
  starts_latest: { startsAt: -1 },
};

/**
 * Staff list: every booking with the patient, the doctor and where it is now.
 * Filters: stage, mode, doctor, search (reference, concern, patient or doctor
 * name/phone). Also returns a count per stage and the doctors that have bookings.
 */
export const listConsultations = asyncHandler(async (req: Request, res: Response) => {
  const now = new Date();
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const stage = String(req.query.stage ?? "all");
  const sort = SORTS[String(req.query.sort ?? "newest")] ?? SORTS.newest;
  const search = String(req.query.search ?? "").trim();

  const parts: Record<string, unknown>[] = [];
  if (stage !== "all") parts.push(stageFilter(stage as ConsultationStage, now));
  if (req.query.mode) parts.push({ mode: String(req.query.mode) });
  if (req.query.doctorId) parts.push({ doctor: String(req.query.doctorId) });
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    const [patients, doctorUsers] = await Promise.all([
      User.find({ role: "patient", $or: [{ fullName: pattern }, { phone: pattern }] }).distinct("_id"),
      User.find({ role: "doctor", fullName: pattern }).distinct("_id"),
    ]);
    const doctors = doctorUsers.length ? await Doctor.find({ user: { $in: doctorUsers } }).distinct("_id") : [];
    parts.push({
      $or: [{ reference: pattern }, { concern: pattern }, { "payment.reference": pattern }, { patient: { $in: patients } }, { doctor: { $in: doctors } }],
    });
  }
  const filter = parts.length === 0 ? {} : parts.length === 1 ? parts[0] : { $and: parts };

  const [items, total, stageCounts, doctorIds] = await Promise.all([
    Consultation.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("patient", "fullName phone avatar")
      .populate({ path: "doctor", select: "title specialization feeGBP user", populate: { path: "user", select: "fullName avatar" } }),
    Consultation.countDocuments(filter),
    Promise.all(CONSULTATION_STAGES.map((s) => Consultation.countDocuments(stageFilter(s, now)))),
    Consultation.distinct("doctor"),
  ]);

  const doctors = await Doctor.find({ _id: { $in: doctorIds } })
    .select("user")
    .populate("user", "fullName");

  const consultations = items.map((c) => {
    const json = c.toJSON() as Record<string, unknown>;
    return { ...json, stage: stageOf(c, now), ...consultationTimes(c.startsAt) };
  });

  return ApiResponse(res, 200, "Consultations fetched successfully", {
    consultations,
    pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
    stats: {
      total: stageCounts.reduce((sum, n) => sum + n, 0),
      ...Object.fromEntries(CONSULTATION_STAGES.map((s, i) => [s, stageCounts[i]])),
    },
    doctors: doctors
      .map((d) => ({ _id: d._id, name: (d.user as unknown as { fullName?: string } | null)?.fullName ?? "Doctor" }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  });
});
