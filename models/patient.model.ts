import mongoose, { Schema, Document } from "mongoose";

// Health profile for a user with role "patient". Name, phone and email stay
// on User; this holds what the webapp's patient onboarding collects.
export const PREGNANCY_STATUSES = [
  "not_pregnant",
  "trying",
  "pregnant",
  "postpartum",
] as const;
export type PregnancyStatus = (typeof PREGNANCY_STATUSES)[number];

export interface IReminderSettings {
  periodReminder: boolean;
  daysBefore: number;
  fertileReminder: boolean;
  dailyLogReminder: boolean;
}

export interface IPatient extends Document {
  user: mongoose.Types.ObjectId;
  dateOfBirth?: Date;
  heightCm?: number;
  weightKg?: number;
  typicalCycleLength: number;
  typicalPeriodLength: number;
  lastPeriodStart?: Date;
  pregnancyStatus: PregnancyStatus;
  /** Required while pregnancyStatus is "pregnant". */
  dueDate?: Date;
  reminders: IReminderSettings;
  /** Slugs of saved Learn articles, newest first. */
  bookmarks: string[];
  /** When the onboarding answers were copied into the health logs (internal). */
  trackerSeededAt?: Date;
  /** Set when the patient finishes onboarding. */
  onboardedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const reminderSchema = new Schema<IReminderSettings>(
  {
    periodReminder: { type: Boolean, default: true },
    daysBefore: { type: Number, min: 0, max: 7, default: 2 },
    fertileReminder: { type: Boolean, default: false },
    dailyLogReminder: { type: Boolean, default: false },
  },
  { _id: false }
);

/**
 * @swagger
 * components:
 *   schemas:
 *     Patient:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         user:
 *           type: string
 *           description: Id of the User account (role "patient")
 *         dateOfBirth:
 *           type: string
 *           format: date
 *           example: "1997-04-12"
 *         heightCm:
 *           type: number
 *           example: 163
 *         weightKg:
 *           type: number
 *           example: 61.5
 *         typicalCycleLength:
 *           type: number
 *           example: 28
 *         typicalPeriodLength:
 *           type: number
 *           example: 5
 *         lastPeriodStart:
 *           type: string
 *           format: date
 *           nullable: true
 *         pregnancyStatus:
 *           type: string
 *           enum: [not_pregnant, trying, pregnant, postpartum]
 *         dueDate:
 *           type: string
 *           format: date
 *           nullable: true
 *         reminders:
 *           type: object
 *           properties:
 *             periodReminder:
 *               type: boolean
 *             daysBefore:
 *               type: number
 *             fertileReminder:
 *               type: boolean
 *             dailyLogReminder:
 *               type: boolean
 *         bookmarks:
 *           type: array
 *           items: { type: string }
 *           description: Slugs of saved Learn articles, newest first
 *         onboardedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */
const patientSchema = new Schema<IPatient>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    dateOfBirth: { type: Date },
    heightCm: { type: Number, min: [100, "Height must be at least 100 cm"], max: [230, "Height must be at most 230 cm"] },
    weightKg: { type: Number, min: [25, "Weight must be at least 25 kg"], max: [250, "Weight must be at most 250 kg"] },
    typicalCycleLength: { type: Number, min: 15, max: 60, default: 28 },
    typicalPeriodLength: { type: Number, min: 1, max: 14, default: 5 },
    lastPeriodStart: { type: Date },
    pregnancyStatus: {
      type: String,
      enum: PREGNANCY_STATUSES,
      default: "not_pregnant",
    },
    dueDate: { type: Date },
    reminders: { type: reminderSchema, default: () => ({}) },
    bookmarks: { type: [String], default: [] },
    trackerSeededAt: { type: Date },
    onboardedAt: { type: Date },
  },
  { timestamps: true }
);

patientSchema.pre("validate", function (next) {
  if (this.pregnancyStatus === "pregnant" && !this.dueDate) {
    this.invalidate("dueDate", "Due date is required when pregnant");
  }
  next();
});

patientSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { __v, ...rest } = ret as typeof ret & { __v?: number };
    return rest;
  },
});

export const Patient = mongoose.model<IPatient>("Patient", patientSchema);
