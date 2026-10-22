import mongoose, { Schema, Document } from "mongoose";

// A booked consultation: created when the patient's payment is confirmed.

export const CONSULTATION_MODES = ["instant", "scheduled"] as const;
export const CONSULTATION_STATUSES = ["confirmed", "completed", "cancelled", "refunded"] as const;
export const SMS_STATUSES = ["sent", "failed", "skipped"] as const;

export interface IConsultationPayment {
  amount: number;
  currency: string;
  regionId: string;
  method: string;
  reference: string;
  details?: string;
  paidAt?: Date;
  /** "stripe" for paid bookings, "free" when there was nothing to pay. Missing on bookings made before Stripe. */
  provider?: "stripe" | "free";
  /** The Stripe PaymentIntent (pi_…); also used as `reference`. */
  stripePaymentIntentId?: string;
  stripeChargeId?: string;
}

export interface ISmsLog {
  status: (typeof SMS_STATUSES)[number];
  to: string;
  sid?: string;
  error?: string;
  at: Date;
}

export interface IConsultation extends Document {
  /** Shown to the patient, e.g. "GC-4K7Q2M". */
  reference: string;
  patient: mongoose.Types.ObjectId;
  doctor: mongoose.Types.ObjectId;
  mode: (typeof CONSULTATION_MODES)[number];
  concern: string;
  startsAt: Date;
  /** The patient's time zone, for times in messages. */
  timezone: string;
  payment: IConsultationPayment;
  status: (typeof CONSULTATION_STATUSES)[number];
  /** Booking confirmation text to the patient. */
  confirmationSms?: ISmsLog;
  /** The commission rate when it was booked (later rate changes don't touch it). Missing = 20%, the rate before this was stored. */
  commissionRate?: number;
  /** Set when staff record a refund (after sending the money back). */
  refund?: { at: Date; reason: string; by?: mongoose.Types.ObjectId; stripeRefundId?: string };
  createdAt: Date;
  updatedAt: Date;
}

const smsLogSchema = new Schema<ISmsLog>(
  {
    status: { type: String, enum: SMS_STATUSES, required: true },
    to: { type: String, required: true },
    sid: String,
    error: String,
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

/**
 * @swagger
 * components:
 *   schemas:
 *     Consultation:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         reference: { type: string, example: GC-4K7Q2M }
 *         patient: { type: string }
 *         doctor: { type: string }
 *         mode: { type: string, enum: [instant, scheduled] }
 *         concern: { type: string }
 *         startsAt: { type: string, format: date-time }
 *         timezone: { type: string, example: Asia/Dhaka }
 *         status: { type: string, enum: [confirmed, completed, cancelled, refunded] }
 *         payment:
 *           type: object
 *           properties:
 *             amount: { type: number }
 *             currency: { type: string }
 *             regionId: { type: string }
 *             method: { type: string }
 *             reference: { type: string }
 *             details: { type: string }
 *             paidAt: { type: string, format: date-time }
 *             provider: { type: string, enum: [stripe, free] }
 *             stripePaymentIntentId: { type: string }
 *         confirmationSms:
 *           type: object
 *           properties:
 *             status: { type: string, enum: [sent, failed, skipped] }
 *             at: { type: string, format: date-time }
 */
const consultationSchema = new Schema<IConsultation>(
  {
    reference: { type: String, required: true, unique: true, trim: true },
    patient: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    doctor: { type: Schema.Types.ObjectId, ref: "Doctor", required: true, index: true },
    mode: { type: String, enum: CONSULTATION_MODES, required: true },
    concern: { type: String, required: true, trim: true, maxlength: 1000 },
    startsAt: { type: Date, required: true },
    timezone: { type: String, default: "Europe/London" },
    payment: {
      amount: { type: Number, required: true, min: 0 },
      currency: { type: String, required: true, uppercase: true, trim: true },
      regionId: { type: String, required: true, trim: true },
      method: { type: String, required: true, trim: true },
      reference: { type: String, required: true, trim: true },
      details: { type: String, trim: true },
      paidAt: Date,
      provider: { type: String, enum: ["stripe", "free"] },
      stripePaymentIntentId: { type: String, trim: true },
      stripeChargeId: { type: String, trim: true },
    },
    status: { type: String, enum: CONSULTATION_STATUSES, default: "confirmed" },
    confirmationSms: { type: smsLogSchema },
    commissionRate: { type: Number, min: 0, max: 0.5 },
    refund: {
      type: new Schema(
        {
          at: { type: Date, required: true },
          reason: { type: String, required: true, trim: true, maxlength: 300 },
          // Missing when it was refunded straight in Stripe.
          by: { type: Schema.Types.ObjectId, ref: "User" },
          stripeRefundId: String,
        },
        { _id: false }
      ),
    },
  },
  { timestamps: true }
);

consultationSchema.index({ patient: 1, startsAt: -1 });
// One booking per Stripe payment, however many times it's confirmed (app + webhook).
consultationSchema.index({ "payment.stripePaymentIntentId": 1 }, { unique: true, partialFilterExpression: { "payment.stripePaymentIntentId": { $type: "string" } } });

consultationSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { __v, ...rest } = ret as typeof ret & { __v?: number };
    // The message id and phone are for support, not for the app.
    if (rest.confirmationSms) rest.confirmationSms = { status: rest.confirmationSms.status, at: rest.confirmationSms.at } as ISmsLog;
    return rest;
  },
});

export const Consultation = mongoose.model<IConsultation>("Consultation", consultationSchema);
