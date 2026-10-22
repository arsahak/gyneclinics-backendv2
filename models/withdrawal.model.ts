import mongoose, { Schema, Document } from "mongoose";

// A doctor asks for their cleared earnings; a super admin sends it with Stripe.
//   requested → paid (a Stripe transfer to the doctor's Connect account; Stripe
//   then pays it out to their bank or card)
//   requested → rejected (with a reason; the money goes back to the balance)
// "processing" and `bank` are from before Stripe, kept for old requests.

export const WITHDRAWAL_STATUSES = ["requested", "processing", "paid", "rejected"] as const;
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number];

export interface IWithdrawal extends Document {
  doctor: mongoose.Types.ObjectId;
  amountGBP: number;
  status: WithdrawalStatus;
  /** Old bank-transfer requests only. */
  bank?: { accountName: string; bankName: string; accountNumber: string; sortCode?: string; iban?: string; swift?: string; country: string };
  /** The doctor's Stripe account when they asked, and where Stripe pays them. */
  stripeAccountId?: string;
  destination?: string;
  stripeTransferId?: string;
  /** Made by the weekly payout run (the doctor didn't ask). */
  auto?: boolean;
  processingAt?: Date;
  paidAt?: Date;
  transferRef?: string;
  rejectionReason?: string;
  handledBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Withdrawal:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         doctor: { type: string }
 *         amountGBP: { type: number }
 *         status: { type: string, enum: [requested, processing, paid, rejected] }
 *         transferRef: { type: string }
 *         rejectionReason: { type: string }
 *         createdAt: { type: string, format: date-time }
 */
const withdrawalSchema = new Schema<IWithdrawal>(
  {
    doctor: { type: Schema.Types.ObjectId, ref: "Doctor", required: true, index: true },
    amountGBP: { type: Number, required: true, min: 0 },
    status: { type: String, enum: WITHDRAWAL_STATUSES, default: "requested", index: true },
    bank: {
      type: new Schema(
        {
          accountName: { type: String, required: true },
          bankName: { type: String, required: true },
          accountNumber: { type: String, required: true },
          sortCode: String,
          iban: String,
          swift: String,
          country: { type: String, required: true },
        },
        { _id: false }
      ),
    },
    stripeAccountId: String,
    destination: { type: String, trim: true, maxlength: 100 },
    stripeTransferId: { type: String, index: true, sparse: true },
    auto: { type: Boolean, default: false },
    processingAt: Date,
    paidAt: Date,
    transferRef: { type: String, trim: true, maxlength: 60 },
    rejectionReason: { type: String, trim: true, maxlength: 300 },
    handledBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

withdrawalSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { __v, ...rest } = ret as typeof ret & { __v?: number };
    return rest;
  },
});

export const Withdrawal = mongoose.model<IWithdrawal>("Withdrawal", withdrawalSchema);
