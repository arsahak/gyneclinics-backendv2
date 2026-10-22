import mongoose, { Schema, Document } from "mongoose";

// A message in a patient–doctor chat. Messages with contact details are never
// saved here (they're refused and logged as a ChatFlag instead).

export const MESSAGE_FLAGS = ["abuse", "urgent_health"] as const;
export type MessageFlag = (typeof MESSAGE_FLAGS)[number];

export interface IChatMessage extends Document {
  chat: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  senderRole: "patient" | "doctor";
  text: string;
  /** Set when the safety filter flagged it (it was still delivered). */
  flags: MessageFlag[];
  createdAt: Date;
  updatedAt: Date;
}

const chatMessageSchema = new Schema<IChatMessage>(
  {
    chat: { type: Schema.Types.ObjectId, ref: "Chat", required: true },
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    senderRole: { type: String, enum: ["patient", "doctor"], required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    flags: { type: [{ type: String, enum: MESSAGE_FLAGS }], default: [] },
  },
  { timestamps: true }
);

chatMessageSchema.index({ chat: 1, createdAt: 1 });

chatMessageSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { __v, ...rest } = ret as typeof ret & { __v?: number };
    return rest;
  },
});

export const ChatMessage = mongoose.model<IChatMessage>("ChatMessage", chatMessageSchema);
