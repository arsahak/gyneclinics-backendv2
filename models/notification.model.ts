import mongoose, { Schema, Document } from "mongoose";

// One item in a patient's or doctor's notification inbox (the bell in the app).
// Made by an announcement or by an automatic message (e.g. "Booking confirmed").

export interface INotification extends Document {
  user: mongoose.Types.ObjectId;
  title: string;
  body: string;
  /** Where tapping it goes in the app, e.g. /patient/learn. */
  link?: string;
  /** The announcement it came from, or the automatic message key. */
  announcement?: mongoose.Types.ObjectId;
  autoKey?: string;
  readAt?: Date;
  createdAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Notification:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         title: { type: string }
 *         body: { type: string }
 *         link: { type: string }
 *         readAt: { type: string, format: date-time }
 *         createdAt: { type: string, format: date-time }
 */
const notificationSchema = new Schema<INotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, trim: true, maxlength: 600 },
    link: { type: String, trim: true, maxlength: 200 },
    announcement: { type: Schema.Types.ObjectId, ref: "Announcement", index: true },
    autoKey: { type: String, trim: true, index: true },
    readAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ user: 1, createdAt: -1 });

notificationSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { __v, ...rest } = ret as typeof ret & { __v?: number };
    return rest;
  },
});

export const Notification = mongoose.model<INotification>("Notification", notificationSchema);
