import type mongoose from "mongoose";
import { Patient, type IPatient } from "../models/patient.model";
import { PeriodLog, WeightLog } from "../models/tracker.model";

// Keeps a patient's health logs and their profile in step:
//   - the last period and weight from onboarding become the first log entries;
//   - the profile's last period start and weight follow the newest log entry.

/** "yyyy-MM-dd" for a stored date (dates from the app are saved as UTC midnight). */
export const dayOf = (date: Date) => date.toISOString().slice(0, 10);

const addDays = (day: string, days: number) => dayOf(new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000));

/** A period starting on `start`, with an end only once the usual length has passed. */
function periodFrom(start: string, length: number) {
  const end = addDays(start, Math.max(1, length) - 1);
  return end < dayOf(new Date()) ? { start, end } : { start };
}

/**
 * First time the tracker is opened: turn the onboarding answers into log
 * entries. Runs once per patient (`trackerSeededAt`), so deleted entries
 * don't come back.
 */
export async function seedFromProfile(patient: IPatient) {
  if (patient.trackerSeededAt) return;
  const userId = patient.user;
  const [periods, weights] = await Promise.all([PeriodLog.countDocuments({ patient: userId }), WeightLog.countDocuments({ patient: userId })]);
  if (!periods && patient.lastPeriodStart) {
    await PeriodLog.create({ patient: userId, ...periodFrom(dayOf(patient.lastPeriodStart), patient.typicalPeriodLength) });
  }
  if (!weights && patient.weightKg) {
    await WeightLog.create({ patient: userId, date: dayOf(patient.onboardedAt ?? patient.createdAt ?? new Date()), kg: patient.weightKg });
  }
  patient.trackerSeededAt = new Date();
  await patient.save();
}

/** After a profile edit: a new last period start or weight is added to the logs too. */
export async function logProfileChanges(patient: IPatient, before: { lastPeriodStart?: Date; weightKg?: number }) {
  if (!patient.trackerSeededAt) return; // the first tracker visit picks them up
  const userId = patient.user;
  const start = patient.lastPeriodStart ? dayOf(patient.lastPeriodStart) : undefined;
  if (start && start !== (before.lastPeriodStart ? dayOf(before.lastPeriodStart) : undefined)) {
    const exists = await PeriodLog.exists({ patient: userId, start });
    if (!exists) await PeriodLog.create({ patient: userId, ...periodFrom(start, patient.typicalPeriodLength) });
  }
  if (patient.weightKg && patient.weightKg !== before.weightKg) {
    await WeightLog.findOneAndUpdate({ patient: userId, date: dayOf(new Date()) }, { kg: patient.weightKg }, { upsert: true });
  }
}

/** After a log changes: the profile shows the newest period start and weight. */
export async function syncProfileFromLogs(userId: mongoose.Types.ObjectId) {
  const [lastPeriod, lastWeight] = await Promise.all([
    PeriodLog.findOne({ patient: userId }).sort({ start: -1 }).select("start").lean(),
    WeightLog.findOne({ patient: userId }).sort({ date: -1, createdAt: -1 }).select("kg").lean(),
  ]);
  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  if (lastPeriod) set.lastPeriodStart = new Date(`${lastPeriod.start}T00:00:00Z`);
  else unset.lastPeriodStart = 1;
  if (lastWeight) set.weightKg = lastWeight.kg;
  await Patient.updateOne({ user: userId }, { ...(Object.keys(set).length && { $set: set }), ...(Object.keys(unset).length && { $unset: unset }) });
}
