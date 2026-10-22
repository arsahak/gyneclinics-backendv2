import mongoose from "mongoose";
import { Consultation } from "../models/consultation.model";
import { Withdrawal } from "../models/withdrawal.model";
import { consultationTimes } from "./consultationStage";
import { getFees, rateOf, round2, split, toGBP } from "./money";

// A doctor's money, in GBP, worked out from real payments and withdrawals:
//   clearing  = their share of payments still in the follow-up
//   cleared   = their share of payments whose follow-up ended
//   requested = asked for, not paid yet (requested or processing)
//   paidOut   = already sent to their bank
//   available = cleared − requested − paid out  (what they can ask for now)

export interface Balance {
  clearingGBP: number;
  clearedGBP: number;
  requestedGBP: number;
  paidOutGBP: number;
  availableGBP: number;
  lifetimeGBP: number;
  consultations: number;
}

const empty = (): Balance => ({ clearingGBP: 0, clearedGBP: 0, requestedGBP: 0, paidOutGBP: 0, availableGBP: 0, lifetimeGBP: 0, consultations: 0 });

/** Balances for some doctors (or all, when `doctorIds` is omitted), keyed by doctor id. */
export async function balancesFor(doctorIds?: mongoose.Types.ObjectId[]): Promise<Map<string, Balance>> {
  const now = new Date();
  const scope = doctorIds ? { doctor: { $in: doctorIds } } : {};
  const [consultations, withdrawals, fees] = await Promise.all([
    Consultation.find({ ...scope, "payment.amount": { $gt: 0 }, status: { $in: ["confirmed", "completed"] } })
      .select("doctor payment.amount payment.currency startsAt commissionRate")
      .lean(),
    Withdrawal.find({ ...scope, status: { $in: ["requested", "processing", "paid"] } })
      .select("doctor amountGBP status")
      .lean(),
    getFees(),
  ]);

  const map = new Map<string, Balance>();
  const get = (id: unknown) => {
    const key = String(id);
    if (!map.has(key)) map.set(key, empty());
    return map.get(key)!;
  };
  for (const c of consultations) {
    const b = get(c.doctor);
    const share = split(toGBP(c.payment.amount, c.payment.currency), rateOf(c, fees)).doctorShare;
    if (consultationTimes(c.startsAt).followUpEndsAt > now) b.clearingGBP += share;
    else b.clearedGBP += share;
    b.consultations += 1;
  }
  for (const w of withdrawals) {
    const b = get(w.doctor);
    if (w.status === "paid") b.paidOutGBP += w.amountGBP;
    else b.requestedGBP += w.amountGBP;
  }
  for (const b of map.values()) {
    for (const key of ["clearingGBP", "clearedGBP", "requestedGBP", "paidOutGBP"] as const) b[key] = round2(b[key]);
    b.availableGBP = Math.max(0, round2(b.clearedGBP - b.requestedGBP - b.paidOutGBP));
    b.lifetimeGBP = round2(b.clearingGBP + b.clearedGBP);
  }
  return map;
}

export async function balanceFor(doctorId: mongoose.Types.ObjectId): Promise<Balance> {
  return (await balancesFor([doctorId])).get(String(doctorId)) ?? empty();
}
