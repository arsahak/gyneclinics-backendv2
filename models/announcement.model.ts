import mongoose, { Schema, Document } from "mongoose";
import { REGION_IDS, type RegionId } from "../utils/regions";

// News, tips or service updates the team sends to patients and/or doctors.
// draft → scheduled → sent, or sent straight away; scheduled ones can be cancelled.

export const ANNOUNCEMENT_AUDIENCES = ["all", "patients", "doctors"] as const;
export const ANNOUNCEMENT_CHANNELS = ["in_app", "push", "sms"] as const;
export const ANNOUNCEMENT_STATUSES = ["draft", "scheduled", "sent", "cancelled"] as const;
/** Places in the app a notification can open. Each role has its own page for it. */
export const LINK_TARGETS = ["home", "doctors", "learn", "share_story", "cycle", "consultations", "messages", "earnings"] as const;

export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];
export type AnnouncementChannel = (typeof ANNOUNCEMENT_CHANNELS)[number];
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];
export type LinkTarget = (typeof LINK_TARGETS)[number];

export interface IAnnouncement extends Document {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  region?: RegionId;
  channels: AnnouncementChannel[];
  link?: LinkTarget;
  status: AnnouncementStatus;
  scheduledAt?: Date;
  sentAt?: Date;
  /** People it went to. */
  reach: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Announcement:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         title: { type: string }
 *         body: { type: string }
 *         audience: { type: string, enum: [all, patients, doctors] }
 *         region: { type: string }
 *         channels: { type: array, items: { type: string, enum: [in_app, push, sms] } }
 *         link: { type: string }
 *         status: { type: string, enum: [draft, scheduled, sent, cancelled] }
 *         scheduledAt: { type: string, format: date-time }
 *         sentAt: { type: string, format: date-time }
 *         reach: { type: integer }
 */
const announcementSchema = new Schema<IAnnouncement>(
  {
    title: { type: String, required: true, trim: true, maxlength: 60 },
    /** Can be empty only in a draft. */
    body: { type: String, trim: true, maxlength: 240, default: "" },
    audience: { type: String, enum: ANNOUNCEMENT_AUDIENCES, required: true },
    region: { type: String, enum: REGION_IDS },
    channels: { type: [{ type: String, enum: ANNOUNCEMENT_CHANNELS }], required: true },
    link: { type: String, enum: LINK_TARGETS },
    status: { type: String, enum: ANNOUNCEMENT_STATUSES, required: true, index: true },
    scheduledAt: Date,
    sentAt: Date,
    reach: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

announcementSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { __v, ...rest } = ret as typeof ret & { __v?: number };
    return rest;
  },
});

export const Announcement = mongoose.model<IAnnouncement>("Announcement", announcementSchema);
