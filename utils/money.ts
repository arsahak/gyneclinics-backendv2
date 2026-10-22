import { PlatformSetting, type PayoutSchedule } from "../models/platformSetting.model";
import { DEFAULT_MULTIPLIERS, GBP_TO_USD, REGION_IDS, type RegionMultipliers } from "./regions";

export { GBP_TO_USD };

// Money rules shared by Payments, Payouts and Fees & Commission.
//   - GyneClinics keeps a commission of each consultation; the doctor gets the rest.
//     The rate is set in Fees & Commission (a doctor can have their own), and each
//     booking stores the rate it was made with, so later changes don't rewrite history.
//   - The doctor's share clears when the free follow-up ends (see consultationStage.ts).
//   - Non-UK regions pay in USD; totals are shown in GBP at the webapp's fixed rate.

/** Defaults until the team saves Fees & Commission. */
export const DEFAULT_FEES = { commissionRate: 0.2, minWithdrawalGBP: 20, payoutSchedule: "on_request" as PayoutSchedule };

export const round2 = (n: number) => Math.round(n * 100) / 100;

export interface Fees {
  commissionRate: number;
  minWithdrawalGBP: number;
  payoutSchedule: PayoutSchedule;
  /** Price per region as a share of the UK fee. */
  regionMultipliers: RegionMultipliers;
  updatedAt?: Date;
}

// Read often, changed rarely: keep for a short while.
let cache: { at: number; fees: Fees } | null = null;
const CACHE_MS = 30_000;

export async function getFees(): Promise<Fees> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.fees;
  const doc = await PlatformSetting.findOne({ key: "fees" }).lean();
  // A lean Map comes back as a plain object.
  const saved = (doc?.regionMultipliers ?? {}) as Record<string, number>;
  const regionMultipliers = Object.fromEntries(REGION_IDS.map((id) => [id, saved[id] ?? DEFAULT_MULTIPLIERS[id]])) as RegionMultipliers;
  const fees: Fees = doc
    ? { commissionRate: doc.commissionRate, minWithdrawalGBP: doc.minWithdrawalGBP, payoutSchedule: doc.payoutSchedule, regionMultipliers, updatedAt: doc.updatedAt }
    : { ...DEFAULT_FEES, regionMultipliers };
  cache = { at: Date.now(), fees };
  return fees;
}

export function forgetFeesCache() {
  cache = null;
}

/** An amount in GBP (USD converted at the fixed rate). */
export function toGBP(amount: number, currency: string) {
  return round2(currency === "USD" ? amount / GBP_TO_USD : amount);
}

/** Commission and the doctor's share at `rate`, in the amount's own currency. */
export function split(amount: number, rate: number) {
  const commission = round2(amount * rate);
  return { commission, doctorShare: round2(amount - commission) };
}

/**
 * The rate a booking was made with. Bookings from before rates were stored were
 * all made at the original 20%, so they stay at that whatever the current rate is.
 */
export const rateOf = (c: { commissionRate?: number | null }, _fees?: Fees) => c.commissionRate ?? DEFAULT_FEES.commissionRate;
