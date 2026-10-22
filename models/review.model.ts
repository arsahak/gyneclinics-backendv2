import mongoose, { Schema, Document } from "mongoose";

// A patient's review of a doctor, written after a consultation with them.
// published = on the doctor's profile and counted in their rating;
// held = waiting for a team check (e.g. 1–2 stars); hidden = taken down by staff.

export const REVIEW_STATUSES = ["published", "held", "hidden"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_HOLD_REASONS = ["low_rating", "language"] as const;
export type ReviewHoldReason = (typeof REVIEW_HOLD_REASONS)[number];

export interface IReview extends Document {
  doctor: mongoose.Types.ObjectId;
  patient: mongoose.Types.ObjectId;
  /** The consultation that lets the patient review this doctor. */
  consultation: mongoose.Types.ObjectId;
  rating: number;
  text: string;
  status: ReviewStatus;
  holdReason?: ReviewHoldReason;
  /** Why staff hid it (staff only). */
  hiddenReason?: string;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Review:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         doctor: { type: string }
 *         patient: { type: string }
 *         consultation: { type: string }
 *         rating: { type: integer, minimum: 1, maximum: 5 }
 *         text: { type: string }
 *         status: { type: string, enum: [published, held, hidden] }
 *         holdReason: { type: string, enum: [low_rating, language] }
 *         hiddenReason: { type: string }
 *         createdAt: { type: string, format: date-time }
 */
const reviewSchema = new Schema<IReview>(
  {
    doctor: { type: Schema.Types.ObjectId, ref: "Doctor", required: true, index: true },
    patient: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    consultation: { type: Schema.Types.ObjectId, ref: "Consultation", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, required: true, trim: true, minlength: 10, maxlength: 1000 },
    status: { type: String, enum: REVIEW_STATUSES, default: "published", index: true },
    holdReason: { type: String, enum: REVIEW_HOLD_REASONS },
    hiddenReason: { type: String, trim: true, maxlength: 300 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
  },
  { timestamps: true }
);

// One review per patient per doctor.
reviewSchema.index({ doctor: 1, patient: 1 }, { unique: true });
reviewSchema.index({ doctor: 1, status: 1, createdAt: -1 });

reviewSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { __v, ...rest } = ret as typeof ret & { __v?: number };
    return rest;
  },
});

export const Review = mongoose.model<IReview>("Review", reviewSchema);
