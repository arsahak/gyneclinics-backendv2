import mongoose, { Schema, Document } from "mongoose";

// A dashboard notification for one staff member (the bell in the dashboard
// topbar): something happened that the team may need to act on. Each staff
// member has their own copy, so read / unread is per person. Kept 90 days.

export const STAFF_EVENTS = [
  "patient_signup",
  "doctor_signup",
  "doctor_update",
  "consultation_booked",
  "payment_refunded",
  "withdrawal_requested",
  "report_created",
  "chat_flagged",
  "story_submitted",
  "review_held",
] as const;
export type StaffEvent = (typeof STAFF_EVENTS)[number];

export interface IStaffNotification extends Document {
  user: mongoose.Types.ObjectId;
  type: StaffEvent;
  title: string;
  body: string;
  /** Dashboard page it opens, e.g. /doctors/123. */
  link?: string;
  priority: "normal" | "urgent";
  readAt?: Date;
  createdAt: Date;
}

const staffNotificationSchema = new Schema<IStaffNotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: STAFF_EVENTS, required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, trim: true, maxlength: 400 },
    link: { type: String, trim: true, maxlength: 200 },
    priority: { type: String, enum: ["normal", "urgent"], default: "normal" },
    readAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

staffNotificationSchema.index({ user: 1, createdAt: -1 });
staffNotificationSchema.index({ user: 1, readAt: 1 });
staffNotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

staffNotificationSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { __v, user: _user, ...rest } = ret as typeof ret & { __v?: number; user?: unknown };
    return rest;
  },
});

export const StaffNotification = mongoose.model<IStaffNotification>("StaffNotification", staffNotificationSchema);
