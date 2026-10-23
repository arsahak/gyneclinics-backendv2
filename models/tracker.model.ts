import mongoose, { Schema, Document } from "mongoose";

// A patient's own health logs: periods, weight and baby growth from scan
// reports. Dates are calendar days ("yyyy-MM-dd") in the patient's time zone,
// stored as text so they never shift between time zones.

export const PERIOD_FLOWS = ["light", "medium", "heavy"] as const;
export type PeriodFlow = (typeof PERIOD_FLOWS)[number];

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// ── Periods ─────────────────────────────────────────────────────────────────

export interface IPeriodLog extends Document {
  patient: mongoose.Types.ObjectId;
  start: string;
  end?: string;
  flow?: PeriodFlow;
  symptoms: string[];
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const periodLogSchema = new Schema<IPeriodLog>(
  {
    patient: { type: Schema.Types.ObjectId, ref: "User", required: true },
    start: { type: String, required: true, match: DAY },
    end: { type: String, match: DAY },
    flow: { type: String, enum: PERIOD_FLOWS },
    symptoms: { type: [String], default: [] },
    note: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true, versionKey: false }
);
periodLogSchema.index({ patient: 1, start: -1 });

export const PeriodLog = mongoose.model<IPeriodLog>("PeriodLog", periodLogSchema);

// ── Weight ──────────────────────────────────────────────────────────────────

export interface IWeightLog extends Document {
  patient: mongoose.Types.ObjectId;
  date: string;
  kg: number;
  createdAt: Date;
  updatedAt: Date;
}

const weightLogSchema = new Schema<IWeightLog>(
  {
    patient: { type: Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true, match: DAY },
    kg: { type: Number, required: true, min: 25, max: 250 },
  },
  { timestamps: true, versionKey: false }
);
weightLogSchema.index({ patient: 1, date: -1 });

export const WeightLog = mongoose.model<IWeightLog>("WeightLog", weightLogSchema);

// ── Baby growth (from scan reports) ─────────────────────────────────────────

export interface IBabyGrowthLog extends Document {
  patient: mongoose.Types.ObjectId;
  date: string;
  /** Gestational week on the scan report. */
  week: number;
  weightG: number;
  lengthCm: number;
  createdAt: Date;
  updatedAt: Date;
}

const babyGrowthLogSchema = new Schema<IBabyGrowthLog>(
  {
    patient: { type: Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true, match: DAY },
    week: { type: Number, required: true, min: 4, max: 42 },
    weightG: { type: Number, required: true, min: 1, max: 6000 },
    lengthCm: { type: Number, required: true, min: 0.1, max: 60 },
  },
  { timestamps: true, versionKey: false }
);
babyGrowthLogSchema.index({ patient: 1, week: 1 });

export const BabyGrowthLog = mongoose.model<IBabyGrowthLog>("BabyGrowthLog", babyGrowthLogSchema);
