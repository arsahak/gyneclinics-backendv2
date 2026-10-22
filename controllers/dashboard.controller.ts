import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { ChatFlag } from "../models/chatFlag.model";
import { Consultation, type IConsultation } from "../models/consultation.model";
import { Doctor } from "../models/doctor.model";
import { Report } from "../models/report.model";
import { Review } from "../models/review.model";
import { Story } from "../models/story.model";
import { User } from "../models/user.model";
import { Withdrawal } from "../models/withdrawal.model";
import { ApiResponse } from "../utils/ApiResponse";
import { consultationTimes } from "../utils/consultationStage";
import { balancesFor } from "../utils/earnings";
import { getFees, rateOf, round2, split, toGBP } from "../utils/money";
import { accessFor, allows } from "../utils/permissions";
import { paymentStatusOf } from "./payment.controller";

// GET /api/v1/dashboard/overview — the dashboard home, all live. Each part is
// included only if the person's role can see that area (Team & Roles); the
// rest come back as null. Money is in GBP (USD at the fixed rate).

const TZ = "Europe/London";
const DAY = 86_400_000;

/** "2026-10-22" in UK time. */
const ukDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** Midnight UK time at the start of the month `offset` months from now's month. */
function ukMonthStart(now: Date, offset = 0): Date {
  const [y, m] = ukDay(now).split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1 + offset, 1));
  // UK is UTC or UTC+1: if the guess shows as the previous day in the UK, move back an hour.
  const hourUK = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(guess));
  return new Date(guess.getTime() - hourUK * 3_600_000);
}

const PAID = { "payment.amount": { $gt: 0 } };
const KEPT = { status: { $in: ["confirmed", "completed"] } };

async function paymentsPart(now: Date) {
  const fees = await getFees();
  const monthStart = ukMonthStart(now);
  const lastMonthStart = ukMonthStart(now, -1);
  const since = new Date(Math.min(lastMonthStart.getTime(), now.getTime() - 30 * DAY));
  const [paid, recent, bookings, lastMonthBookings] = await Promise.all([
    Consultation.find({ ...PAID, ...KEPT, createdAt: { $gte: since } })
      .select("payment.amount payment.currency payment.paidAt createdAt commissionRate")
      .lean(),
    Consultation.find(PAID)
      .sort({ createdAt: -1 })
      .limit(6)
      .populate<{ patient: { fullName?: string } | null }>("patient", "fullName")
      .populate<{ doctor: { user: { fullName?: string } | null } | null }>({ path: "doctor", select: "user", populate: { path: "user", select: "fullName" } }),
    Consultation.countDocuments({ createdAt: { $gte: monthStart } }),
    Consultation.countDocuments({ createdAt: { $gte: lastMonthStart, $lt: monthStart } }),
  ]);

  const month = { revenueGBP: 0, commissionGBP: 0, paid: 0 };
  const lastMonth = { revenueGBP: 0, commissionGBP: 0, paid: 0 };
  const days = new Map<string, { date: string; revenueGBP: number; commissionGBP: number; consultations: number }>();
  for (let i = 29; i >= 0; i--) {
    const date = ukDay(new Date(now.getTime() - i * DAY));
    days.set(date, { date, revenueGBP: 0, commissionGBP: 0, consultations: 0 });
  }
  for (const c of paid) {
    const at = new Date(c.payment.paidAt ?? c.createdAt);
    const gbp = toGBP(c.payment.amount, c.payment.currency);
    const commission = split(gbp, rateOf(c, fees)).commission;
    const bucket = at >= monthStart ? month : at >= lastMonthStart ? lastMonth : null;
    if (bucket) {
      bucket.revenueGBP += gbp;
      bucket.commissionGBP += commission;
      bucket.paid += 1;
    }
    const day = days.get(ukDay(at));
    if (day) {
      day.revenueGBP += gbp;
      day.commissionGBP += commission;
      day.consultations += 1;
    }
  }
  for (const b of [month, lastMonth]) {
    b.revenueGBP = round2(b.revenueGBP);
    b.commissionGBP = round2(b.commissionGBP);
  }
  const daily = [...days.values()].map((d) => ({ ...d, revenueGBP: round2(d.revenueGBP), commissionGBP: round2(d.commissionGBP) }));

  return {
    commissionRate: fees.commissionRate,
    month: { ...month, bookings, effectiveRate: month.revenueGBP ? round2(month.commissionGBP / month.revenueGBP) : fees.commissionRate },
    lastMonth: { ...lastMonth, bookings: lastMonthBookings },
    daily,
    recent: recent.map((c) => ({
      _id: c._id,
      reference: c.reference,
      patient: c.patient?.fullName ?? "Patient removed",
      doctor: c.doctor?.user?.fullName ?? "Doctor removed",
      amount: c.payment.amount,
      currency: c.payment.currency,
      amountGBP: toGBP(c.payment.amount, c.payment.currency),
      method: c.payment.method,
      details: c.payment.details,
      paidAt: c.payment.paidAt ?? c.createdAt,
      status: paymentStatusOf(c as unknown as IConsultation, now),
    })),
  };
}

async function payoutsPart() {
  const [balances, open] = await Promise.all([
    balancesFor(),
    Withdrawal.aggregate<{ n: number; sum: number }>([{ $match: { status: { $in: ["requested", "processing"] } } }, { $group: { _id: null, n: { $sum: 1 }, sum: { $sum: "$amountGBP" } } }]),
  ]);
  const all = [...balances.entries()];
  const total = (key: "clearingGBP" | "availableGBP" | "requestedGBP" | "paidOutGBP") => round2(all.reduce((s, [, b]) => s + b[key], 0));
  const top = all.sort(([, a], [, b]) => b.lifetimeGBP - a.lifetimeGBP).slice(0, 5);
  const doctors = await Doctor.find({ _id: { $in: top.map(([id]) => id) } })
    .select("specialization user")
    .populate<{ user: { fullName?: string } | null }>("user", "fullName");
  return {
    clearingGBP: total("clearingGBP"),
    availableGBP: total("availableGBP"),
    requestedGBP: total("requestedGBP"),
    paidOutGBP: total("paidOutGBP"),
    openRequests: { count: open[0]?.n ?? 0, sumGBP: round2(open[0]?.sum ?? 0) },
    topDoctors: top.map(([id, b]) => {
      const d = doctors.find((x) => String(x._id) === id);
      return { _id: id, name: d?.user?.fullName ?? "Doctor", specialization: d?.specialization ?? "", consultations: b.consultations, lifetimeGBP: b.lifetimeGBP };
    }),
  };
}

export const getOverview = asyncHandler(async (req: Request, res: Response) => {
  const now = new Date();
  const access = await accessFor(req.user!.role);
  const sees = (area: string) => allows(access[area], "view");
  const monthStart = ukMonthStart(now);

  const [payments, payouts, patients, doctors, stories, reports, flags, reviews, consultations] = await Promise.all([
    sees("payments") ? paymentsPart(now) : null,
    sees("payouts") ? payoutsPart() : null,
    sees("patients")
      ? Promise.all([
          User.countDocuments({ role: "patient" }),
          User.countDocuments({ role: "patient", isActive: true }),
          User.countDocuments({ role: "patient", createdAt: { $gte: monthStart } }),
        ]).then(([total, active, newThisMonth]) => ({ total, active, newThisMonth }))
      : null,
    sees("doctors")
      ? Promise.all([
          Doctor.countDocuments({ verificationStatus: "approved" }),
          Doctor.countDocuments({ verificationStatus: "pending" }),
          Doctor.countDocuments({ pendingUpdate: { $type: "object" } }),
        ]).then(([approved, pending, updates]) => ({ approved, pending, updates }))
      : null,
    sees("stories") ? Story.countDocuments({ status: "pending" }).then((pending) => ({ pending })) : null,
    sees("reports")
      ? Promise.all([Report.countDocuments({ status: { $in: ["open", "in_review"] } }), Report.countDocuments({ status: { $in: ["open", "in_review"] }, priority: "urgent" })]).then(
          ([open, urgent]) => ({ open, urgent })
        )
      : null,
    sees("chat_moderation")
      ? Promise.all([ChatFlag.countDocuments({ status: "new" }), ChatFlag.countDocuments({ status: "new", kind: "urgent_health" })]).then(([open, urgent]) => ({ open, urgent }))
      : null,
    sees("reviews") ? Review.countDocuments({ status: "held" }).then((held) => ({ held })) : null,
    sees("consultations")
      ? Promise.all([
          Consultation.countDocuments({ ...KEPT, startsAt: { $lte: now, $gt: new Date(now.getTime() - DAY) } }),
          Consultation.countDocuments({ ...KEPT, startsAt: { $gt: now } }),
        ]).then(([live, upcoming]) => ({ live, upcoming }))
      : null,
  ]);

  return ApiResponse(res, 200, "Dashboard fetched successfully", {
    now,
    clearsAfterDays: Math.round((consultationTimes(now).followUpEndsAt.getTime() - now.getTime()) / DAY),
    payments,
    payouts,
    patients,
    doctors,
    stories,
    reports,
    flags,
    reviews,
    consultations,
  });
});
