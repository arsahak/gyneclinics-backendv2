import mongoose, { Schema, Document } from "mongoose";
import { CONSULTATION_MODES } from "./consultation.model";

// A booking waiting for its Stripe payment. Made when the patient opens the
// payment form; the consultation is created from it once Stripe says the money
// arrived (from the app, or from the webhook if the patient closed the page).
// Old ones are removed after 3 days.

export interface ICheckout extends Document {
  paymentIntentId: string;
  /** The booking reference the consultation will get, e.g. "GC-4K7Q2M". */
  reference: string;
  patient: mongoose.Types.ObjectId;
  doctor: mongoose.Types.ObjectId;
  mode: (typeof CONSULTATION_MODES)[number];
  concern: string;
  startsAt: Date;
  timezone: string;
  regionId: string;
  amount: number;
  currency: string;
  /** Set once the consultation is saved. */
  consultation?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const checkoutSchema = new Schema<ICheckout>(
  {
    paymentIntentId: { type: String, required: true, unique: true },
    reference: { type: String, required: true },
    patient: { type: Schema.Types.ObjectId, ref: "User", required: true },
    doctor: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    mode: { type: String, enum: CONSULTATION_MODES, required: true },
    concern: { type: String, required: true, maxlength: 1000 },
    startsAt: { type: Date, required: true },
    timezone: { type: String, default: "Europe/London" },
    regionId: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true },
    consultation: { type: Schema.Types.ObjectId, ref: "Consultation" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

checkoutSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3 * 24 * 3600 });

export const Checkout = mongoose.model<ICheckout>("Checkout", checkoutSchema);
