import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { Patient } from "../models/patient.model";
import { BabyGrowthLog, PeriodLog, WeightLog } from "../models/tracker.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { seedFromProfile, syncProfileFromLogs } from "../utils/tracker";

// The signed-in patient's health logs (/tracker): periods, weight and baby
// growth. Each patient only ever sees and changes their own entries.

const MAX_ENTRIES = 1000;

/** Everything in one go, newest first. The onboarding answers are the first entries. */
export const getTracker = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!._id;
  const patient = await Patient.findOne({ user: userId });
  if (!patient) throw new ApiError(404, "Complete your profile first");
  await seedFromProfile(patient);

  const [periods, weights, babyGrowth] = await Promise.all([
    PeriodLog.find({ patient: userId }).sort({ start: -1 }).limit(MAX_ENTRIES),
    WeightLog.find({ patient: userId }).sort({ date: -1, createdAt: -1 }).limit(MAX_ENTRIES),
    BabyGrowthLog.find({ patient: userId }).sort({ week: -1 }).limit(MAX_ENTRIES),
  ]);
  return ApiResponse(res, 200, "Tracker fetched", { periods, weights, babyGrowth, reminders: patient.reminders });
});

/** Deletes every log entry (periods, weight, baby growth). The profile stays. */
export const clearTracker = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!._id;
  await Promise.all([PeriodLog.deleteMany({ patient: userId }), WeightLog.deleteMany({ patient: userId }), BabyGrowthLog.deleteMany({ patient: userId })]);
  await syncProfileFromLogs(userId);
  return ApiResponse(res, 200, "Your tracker data was deleted");
});

// ── Periods ─────────────────────────────────────────────────────────────────

const periodFields = (b: Record<string, unknown>) => ({
  start: b.start,
  end: b.end || undefined,
  flow: b.flow || undefined,
  symptoms: Array.isArray(b.symptoms) ? b.symptoms : [],
  note: typeof b.note === "string" && b.note.trim() ? b.note.trim() : undefined,
});

async function assertNoOtherPeriodOn(userId: unknown, start: string, exceptId?: string) {
  const clash = await PeriodLog.exists({ patient: userId, start, ...(exceptId && { _id: { $ne: exceptId } }) });
  if (clash) throw new ApiError(409, "You already logged a period starting that day");
}

export const addPeriod = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!._id;
  const fields = periodFields(req.body);
  await assertNoOtherPeriodOn(userId, String(fields.start));
  const period = await PeriodLog.create({ patient: userId, ...fields });
  await syncProfileFromLogs(userId);
  return ApiResponse(res, 201, "Period saved", period);
});

export const updatePeriod = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!._id;
  const period = await PeriodLog.findOne({ _id: req.params.id, patient: userId });
  if (!period) throw new ApiError(404, "Period not found");
  const fields = periodFields(req.body);
  await assertNoOtherPeriodOn(userId, String(fields.start), String(period._id));
  period.set(fields);
  // Fields left empty in the form are removed.
  for (const key of ["end", "flow", "note"] as const) if (fields[key] === undefined) period.set(key, undefined);
  await period.save();
  await syncProfileFromLogs(userId);
  return ApiResponse(res, 200, "Period updated", period);
});

export const deletePeriod = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!._id;
  const deleted = await PeriodLog.findOneAndDelete({ _id: req.params.id, patient: userId });
  if (!deleted) throw new ApiError(404, "Period not found");
  await syncProfileFromLogs(userId);
  return ApiResponse(res, 200, "Period deleted");
});

// ── Weight ──────────────────────────────────────────────────────────────────

export const addWeight = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!._id;
  const weight = await WeightLog.create({ patient: userId, date: req.body.date, kg: Math.round(req.body.kg * 10) / 10 });
  await syncProfileFromLogs(userId);
  return ApiResponse(res, 201, "Weight saved", weight);
});

export const deleteWeight = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!._id;
  const deleted = await WeightLog.findOneAndDelete({ _id: req.params.id, patient: userId });
  if (!deleted) throw new ApiError(404, "Weight entry not found");
  await syncProfileFromLogs(userId);
  return ApiResponse(res, 200, "Weight entry deleted");
});

// ── Baby growth ─────────────────────────────────────────────────────────────

export const addBabyGrowth = asyncHandler(async (req: Request, res: Response) => {
  const b = req.body;
  const entry = await BabyGrowthLog.create({ patient: req.user!._id, date: b.date, week: b.week, weightG: b.weightG, lengthCm: b.lengthCm });
  return ApiResponse(res, 201, "Scan saved", entry);
});

export const deleteBabyGrowth = asyncHandler(async (req: Request, res: Response) => {
  const deleted = await BabyGrowthLog.findOneAndDelete({ _id: req.params.id, patient: req.user!._id });
  if (!deleted) throw new ApiError(404, "Scan entry not found");
  return ApiResponse(res, 200, "Scan entry deleted");
});
