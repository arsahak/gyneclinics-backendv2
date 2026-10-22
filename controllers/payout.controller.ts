import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../middleware/asyncHandler";
import { Doctor, type IStripeAccount } from "../models/doctor.model";
import { User } from "../models/user.model";
import { Withdrawal, type WithdrawalStatus } from "../models/withdrawal.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { canBePaid, connectSummary, ensureStripeAccount, freshStripeAccount, safeReturnUrl } from "../utils/connect";
import { balanceFor, balancesFor } from "../utils/earnings";
import { getFees, round2 } from "../utils/money";
import { linkFor, notify } from "../utils/notify";
import { sendWithdrawalTransfer } from "../utils/payoutRun";
import { stripe, stripeError, stripeUrl } from "../utils/stripe";
import { alertStaff, moneyText } from "../utils/staffAlerts";

// Doctors are paid with Stripe Connect. A doctor sets up their Stripe account
// (Stripe collects their bank account or debit card), asks to withdraw cleared
// money, and a super admin sends it: a Stripe transfer to their account, which
// Stripe then pays out to their bank or card.

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const OPEN: WithdrawalStatus[] = ["requested", "processing"];

async function myDoctor(userId: unknown) {
  const doctor = await Doctor.findOne({ user: userId });
  if (!doctor) throw new ApiError(403, "Finish your doctor profile first");
  return doctor;
}

/** Where the money went: Stripe for new requests, the bank for old ones. */
const destinationOf = (w: { destination?: string; bank?: { bankName: string } }) => w.destination || (w.bank ? w.bank.bankName : "Stripe");

// ── Doctors ─────────────────────────────────────────────────────────────────

/** Your earnings, Stripe payout account and withdrawals. */
export const getMyPayouts = asyncHandler(async (req: Request, res: Response) => {
  const doctor = await myDoctor(req.user!._id);
  const [account, balance, withdrawals, fees] = await Promise.all([
    freshStripeAccount(doctor),
    balanceFor(doctor._id as mongoose.Types.ObjectId),
    Withdrawal.find({ doctor: doctor._id }).sort({ createdAt: -1 }).limit(50).select("-bank -handledBy -stripeAccountId"),
    getFees(),
  ]);
  return ApiResponse(res, 200, "Earnings fetched successfully", {
    balance,
    minWithdrawalGBP: fees.minWithdrawalGBP,
    payoutSchedule: fees.payoutSchedule,
    stripe: connectSummary(account),
    withdrawals: withdrawals.map((w) => ({ ...(w.toJSON() as Record<string, unknown>), destination: destinationOf(w) })),
  });
});

/**
 * A link to Stripe: its sign-up form while the account isn't finished, or the
 * doctor's Stripe Express dashboard (to change their bank or card) after.
 */
export const stripeLink = asyncHandler(async (req: Request, res: Response) => {
  const doctor = await myDoctor(req.user!._id);
  const returnUrl = safeReturnUrl(req.body.returnUrl);
  const accountId = await ensureStripeAccount(doctor, req.user!);
  const account = await freshStripeAccount(doctor);
  try {
    if (account?.detailsSubmitted) {
      const login = await stripe().accounts.createLoginLink(accountId);
      return ApiResponse(res, 200, "Stripe dashboard link", { url: login.url, kind: "dashboard" });
    }
    const link = await stripe().accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${returnUrl}?stripe=refresh`,
      return_url: `${returnUrl}?stripe=return`,
    });
    return ApiResponse(res, 200, "Stripe sign-up link", { url: link.url, kind: "onboarding" });
  } catch (error) {
    throw stripeError(error, "We couldn't open Stripe. Please try again.");
  }
});

/** Ask for cleared money: at least the minimum, at most what's available, one open request at a time. */
export const requestWithdrawal = asyncHandler(async (req: Request, res: Response) => {
  const doctor = await myDoctor(req.user!._id);
  const amount = round2(Number(req.body.amountGBP));
  const account = await freshStripeAccount(doctor);
  if (!account) throw new ApiError(422, "Set up your Stripe account first, so we know where to pay you.");
  if (!canBePaid(account)) throw new ApiError(422, "Your Stripe account isn't ready for payouts yet. Finish the steps Stripe asks for, then try again.");
  if (await Withdrawal.exists({ doctor: doctor._id, status: { $in: OPEN } })) {
    throw new ApiError(409, "You already have a withdrawal on its way. You can ask again once it's paid.");
  }
  const { minWithdrawalGBP } = await getFees();
  if (amount < minWithdrawalGBP) throw new ApiError(422, `The smallest withdrawal is £${minWithdrawalGBP}`);
  const balance = await balanceFor(doctor._id as mongoose.Types.ObjectId);
  if (amount > balance.availableGBP) throw new ApiError(422, `You can withdraw up to £${balance.availableGBP.toFixed(2)} now`);

  const withdrawal = await Withdrawal.create({
    doctor: doctor._id,
    amountGBP: amount,
    stripeAccountId: account.id,
    destination: account.destination?.label ?? "Stripe",
  });
  await alertStaff({
    type: "withdrawal_requested",
    areas: ["payouts"],
    title: `Withdrawal request · £${amount.toFixed(2)}`,
    body: `${req.user!.fullName || "A doctor"} asked to withdraw £${amount.toFixed(2)} to ${withdrawal.destination}.`,
    link: "/payouts",
  });
  return ApiResponse(res, 201, "Withdrawal requested. We usually send it within 3 working days.", {
    _id: withdrawal._id,
    amountGBP: withdrawal.amountGBP,
    status: withdrawal.status,
    destination: withdrawal.destination,
    createdAt: withdrawal.createdAt,
  });
});

// ── Staff ───────────────────────────────────────────────────────────────────

type DoctorStripe = { _id: mongoose.Types.ObjectId; stripeAccount?: IStripeAccount };

/** Each doctor's Stripe status, by doctor id (stored copy; it's refreshed when money is sent). */
async function stripeStatusFor(doctorIds: unknown[]) {
  const rows = await Doctor.find({ _id: { $in: doctorIds } }).select("stripeAccount").lean<DoctorStripe[]>();
  return new Map(rows.map((d) => [String(d._id), connectSummary(d.stripeAccount)]));
}

/** Our Stripe balance in pounds that can be sent now (null if Stripe can't be reached). */
async function platformAvailableGBP(): Promise<number | null> {
  try {
    const balance = await stripe().balance.retrieve();
    const gbp = balance.available.find((b) => b.currency === "gbp");
    return gbp ? gbp.amount / 100 : 0;
  } catch {
    return null;
  }
}

/** Staff list of withdrawals. status "todo" (default) = waiting to be sent. */
export const listWithdrawals = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const status = String(req.query.status ?? "todo");

  const filter: Record<string, unknown> = {};
  if (status === "todo") filter.status = { $in: OPEN };
  else if (status !== "all") filter.status = status;
  const search = String(req.query.search ?? "").trim();
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    const users = await User.find({ role: "doctor", fullName: pattern }).distinct("_id");
    const doctors = await Doctor.find({ user: { $in: users } }).distinct("_id");
    filter.$or = [{ doctor: { $in: doctors } }, { transferRef: pattern }, { destination: pattern }, { "bank.accountName": pattern }];
  }

  const [withdrawals, total, counts, allBalances, fees, stripeAvailableGBP] = await Promise.all([
    Withdrawal.find(filter)
      .sort({ createdAt: status === "todo" ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("handledBy", "fullName")
      .populate({ path: "doctor", select: "title specialization user", populate: { path: "user", select: "fullName avatar phone" } }),
    Withdrawal.countDocuments(filter),
    Withdrawal.aggregate<{ _id: WithdrawalStatus; n: number; sum: number }>([{ $group: { _id: "$status", n: { $sum: 1 }, sum: { $sum: "$amountGBP" } } }]),
    balancesFor(),
    getFees(),
    platformAvailableGBP(),
  ]);
  const by = (s: WithdrawalStatus) => counts.find((c) => c._id === s) ?? { n: 0, sum: 0 };
  const availableGBP = round2([...allBalances.values()].reduce((s, b) => s + b.availableGBP, 0));
  const doctorIds = withdrawals.map((w) => (w.doctor as unknown as { _id?: unknown } | null)?._id).filter(Boolean);
  const statuses = await stripeStatusFor(doctorIds);

  return ApiResponse(res, 200, "Withdrawals fetched successfully", {
    withdrawals: withdrawals.map((w) => {
      const json = w.toJSON() as Record<string, unknown>;
      const doctorId = String((w.doctor as unknown as { _id?: unknown } | null)?._id ?? "");
      return {
        ...json,
        destination: destinationOf(w),
        stripe: statuses.get(doctorId) ?? connectSummary(null),
        stripeTransferUrl: w.stripeTransferId ? stripeUrl(`connect/transfers/${w.stripeTransferId}`) : null,
      };
    }),
    pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
    stats: {
      requested: { count: by("requested").n + by("processing").n, sumGBP: round2(by("requested").sum + by("processing").sum) },
      paid: { count: by("paid").n, sumGBP: round2(by("paid").sum) },
      rejected: { count: by("rejected").n, sumGBP: round2(by("rejected").sum) },
      availableGBP,
      stripeAvailableGBP,
      minWithdrawalGBP: fees.minWithdrawalGBP,
    },
  });
});

/** Every doctor with money: clearing, available, requested, paid out, and their Stripe status. */
export const listBalances = asyncHandler(async (_req: Request, res: Response) => {
  const balances = await balancesFor();
  const doctors = await Doctor.find({ _id: { $in: [...balances.keys()] } })
    .select("stripeAccount title specialization user")
    .populate<{ user: { fullName?: string; avatar?: string } | null }>("user", "fullName avatar");
  const rows = doctors
    .map((d) => ({
      doctor: { _id: d._id, name: d.user?.fullName ?? "Doctor", avatar: d.user?.avatar, specialization: d.specialization },
      stripe: connectSummary(d.stripeAccount),
      ...balances.get(String(d._id))!,
    }))
    .sort((a, b) => b.lifetimeGBP - a.lifetimeGBP);
  return ApiResponse(res, 200, "Balances fetched successfully", rows);
});

async function notifyDoctor(doctorId: mongoose.Types.ObjectId, title: string, body: string) {
  const d = await Doctor.findById(doctorId).select("user");
  if (d) await notify([d.user], { autoKey: "payout_update", title, body, link: linkFor("earnings", "doctor") });
}

async function withdrawalOr404(id: string) {
  const w = await Withdrawal.findById(id);
  if (!w) throw new ApiError(404, "Withdrawal not found");
  return w;
}

/**
 * Send the money: a Stripe transfer from our balance to the doctor's Stripe
 * account. Stripe then pays it out to their bank or card on its own schedule.
 * Pressing it twice can't pay twice (Stripe idempotency key per request).
 */
export const sendWithdrawal = asyncHandler(async (req: Request, res: Response) => {
  const w = await sendWithdrawalTransfer(await withdrawalOr404(req.params.id), req.user!._id as mongoose.Types.ObjectId);
  return ApiResponse(res, 200, `Sent £${w.amountGBP.toFixed(2)} with Stripe`, w);
});

/** Not paid: the amount goes back to the doctor's available balance. */
export const rejectWithdrawal = asyncHandler(async (req: Request, res: Response) => {
  const w = await withdrawalOr404(req.params.id);
  if (!OPEN.includes(w.status)) throw new ApiError(409, "This withdrawal is already closed");
  w.status = "rejected";
  w.rejectionReason = String(req.body.reason).trim();
  w.handledBy = req.user!._id as mongoose.Types.ObjectId;
  await w.save();
  await notifyDoctor(w.doctor, "Withdrawal not sent", `We couldn't send your £${w.amountGBP.toFixed(2)} withdrawal: ${w.rejectionReason} The money is back in your balance.`);
  return ApiResponse(res, 200, "Request rejected", w);
});
