import mongoose, { Schema, Document } from "mongoose";

// A patient or doctor reports a problem with the other person. Staff pick it up,
// act, and close it with a note the reporter can see.

export const REPORT_REASONS = ["medical_concern", "off_platform", "no_reply", "behaviour", "payment", "fake_profile", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ["open", "in_review", "resolved", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_PRIORITIES = ["urgent", "high", "normal"] as const;
export type ReportPriority = (typeof REPORT_PRIORITIES)[number];

export const REPORT_ACTIONS = ["warned", "suspended", "refunded", "content_removed", "no_action"] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];

/** Patient safety first: unsafe advice and fake doctors are urgent. */
export const PRIORITY_FOR: Record<ReportReason, ReportPriority> = {
  medical_concern: "urgent",
  fake_profile: "urgent",
  off_platform: "high",
  no_reply: "high",
  behaviour: "normal",
  payment: "normal",
  other: "normal",
};

export interface IReport extends Document {
  reporter: mongoose.Types.ObjectId;
  reporterRole: "patient" | "doctor";
  /** The user being reported. */
  against: mongoose.Types.ObjectId;
  againstRole: "patient" | "doctor";
  /** The doctor profile, when a doctor is reported (links to /doctors/:id). */
  againstDoctor?: mongoose.Types.ObjectId;
  consultation?: mongoose.Types.ObjectId;
  reason: ReportReason;
  details: string;
  priority: ReportPriority;
  status: ReportStatus;
  assignee?: mongoose.Types.ObjectId;
  resolution?: { action: ReportAction; note: string; by: mongoose.Types.ObjectId; at: Date };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Report:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         reporter: { type: string }
 *         reporterRole: { type: string, enum: [patient, doctor] }
 *         against: { type: string }
 *         againstRole: { type: string, enum: [patient, doctor] }
 *         consultation: { type: string }
 *         reason: { type: string, enum: [medical_concern, off_platform, no_reply, behaviour, payment, fake_profile, other] }
 *         details: { type: string }
 *         priority: { type: string, enum: [urgent, high, normal] }
 *         status: { type: string, enum: [open, in_review, resolved, dismissed] }
 *         resolution:
 *           type: object
 *           properties:
 *             action: { type: string, enum: [warned, suspended, refunded, content_removed, no_action] }
 *             note: { type: string }
 *             at: { type: string, format: date-time }
 *         createdAt: { type: string, format: date-time }
 */
const reportSchema = new Schema<IReport>(
  {
    reporter: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    reporterRole: { type: String, enum: ["patient", "doctor"], required: true },
    against: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    againstRole: { type: String, enum: ["patient", "doctor"], required: true },
    againstDoctor: { type: Schema.Types.ObjectId, ref: "Doctor" },
    consultation: { type: Schema.Types.ObjectId, ref: "Consultation" },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    details: { type: String, required: true, trim: true, minlength: 10, maxlength: 1000 },
    priority: { type: String, enum: REPORT_PRIORITIES, required: true },
    status: { type: String, enum: REPORT_STATUSES, default: "open", index: true },
    assignee: { type: Schema.Types.ObjectId, ref: "User" },
    resolution: {
      type: new Schema(
        {
          action: { type: String, enum: REPORT_ACTIONS, required: true },
          note: { type: String, required: true, trim: true, maxlength: 1000 },
          by: { type: Schema.Types.ObjectId, ref: "User", required: true },
          at: { type: Date, required: true },
        },
        { _id: false }
      ),
    },
  },
  { timestamps: true }
);

reportSchema.index({ status: 1, priority: 1, createdAt: -1 });

reportSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { __v, ...rest } = ret as typeof ret & { __v?: number };
    return rest;
  },
});

export const Report = mongoose.model<IReport>("Report", reportSchema);
