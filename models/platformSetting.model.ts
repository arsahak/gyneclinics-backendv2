import mongoose, { Schema, Document } from "mongoose";

// Money rules the team sets in the dashboard (Fees & Commission). One document.

export const PAYOUT_SCHEDULES = ["on_request", "weekly"] as const;
export type PayoutSchedule = (typeof PAYOUT_SCHEDULES)[number];

/** One saved change, shown as "Commission 20% → 22%". */
export interface IFeeChange {
  at: Date;
  by?: mongoose.Types.ObjectId;
  changes: string[];
}

/** The last time payouts were sent in one go (every Friday, or "Pay now"). */
export interface IPayoutRun {
  at: Date;
  trigger: "schedule" | "manual";
  by?: mongoose.Types.ObjectId;
  sent: number;
  sentGBP: number;
  skipped: number;
}

export interface IPlatformSetting extends Document {
  key: "fees";
  /** Share GyneClinics keeps, 0–0.5. Each booking stores the rate it was made with. */
  commissionRate: number;
  minWithdrawalGBP: number;
  payoutSchedule: PayoutSchedule;
  /** Price per region as a share of the doctor's UK fee, e.g. south_asia: 0.25. Missing regions use the default. */
  regionMultipliers?: Map<string, number>;
  /** Newest first, last 50. */
  history: IFeeChange[];
  lastPayoutRun?: IPayoutRun;
  updatedBy?: mongoose.Types.ObjectId;
  updatedAt: Date;
}

const platformSettingSchema = new Schema<IPlatformSetting>(
  {
    key: { type: String, enum: ["fees"], required: true, unique: true },
    commissionRate: { type: Number, required: true, min: 0, max: 0.5 },
    minWithdrawalGBP: { type: Number, required: true, min: 0, max: 1000 },
    payoutSchedule: { type: String, enum: PAYOUT_SCHEDULES, required: true },
    regionMultipliers: { type: Map, of: { type: Number, min: 0.05, max: 3 } },
    history: {
      type: [
        new Schema<IFeeChange>(
          {
            at: { type: Date, required: true },
            by: { type: Schema.Types.ObjectId, ref: "User" },
            changes: { type: [String], default: [] },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    lastPayoutRun: {
      type: new Schema<IPayoutRun>(
        {
          at: { type: Date, required: true },
          trigger: { type: String, enum: ["schedule", "manual"], required: true },
          by: { type: Schema.Types.ObjectId, ref: "User" },
          sent: { type: Number, default: 0 },
          sentGBP: { type: Number, default: 0 },
          skipped: { type: Number, default: 0 },
        },
        { _id: false }
      ),
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const PlatformSetting = mongoose.model<IPlatformSetting>("PlatformSetting", platformSettingSchema);
