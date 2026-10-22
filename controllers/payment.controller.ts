import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../middleware/asyncHandler";
import { Consultation, type IConsultation } from "../models/consultation.model";
import { Doctor } from "../models/doctor.model";
import { User } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { consultationTimes, FOLLOW_UP_DAYS, SESSION_HOURS } from "../utils/consultationStage";
import { getFees, rateOf, round2, split, toGBP, type Fees } from "../utils/money";
import { stripe, stripeError, stripeUrl } from "../utils/stripe";
import { alertStaff, moneyText } from "../utils/staffAlerts";

// Payments are the paid consultations (each consultation stores its payment).
//   clearing = paid; the doctor's share waits for the follow-up to end
//   cleared  = the follow-up ended; the doctor can withdraw their share
//   refunded = the patient got the money back (or the booking was cancelled)

export type PaymentStatus = "clearing" | "cleared" | "refunded";

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const OPEN = ["confirmed", "completed"];
const PAID = { "payment.amount": { $gt: 0 } };

/** Start times before this have finished their follow-up. */
const clearanceCut = (now: Date) => new Date(now.getTime() - (SESSION_HOURS * 3_600_000 + FOLLOW_UP_DAYS * 86_400_000));

function statusFilter(status: PaymentStatus, now: Date): Record<string, unknown> {
  if (status === "refunded") return { status: { $in: ["refunded", "cancelled"] } };
  if (status === "clearing") return { status: { $in: OPEN }, startsAt: { $gt: clearanceCut(now) } };
  return { status: { $in: OPEN }, startsAt: { $lte: clearanceCut(now) } };
}

export function paymentStatusOf(c: Pick<IConsultation, "status" | "startsAt">, now = new Date()): PaymentStatus {
  if (c.status === "refunded" || c.status === "cancelled") return "refunded";
  return consultationTimes(c.startsAt).followUpEndsAt > now ? "clearing" : "cleared";
}

/** One payment as the dashboard shows it. */
function toPayment(c: IConsultation, now: Date, fees: Fees) {
  const json = c.toJSON() as Record<string, unknown>;
  const status = paymentStatusOf(c, now);
  const rate = rateOf(c, fees);
  const { commission, doctorShare } = split(c.payment.amount, rate);
  return {
    ...json,
    commissionRate: rate,
    paymentStatus: status,
    amountGBP: toGBP(c.payment.amount, c.payment.currency),
    commission: status === "refunded" ? 0 : commission,
    doctorShare: status === "refunded" ? 0 : doctorShare,
    clearsAt: consultationTimes(c.startsAt).followUpEndsAt,
    stripeUrl: c.payment.stripePaymentIntentId ? stripeUrl(`payments/${c.payment.stripePaymentIntentId}`) : null,
  };
}

/**
 * Staff list of payments: status, doctor, method, search (booking, payment
 * reference, patient or doctor). Stats are totals in GBP.
 */
export const listPayments = asyncHandler(async (req: Request, res: Response) => {
  const now = new Date();
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const status = String(req.query.status ?? "all");

  const parts: Record<string, unknown>[] = [PAID];
  if (status !== "all") parts.push(statusFilter(status as PaymentStatus, now));
  if (req.query.doctorId) parts.push({ doctor: String(req.query.doctorId) });
  if (req.query.method) parts.push({ "payment.method": String(req.query.method) });
  const search = String(req.query.search ?? "").trim();
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    const users = await User.find({ $or: [{ fullName: pattern }, { phone: pattern }] }).distinct("_id");
    const doctors = await Doctor.find({ user: { $in: users } }).distinct("_id");
    parts.push({ $or: [{ reference: pattern }, { "payment.reference": pattern }, { patient: { $in: users } }, { doctor: { $in: doctors } }] });
  }
  const filter = { $and: parts };

  const [items, total, all, doctorIds, fees] = await Promise.all([
    Consultation.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("patient", "fullName phone avatar")
      .populate("refund.by", "fullName")
      .populate({ path: "doctor", select: "title specialization user", populate: { path: "user", select: "fullName avatar" } }),
    Consultation.countDocuments(filter),
    // Totals over every paid consultation (small enough to add up here).
    Consultation.find(PAID).select("payment.amount payment.currency status startsAt createdAt commissionRate").lean(),
    Consultation.distinct("doctor", PAID),
    getFees(),
  ]);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const stats = { collectedGBP: 0, commissionGBP: 0, clearingGBP: 0, clearedGBP: 0, refundedGBP: 0, paid: 0, clearing: 0, cleared: 0, refunded: 0, monthCollectedGBP: 0 };
  for (const c of all) {
    const gbp = toGBP(c.payment.amount, c.payment.currency);
    const s = paymentStatusOf(c as unknown as IConsultation, now);
    if (s === "refunded") {
      stats.refunded += 1;
      stats.refundedGBP += gbp;
      continue;
    }
    const share = split(gbp, rateOf(c, fees));
    stats.paid += 1;
    stats.collectedGBP += gbp;
    stats.commissionGBP += share.commission;
    if (s === "clearing") {
      stats.clearing += 1;
      stats.clearingGBP += share.doctorShare;
    } else {
      stats.cleared += 1;
      stats.clearedGBP += share.doctorShare;
    }
    if (c.createdAt && new Date(c.createdAt) >= monthStart) stats.monthCollectedGBP += gbp;
  }
  for (const key of ["collectedGBP", "commissionGBP", "clearingGBP", "clearedGBP", "refundedGBP", "monthCollectedGBP"] as const) stats[key] = round2(stats[key]);

  const doctors = await Doctor.find({ _id: { $in: doctorIds } })
    .select("user")
    .populate<{ user: { fullName?: string } | null }>("user", "fullName");

  return ApiResponse(res, 200, "Payments fetched successfully", {
    payments: items.map((c) => toPayment(c, now, fees)),
    pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
    stats: { ...stats, commissionRate: fees.commissionRate },
    doctors: doctors.map((d) => ({ _id: d._id, name: d.user?.fullName ?? "Doctor" })).sort((a, b) => a.name.localeCompare(b.name)),
  });
});

/**
 * Refund the patient (super admin). Only while the payment is still clearing,
 * before the doctor can withdraw it. Stripe payments are refunded through
 * Stripe here (to the card they paid with); older payments are only recorded.
 * Either way it comes out of the doctor's earnings.
 */
export const refundPayment = asyncHandler(async (req: Request, res: Response) => {
  const consultation = await Consultation.findById(req.params.id);
  if (!consultation || !(consultation.payment.amount > 0)) throw new ApiError(404, "Payment not found");
  const status = paymentStatusOf(consultation);
  if (status === "refunded") throw new ApiError(409, "This payment was already refunded");
  if (status === "cleared") throw new ApiError(409, "This payment has cleared, so the doctor may already have withdrawn it. Sort it out with the doctor first.");

  const reason = String(req.body.reason).trim();
  let stripeRefundId: string | undefined;
  if (consultation.payment.stripePaymentIntentId) {
    try {
      const refund = await stripe().refunds.create(
        { payment_intent: consultation.payment.stripePaymentIntentId, reason: "requested_by_customer", metadata: { consultationId: String(consultation._id), note: reason.slice(0, 450) } },
        { idempotencyKey: `refund-${consultation._id}` }
      );
      if (refund.status === "failed" || refund.status === "canceled") throw new ApiError(502, "Stripe couldn't refund this payment. Check it in Stripe.");
      stripeRefundId = refund.id;
    } catch (error) {
      throw stripeError(error, "Stripe couldn't refund this payment. Please try again.");
    }
  }

  consultation.status = "refunded";
  consultation.refund = { at: new Date(), reason, by: req.user!._id as mongoose.Types.ObjectId, stripeRefundId };
  await consultation.save();
  await alertStaff({
    type: "payment_refunded",
    areas: ["payments"],
    title: `Refunded ${moneyText(consultation.payment.amount, consultation.payment.currency)}`,
    body: `${consultation.reference} refunded by ${req.user!.fullName || "the team"}: ${reason}`,
    link: "/payments",
  });
  return ApiResponse(res, 200, stripeRefundId ? "Refunded through Stripe" : "Refund recorded", { _id: consultation._id, status: consultation.status, refund: consultation.refund });
});
