import mongoose, { Schema, Document } from "mongoose";

// Something the chat safety filter caught, for Chat Moderation.
//   blocked   = contact details: the message was refused and never delivered;
//   delivered = abusive or urgent-health words: delivered, then flagged for the team.

export const FLAG_KINDS = ["phone", "email", "link", "social", "abuse", "urgent_health"] as const;
export type FlagKind = (typeof FLAG_KINDS)[number];

export const FLAG_STATUSES = ["new", "allowed", "warned", "suspended", "escalated"] as const;
export type FlagStatus = (typeof FLAG_STATUSES)[number];

export interface IChatFlag extends Document {
  chat: mongoose.Types.ObjectId;
  /** The delivered message (none for blocked ones). */
  message?: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  senderRole: "patient" | "doctor";
  recipient: mongoose.Types.ObjectId;
  kind: FlagKind;
  outcome: "blocked" | "delivered";
  /** What they wrote (staff only). */
  text: string;
  /** The part that matched. */
  match: string;
  status: FlagStatus;
  handledBy?: mongoose.Types.ObjectId;
  handledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const chatFlagSchema = new Schema<IChatFlag>(
  {
    chat: { type: Schema.Types.ObjectId, ref: "Chat", required: true, index: true },
    message: { type: Schema.Types.ObjectId, ref: "ChatMessage" },
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    senderRole: { type: String, enum: ["patient", "doctor"], required: true },
    recipient: { type: Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, enum: FLAG_KINDS, required: true },
    outcome: { type: String, enum: ["blocked", "delivered"], required: true },
    text: { type: String, required: true, maxlength: 2000 },
    match: { type: String, required: true, maxlength: 200 },
    status: { type: String, enum: FLAG_STATUSES, default: "new", index: true },
    handledBy: { type: Schema.Types.ObjectId, ref: "User" },
    handledAt: Date,
  },
  { timestamps: true }
);

chatFlagSchema.index({ status: 1, kind: 1, createdAt: -1 });

chatFlagSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { __v, ...rest } = ret as typeof ret & { __v?: number };
    return rest;
  },
});

export const ChatFlag = mongoose.model<IChatFlag>("ChatFlag", chatFlagSchema);
