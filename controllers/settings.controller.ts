import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../middleware/asyncHandler";
import { Doctor } from "../models/doctor.model";
import { PlatformSetting, type PayoutSchedule } from "../models/platformSetting.model";
import { ApiResponse } from "../utils/ApiResponse";
import { FOLLOW_UP_DAYS, SESSION_HOURS } from "../utils/consultationStage";
import { forgetFeesCache, getFees } from "../utils/money";
import { nextWeeklyRun, previewPayouts, runPayouts, WEEKLY_PAYOUT } from "../utils/payoutRun";
import { DEFAULT_MULTIPLIERS, GBP_TO_USD, REGION_IDS, REGION_NAMES, REGION_PRICING, type RegionId, type RegionMultipliers } from "../utils/regions";
import { stripeMode } from "../utils/stripe";

// Fees & Commission: the commission (and per-doctor rates), the price in each
// region, the minimum withdrawal and when payouts go, plus a log of changes.
// Clearance follows the consultation rules (chat + free follow-up), shown read only.

const pct = (rate: number) => `${Math.round(rate * 1000) / 10}%`;
const SCHEDULE_LABEL: Record<PayoutSchedule, string> = { on_request: "on request", weekly: "weekly (Fridays)" };

/** Every region with its currency, multiplier and the default multiplier. */
const regionsOf = (multipliers: RegionMultipliers) =>
  REGION_IDS.map((id) => ({ id, name: REGION_NAMES[id], currency: REGION_PRICING[id].currency, multiplier: multipliers[id], defaultMultiplier: DEFAULT_MULTIPLIERS[id] }));

/** Payout schedule, the next weekly run, the last run and who'd be paid now. */
async function payoutsInfo(schedule: PayoutSchedule) {
  const [doc, preview] = await Promise.all([
    PlatformSetting.findOne({ key: "fees" }).select("lastPayoutRun").populate<{ lastPayoutRun?: { by?: { fullName?: string } | null } }>("lastPayoutRun.by", "fullName").lean(),
    previewPayouts(),
  ]);
  const last = doc?.lastPayoutRun as { at: Date; trigger: string; sent: number; sentGBP: number; skipped: number; by?: { fullName?: string } | null } | undefined;
  return {
    nextRunAt: schedule === "weekly" ? nextWeeklyRun() : null,
    weekly: WEEKLY_PAYOUT,
    lastRun: last ? { at: last.at, trigger: last.trigger, sent: last.sent, sentGBP: last.sentGBP, skipped: last.skipped, by: last.by?.fullName ?? null } : null,
    preview,
  };
}

/** GET /settings/fees (admin, super admin). */
export const getFeeSettings = asyncHandler(async (_req: Request, res: Response) => {
  const [fees, doctors, doc] = await Promise.all([
    getFees(),
    Doctor.find({ verificationStatus: "approved" })
      .select("specialization commissionOverride stripeAccount user")
      .populate<{ user: { fullName?: string; avatar?: string } | null }>("user", "fullName avatar"),
    PlatformSetting.findOne({ key: "fees" })
      .select("updatedBy updatedAt history")
      .populate<{ updatedBy: { fullName?: string } | null }>("updatedBy", "fullName")
      .populate<{ history: { at: Date; changes: string[]; by: { fullName?: string } | null }[] }>("history.by", "fullName")
      .lean(),
  ]);
  const list = doctors
    .map((d) => ({ _id: d._id, name: d.user?.fullName ?? "Doctor", specialization: d.specialization, override: d.commissionOverride ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return ApiResponse(res, 200, "Fee settings fetched successfully", {
    commissionRate: fees.commissionRate,
    minWithdrawalGBP: fees.minWithdrawalGBP,
    payoutSchedule: fees.payoutSchedule,
    regions: regionsOf(fees.regionMultipliers),
    gbpToUsd: GBP_TO_USD,
    sessionHours: SESSION_HOURS,
    followUpDays: FOLLOW_UP_DAYS,
    // Patients pay with Stripe; doctors are paid with Stripe Connect.
    payoutMethods: [{ id: "stripe_connect", label: "Stripe Connect", status: "in_use" }],
    stripe: {
      mode: stripeMode(),
      doctorsReady: doctors.filter((d) => d.stripeAccount?.transfersActive && d.stripeAccount.payoutsEnabled).length,
      doctorsStarted: doctors.filter((d) => d.stripeAccount?.id).length,
      doctors: doctors.length,
    },
    payouts: await payoutsInfo(fees.payoutSchedule),
    overrides: list.filter((d) => d.override).map((d) => ({ doctor: { _id: d._id, name: d.name, specialization: d.specialization }, rate: d.override!.rate, note: d.override!.note ?? "" })),
    doctors: list.map((d) => ({ _id: d._id, name: d.name, specialization: d.specialization })),
    history: (doc?.history ?? []).map((h) => ({ at: h.at, by: h.by?.fullName ?? null, changes: h.changes })),
    updatedAt: fees.updatedAt ?? null,
    updatedBy: doc?.updatedBy?.fullName ?? null,
  });
});

/**
 * PUT /settings/fees (super admin). Save everything at once. `overrides` is the
 * full list: doctors left out go back to the standard rate. New bookings use the
 * new rates and prices; past ones keep theirs. Each save is added to the history.
 */
export const saveFeeSettings = asyncHandler(async (req: Request, res: Response) => {
  const b = req.body as {
    commissionRate: number;
    minWithdrawalGBP: number;
    payoutSchedule: PayoutSchedule;
    regionMultipliers?: Partial<Record<RegionId, number>>;
    overrides: { doctorId: string; rate: number; note?: string }[];
  };
  const before = await getFees();
  const multipliers = { ...before.regionMultipliers, ...(b.regionMultipliers ?? {}) } as RegionMultipliers;

  // What changed, in words.
  const changes: string[] = [];
  if (before.commissionRate !== b.commissionRate) changes.push(`Commission ${pct(before.commissionRate)} → ${pct(b.commissionRate)}`);
  if (before.minWithdrawalGBP !== b.minWithdrawalGBP) changes.push(`Minimum withdrawal £${before.minWithdrawalGBP} → £${b.minWithdrawalGBP}`);
  if (before.payoutSchedule !== b.payoutSchedule) changes.push(`Payouts ${SCHEDULE_LABEL[before.payoutSchedule]} → ${SCHEDULE_LABEL[b.payoutSchedule]}`);
  for (const id of REGION_IDS) {
    if (before.regionMultipliers[id] !== multipliers[id]) changes.push(`${REGION_NAMES[id]} price ${pct(before.regionMultipliers[id])} → ${pct(multipliers[id])} of the UK fee`);
  }
  const current = await Doctor.find({ commissionOverride: { $exists: true } })
    .select("commissionOverride user")
    .populate<{ user: { fullName?: string } | null }>("user", "fullName");
  const wanted = new Map(b.overrides.map((o) => [o.doctorId, o]));
  const named = await Doctor.find({ _id: { $in: [...wanted.keys()] } })
    .select("user")
    .populate<{ user: { fullName?: string } | null }>("user", "fullName");
  const nameOf = new Map([...current, ...named].map((d) => [String(d._id), d.user?.fullName ?? "A doctor"]));
  for (const d of current) {
    const next = wanted.get(String(d._id));
    if (!next) changes.push(`${nameOf.get(String(d._id))}: special rate ${pct(d.commissionOverride!.rate)} removed`);
    else if (next.rate !== d.commissionOverride!.rate) changes.push(`${nameOf.get(String(d._id))}: special rate ${pct(d.commissionOverride!.rate)} → ${pct(next.rate)}`);
  }
  for (const o of b.overrides) {
    if (!current.some((d) => String(d._id) === o.doctorId)) changes.push(`${nameOf.get(o.doctorId) ?? "A doctor"}: special rate ${pct(o.rate)} added`);
  }

  const by = req.user!._id as mongoose.Types.ObjectId;
  await PlatformSetting.findOneAndUpdate(
    { key: "fees" },
    {
      $set: { key: "fees", commissionRate: b.commissionRate, minWithdrawalGBP: b.minWithdrawalGBP, payoutSchedule: b.payoutSchedule, regionMultipliers: multipliers, updatedBy: by },
      ...(changes.length && { $push: { history: { $each: [{ at: new Date(), by, changes }], $position: 0, $slice: 50 } } }),
    },
    { upsert: true, new: true, runValidators: true }
  );

  const ids = b.overrides.map((o) => o.doctorId);
  await Doctor.updateMany({ commissionOverride: { $exists: true }, _id: { $nin: ids } }, { $unset: { commissionOverride: 1 } });
  await Promise.all(
    b.overrides.map((o) =>
      Doctor.updateOne({ _id: o.doctorId }, { $set: { commissionOverride: { rate: o.rate, note: o.note?.trim() || undefined, updatedAt: new Date() } } })
    )
  );
  forgetFeesCache();
  return ApiResponse(res, 200, changes.length ? "Fee settings saved. New bookings use them; past bookings keep their rate." : "Nothing changed", {
    ...(await getFees()),
    changes,
  });
});

/** GET /settings/pricing (public): what each region pays, for the apps to show prices. */
export const getPricing = asyncHandler(async (_req: Request, res: Response) => {
  const fees = await getFees();
  res.setHeader("Cache-Control", "public, max-age=60");
  return ApiResponse(res, 200, "Pricing fetched successfully", { gbpToUsd: GBP_TO_USD, regions: regionsOf(fees.regionMultipliers).map(({ defaultMultiplier: _d, ...r }) => r) });
});

/** GET /settings/fees/payouts (admin, super admin): next run, last run, who'd be paid now. */
export const getPayoutRun = asyncHandler(async (_req: Request, res: Response) => {
  const fees = await getFees();
  return ApiResponse(res, 200, "Payout run fetched successfully", await payoutsInfo(fees.payoutSchedule));
});

/** POST /settings/fees/payouts/run (super admin): pay everyone who can be paid, now. */
export const runPayoutsNow = asyncHandler(async (req: Request, res: Response) => {
  const result = await runPayouts("manual", req.user!._id as mongoose.Types.ObjectId);
  const fees = await getFees();
  const message = result.sent.length
    ? `Sent £${result.sentGBP.toFixed(2)} to ${result.sent.length} doctor${result.sent.length === 1 ? "" : "s"} with Stripe${result.skipped.length ? `; ${result.skipped.length} skipped` : ""}`
    : result.skipped.length
      ? `Nothing sent; ${result.skipped.length} skipped`
      : "Nobody to pay right now";
  return ApiResponse(res, 200, message, { result, ...(await payoutsInfo(fees.payoutSchedule)) });
});
