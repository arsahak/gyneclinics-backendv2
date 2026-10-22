import mongoose from "mongoose";
import { Doctor, type IDoctor } from "../models/doctor.model";
import { PlatformSetting } from "../models/platformSetting.model";
import { User } from "../models/user.model";
import { Withdrawal, type IWithdrawal, type WithdrawalStatus } from "../models/withdrawal.model";
import { ApiError } from "./ApiError";
import { canBePaid, connectSummary, freshStripeAccount } from "./connect";
import { balancesFor } from "./earnings";
import { forgetFeesCache, getFees, round2 } from "./money";
import { linkFor, notify } from "./notify";
import { stripe, stripeError, toMinor } from "./stripe";

// Sending doctors their money with Stripe Connect:
//   - one request at a time (Payouts → "Send with Stripe"), or
//   - everyone at once: "Pay now" in Fees & Commission, and every Friday at
//     9:00 UK time when the payout schedule is "weekly". A weekly run pays each
//     doctor's whole available balance (if at least the minimum), asked for or not.

const OPEN: WithdrawalStatus[] = ["requested", "processing"];
export const WEEKLY_PAYOUT = { weekday: "Fri", hour: 9, timeZone: "Europe/London" } as const;

async function notifyDoctor(doctorId: mongoose.Types.ObjectId, title: string, body: string) {
  const d = await Doctor.findById(doctorId).select("user");
  if (d) await notify([d.user], { autoKey: "payout_update", title, body, link: linkFor("earnings", "doctor") });
}

/**
 * Sends one withdrawal: a Stripe transfer from our balance to the doctor's
 * Stripe account. The idempotency key means a repeat can't pay twice.
 */
export async function sendWithdrawalTransfer(w: IWithdrawal, by?: mongoose.Types.ObjectId): Promise<IWithdrawal> {
  if (!OPEN.includes(w.status)) throw new ApiError(409, "This withdrawal is already closed");
  const doctor = await Doctor.findById(w.doctor);
  if (!doctor) throw new ApiError(404, "This doctor no longer exists. Reject the request instead.");
  const name = (await User.findById(doctor.user).select("fullName"))?.fullName ?? "This doctor";
  const account = await freshStripeAccount(doctor);
  if (!account) throw new ApiError(409, `${name} hasn't set up Stripe yet, so there's nowhere to send it.`);
  if (!account.transfersActive) throw new ApiError(409, `${name}'s Stripe account can't receive money yet. Stripe still needs details from them.`);

  let transfer;
  try {
    transfer = await stripe().transfers.create(
      {
        amount: toMinor(w.amountGBP),
        currency: "gbp",
        destination: account.id,
        description: `GyneClinics earnings for ${name}`,
        metadata: { withdrawalId: String(w._id), doctorId: String(doctor._id) },
      },
      { idempotencyKey: `withdrawal-${w._id}` }
    );
  } catch (error) {
    throw stripeError(error, "Stripe couldn't send this. Please try again.");
  }

  w.status = "paid";
  w.paidAt = new Date();
  w.stripeAccountId = account.id;
  w.stripeTransferId = transfer.id;
  w.transferRef = transfer.id;
  w.destination = account.destination?.label ?? w.destination ?? "Stripe";
  if (by) w.handledBy = by;
  await w.save();
  await notifyDoctor(
    w.doctor,
    "Withdrawal sent",
    `We've sent £${w.amountGBP.toFixed(2)} to your Stripe account. Stripe pays it into ${account.destination?.label ?? "your bank or card"}, usually within a few working days.`
  );
  return w;
}

export interface PayoutLine {
  doctor: { _id: string; name: string };
  amountGBP: number;
  /** request: the doctor asked; balance: the weekly run pays their available balance. */
  source: "request" | "balance";
  withdrawalId?: string;
  stripe: ReturnType<typeof connectSummary>;
  /** Why it won't be sent, if it won't. */
  blocker: string | null;
}

/** Who would be paid if payouts ran now. Uses the stored Stripe status (no Stripe calls). */
export async function previewPayouts(): Promise<{ lines: PayoutLine[]; totalGBP: number; readyGBP: number }> {
  const fees = await getFees();
  const [open, balances] = await Promise.all([Withdrawal.find({ status: { $in: OPEN } }).lean(), balancesFor()]);
  const requested = new Map(open.map((w) => [String(w.doctor), w]));
  const doctorIds = new Set<string>(requested.keys());
  if (fees.payoutSchedule === "weekly") {
    for (const [id, b] of balances) if (b.availableGBP >= fees.minWithdrawalGBP && b.availableGBP > 0) doctorIds.add(id);
  }
  const doctors = await Doctor.find({ _id: { $in: [...doctorIds] } })
    .select("stripeAccount user")
    .populate<{ user: { fullName?: string } | null }>("user", "fullName");

  const lines: PayoutLine[] = doctors.map((d) => {
    const id = String(d._id);
    const w = requested.get(id);
    const stripeStatus = connectSummary(d.stripeAccount);
    return {
      doctor: { _id: id, name: d.user?.fullName ?? "Doctor" },
      amountGBP: w ? w.amountGBP : balances.get(id)?.availableGBP ?? 0,
      source: w ? "request" : "balance",
      withdrawalId: w ? String(w._id) : undefined,
      stripe: stripeStatus,
      blocker: canBePaid(d.stripeAccount) ? null : stripeStatus.status === "not_connected" ? "Hasn't set up Stripe" : "Stripe still needs details",
    };
  });
  lines.sort((a, b) => b.amountGBP - a.amountGBP);
  const totalGBP = round2(lines.reduce((s, l) => s + l.amountGBP, 0));
  const readyGBP = round2(lines.filter((l) => !l.blocker).reduce((s, l) => s + l.amountGBP, 0));
  return { lines, totalGBP, readyGBP };
}

export interface PayoutRunResult {
  sent: { doctor: string; amountGBP: number; transfer: string }[];
  skipped: { doctor: string; amountGBP: number; reason: string }[];
  sentGBP: number;
}

let running = false;

/** Pays everyone in the preview who can be paid. One run at a time. */
export async function runPayouts(trigger: "schedule" | "manual", by?: mongoose.Types.ObjectId, now = new Date()): Promise<PayoutRunResult> {
  if (running) throw new ApiError(409, "Payouts are already being sent. Try again in a minute.");
  running = true;
  try {
    const { lines } = await previewPayouts();
    const result: PayoutRunResult = { sent: [], skipped: [], sentGBP: 0 };
    for (const line of lines) {
      try {
        let w = line.withdrawalId ? await Withdrawal.findById(line.withdrawalId) : null;
        if (!w) {
          // Weekly run: the doctor's whole available balance, if Stripe is ready first.
          const doctor = (await Doctor.findById(line.doctor._id)) as IDoctor;
          if (!canBePaid(await freshStripeAccount(doctor))) throw new ApiError(409, line.blocker ?? "Stripe isn't ready");
          w = await Withdrawal.create({
            doctor: doctor._id,
            amountGBP: line.amountGBP,
            auto: true,
            stripeAccountId: doctor.stripeAccount?.id,
            destination: doctor.stripeAccount?.destination?.label ?? "Stripe",
          });
          try {
            await sendWithdrawalTransfer(w, by);
          } catch (error) {
            // Not sent: drop the request we just made, so the balance stays available.
            await w.deleteOne();
            throw error;
          }
        } else {
          await sendWithdrawalTransfer(w, by);
        }
        result.sent.push({ doctor: line.doctor.name, amountGBP: line.amountGBP, transfer: w.stripeTransferId ?? "" });
        result.sentGBP = round2(result.sentGBP + line.amountGBP);
      } catch (error) {
        result.skipped.push({ doctor: line.doctor.name, amountGBP: line.amountGBP, reason: (error as Error).message });
      }
    }
    await PlatformSetting.updateOne(
      { key: "fees" },
      { $set: { lastPayoutRun: { at: now, trigger, by, sent: result.sent.length, sentGBP: result.sentGBP, skipped: result.skipped.length } } }
    );
    forgetFeesCache();
    return result;
  } finally {
    running = false;
  }
}

/** Weekday, date and hour in UK time. */
function ukParts(date: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: WEEKLY_PAYOUT.timeZone, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  return { weekday: parts.weekday, day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) };
}

/** The next Friday 9:00 UK time after `now` (today's, if it's still to come). */
export function nextWeeklyRun(now = new Date()): Date {
  for (let i = 0; i < 8; i++) {
    const day = ukParts(new Date(now.getTime() + i * 86_400_000));
    if (day.weekday !== WEEKLY_PAYOUT.weekday) continue;
    const guess = Date.UTC(day.y, day.m - 1, day.d, WEEKLY_PAYOUT.hour);
    const at = new Date(guess - (ukParts(new Date(guess)).hour - WEEKLY_PAYOUT.hour) * 3_600_000);
    if (at > now) return at;
  }
  return new Date(now.getTime() + 7 * 86_400_000);
}

/** Called every few minutes: on Fridays after 9:00 UK time, runs the weekly payouts once. */
export async function runWeeklyPayoutsIfDue(now = new Date()) {
  const fees = await getFees();
  if (fees.payoutSchedule !== "weekly") return;
  const today = ukParts(now);
  if (today.weekday !== WEEKLY_PAYOUT.weekday || today.hour < WEEKLY_PAYOUT.hour) return;
  const doc = await PlatformSetting.findOne({ key: "fees" }).select("lastPayoutRun").lean();
  const last = doc?.lastPayoutRun;
  if (last?.trigger === "schedule" && ukParts(new Date(last.at)).day === today.day) return;
  const result = await runPayouts("schedule", undefined, now);
  console.log(`Weekly payouts: sent ${result.sent.length} (£${result.sentGBP}), skipped ${result.skipped.length}`);
}
