import mongoose, { Schema, Document } from "mongoose";

// One conversation per patient and doctor. Messages live in ChatMessage;
// these fields are kept up to date so lists don't have to read every message.

export interface IChat extends Document {
  patient: mongoose.Types.ObjectId;
  doctor: mongoose.Types.ObjectId;
  /** When the patient first wrote, and when the doctor first answered (for reply times). */
  firstMessageAt?: Date;
  firstReplyAt?: Date;
  lastMessageAt?: Date;
  lastMessageText?: string;
  lastSenderRole?: "patient" | "doctor";
  messageCount: number;
  /** Messages here that the safety filter caught (blocked or flagged). */
  flaggedCount: number;
  patientUnread: number;
  doctorUnread: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Chat:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         patient: { type: string }
 *         doctor: { type: string }
 *         lastMessageAt: { type: string, format: date-time }
 *         lastMessageText: { type: string }
 *         lastSenderRole: { type: string, enum: [patient, doctor] }
 *         messageCount: { type: integer }
 *         flaggedCount: { type: integer }
 *         patientUnread: { type: integer }
 *         doctorUnread: { type: integer }
 *     ChatMessage:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         chat: { type: string }
 *         senderRole: { type: string, enum: [patient, doctor] }
 *         text: { type: string }
 *         flags: { type: array, items: { type: string } }
 *         createdAt: { type: string, format: date-time }
 */
const chatSchema = new Schema<IChat>(
  {
    patient: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    doctor: { type: Schema.Types.ObjectId, ref: "Doctor", required: true, index: true },
    firstMessageAt: Date,
    firstReplyAt: Date,
    lastMessageAt: { type: Date, index: true },
    lastMessageText: { type: String, maxlength: 140 },
    lastSenderRole: { type: String, enum: ["patient", "doctor"] },
    messageCount: { type: Number, default: 0, min: 0 },
    flaggedCount: { type: Number, default: 0, min: 0 },
    patientUnread: { type: Number, default: 0, min: 0 },
    doctorUnread: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

chatSchema.index({ patient: 1, doctor: 1 }, { unique: true });

chatSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { __v, ...rest } = ret as typeof ret & { __v?: number };
    return rest;
  },
});

export const Chat = mongoose.model<IChat>("Chat", chatSchema);
