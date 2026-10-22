import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../middleware/asyncHandler";
import { Consultation } from "../models/consultation.model";
import { Doctor } from "../models/doctor.model";
import { PRIORITY_FOR, Report, type ReportAction, type ReportReason, type ReportStatus } from "../models/report.model";
import { User } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { notify } from "../utils/notify";
import { alertStaff, moneyText } from "../utils/staffAlerts";

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const OPEN: ReportStatus[] = ["open", "in_review"];

// ── Patients and doctors ────────────────────────────────────────────────────

/**
 * Report the other person. A patient reports a doctor (doctorId = profile id);
 * a doctor reports a patient (patientId = user id). The latest consultation
 * between them is attached when there is one.
 */
export const createReport = asyncHandler(async (req: Request, res: Response) => {
  const reporter = req.user!;
  const reason = req.body.reason as ReportReason;
  const details = String(req.body.details).trim();

  let againstUser: mongoose.Types.ObjectId;
  let againstDoctor: mongoose.Types.ObjectId | undefined;
  let consultationFilter: Record<string, unknown>;

  if (reporter.role === "patient") {
    if (!req.body.doctorId) throw new ApiError(422, "Choose the doctor you're reporting");
    const doctor = await Doctor.findById(req.body.doctorId);
    if (!doctor) throw new ApiError(404, "Doctor not found");
    againstUser = doctor.user;
    againstDoctor = doctor._id as mongoose.Types.ObjectId;
    consultationFilter = { patient: reporter._id, doctor: doctor._id };
  } else {
    if (!req.body.patientId) throw new ApiError(422, "Choose the patient you're reporting");
    const [patient, doctor] = await Promise.all([User.findOne({ _id: req.body.patientId, role: "patient" }), Doctor.findOne({ user: reporter._id })]);
    if (!patient) throw new ApiError(404, "Patient not found");
    if (!doctor) throw new ApiError(403, "Finish your doctor profile first");
    againstUser = patient._id as mongoose.Types.ObjectId;
    consultationFilter = { patient: patient._id, doctor: doctor._id };
  }

  // The same open problem twice would only slow the team down.
  if (await Report.exists({ reporter: reporter._id, against: againstUser, reason, status: { $in: OPEN } })) {
    throw new ApiError(409, "You've already reported this. Our team is looking into it.");
  }

  const consultation = req.body.consultationId
    ? await Consultation.findOne({ _id: req.body.consultationId, ...consultationFilter })
    : await Consultation.findOne(consultationFilter).sort({ startsAt: -1 });

  const report = await Report.create({
    reporter: reporter._id,
    reporterRole: reporter.role,
    against: againstUser,
    againstRole: reporter.role === "patient" ? "doctor" : "patient",
    againstDoctor,
    consultation: consultation?._id,
    reason,
    details,
    priority: PRIORITY_FOR[reason],
  });
  await alertStaff({
    type: "report_created",
    areas: ["reports"],
    title: report.priority === "urgent" ? "Urgent report" : "New report",
    body: `${reporter.fullName || `A ${reporter.role}`} reported a ${report.againstRole}: ${String(reason).replace(/_/g, " ")}.${details ? ` "${String(details).slice(0, 120)}"` : ""}`,
    link: "/reports",
    priority: report.priority === "urgent" ? "urgent" : "normal",
  });

  return ApiResponse(
    res,
    201,
    report.priority === "urgent"
      ? "Thank you. This is urgent for us and someone will look at it within an hour."
      : "Thank you. Our team will look into it and let you know what we did.",
    report
  );
});

/** The reporter's own reports, with what the team did. */
export const listMyReports = asyncHandler(async (req: Request, res: Response) => {
  const reports = await Report.find({ reporter: req.user!._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .select("reason details status priority resolution.action resolution.note resolution.at createdAt against")
    .populate("against", "fullName");
  return ApiResponse(res, 200, "Reports fetched successfully", reports);
});

// ── Staff ───────────────────────────────────────────────────────────────────

/**
 * Staff list. status "todo" = open + in review, urgent first.
 * Stats: count per status, urgent still open, average hours to close.
 */
export const listReports = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const status = String(req.query.status ?? "todo");
  const search = String(req.query.search ?? "").trim();

  const filter: Record<string, unknown> = {};
  if (status === "todo") filter.status = { $in: OPEN };
  else if (status !== "all") filter.status = status;
  if (req.query.priority) filter.priority = String(req.query.priority);
  if (req.query.reason) filter.reason = String(req.query.reason);
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    const [users, consultations] = await Promise.all([
      User.find({ $or: [{ fullName: pattern }, { phone: pattern }] }).distinct("_id"),
      Consultation.find({ reference: pattern }).distinct("_id"),
    ]);
    filter.$or = [{ details: pattern }, { reporter: { $in: users } }, { against: { $in: users } }, { consultation: { $in: consultations } }];
  }

  // Urgent first, then newest. Priority is stored as text, so rank it in the pipeline.
  const [ids, total, statusCounts, urgentOpen, closeTimes] = await Promise.all([
    Report.aggregate<{ _id: mongoose.Types.ObjectId }>([
      { $match: filter },
      { $addFields: { rank: { $indexOfArray: [["urgent", "high", "normal"], "$priority"] } } },
      { $sort: status === "todo" ? { rank: 1, createdAt: -1 } : { createdAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      { $project: { _id: 1 } },
    ]),
    Report.countDocuments(filter),
    Report.aggregate<{ _id: ReportStatus; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    Report.countDocuments({ status: { $in: OPEN }, priority: "urgent" }),
    Report.aggregate<{ avg: number }>([
      { $match: { "resolution.at": { $exists: true } } },
      { $group: { _id: null, avg: { $avg: { $subtract: ["$resolution.at", "$createdAt"] } } } },
    ]),
  ]);

  const docs = await Report.find({ _id: { $in: ids.map((x) => x._id) } })
    .populate("reporter", "fullName phone avatar role")
    .populate("against", "fullName phone avatar role")
    .populate("consultation", "reference startsAt")
    .populate("assignee", "fullName")
    .populate("resolution.by", "fullName");
  // Keep the aggregate's order.
  const reports = ids.map((x) => docs.find((d) => String(d._id) === String(x._id))).filter(Boolean);
  const count = (s: ReportStatus) => statusCounts.find((c) => c._id === s)?.n ?? 0;

  return ApiResponse(res, 200, "Reports fetched successfully", {
    reports,
    pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
    stats: {
      total: statusCounts.reduce((sum, c) => sum + c.n, 0),
      open: count("open"),
      in_review: count("in_review"),
      resolved: count("resolved"),
      dismissed: count("dismissed"),
      urgentOpen,
      avgHoursToClose: closeTimes[0] ? Math.round(closeTimes[0].avg / 3_600_000) : null,
    },
  });
});

async function reportOr404(id: string) {
  const report = await Report.findById(id);
  if (!report) throw new ApiError(404, "Report not found");
  return report;
}

/** "I'll handle it": in review, assigned to the caller. */
export const takeReport = asyncHandler(async (req: Request, res: Response) => {
  const report = await reportOr404(req.params.id);
  if (!OPEN.includes(report.status)) throw new ApiError(409, "This report is already closed");
  report.status = "in_review";
  report.assignee = req.user!._id as mongoose.Types.ObjectId;
  await report.save();
  return ApiResponse(res, 200, "You're now handling this report", report);
});

/** Close it: resolved (with what was done) or dismissed. The note is for the reporter. */
export const closeReport = asyncHandler(async (req: Request, res: Response) => {
  const report = await reportOr404(req.params.id);
  if (!OPEN.includes(report.status)) throw new ApiError(409, "This report is already closed");
  const outcome = req.body.outcome as "resolved" | "dismissed";
  const note = String(req.body.note ?? "").trim();
  if (outcome === "resolved" && !note) throw new ApiError(422, "Write what you did, so the reporter can be told");

  report.status = outcome;
  report.assignee ??= req.user!._id as mongoose.Types.ObjectId;
  report.resolution = {
    action: outcome === "dismissed" ? "no_action" : (req.body.action as ReportAction),
    note: note || "We checked and found nothing against our rules.",
    by: req.user!._id as mongoose.Types.ObjectId,
    at: new Date(),
  };
  await report.save();
  await notify([report.reporter], {
    autoKey: "report_closed",
    title: "We've looked into your report",
    body: report.resolution.note,
  });
  return ApiResponse(res, 200, outcome === "resolved" ? "Report resolved" : "Report dismissed", report);
});
