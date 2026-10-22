import mongoose, { Schema, Document } from "mongoose";
import { CONTENT_CATEGORIES, type ContentCategory } from "./content.model";

// Community stories patients send from the webapp's "Share story" page.
// Staff review them; approved ones show in Learn under Stories.

/** pending = waiting for review; hidden = was approved, taken down. */
export const STORY_STATUSES = ["pending", "approved", "rejected", "hidden"] as const;
export type StoryStatus = (typeof STORY_STATUSES)[number];

export interface IStory extends Document {
  title: string;
  /** Plain text, paragraphs split by blank lines. */
  body: string;
  topic: ContentCategory;
  anonymous: boolean;
  /** Name shown when not anonymous. */
  authorName?: string;
  imageUrl?: string;
  /** Storage key of an uploaded photo (internal). */
  imageKey?: string;
  status: StoryStatus;
  /** Shown to the patient when rejected. */
  rejectionReason?: string;
  patient: mongoose.Types.ObjectId;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  /** First time it was approved. */
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Story:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         title: { type: string }
 *         body: { type: string, description: Plain text }
 *         topic: { type: string, enum: [Periods, Fertility, Pregnancy, Menopause, Pelvic Health, Wellness, Stories] }
 *         anonymous: { type: boolean }
 *         authorName: { type: string }
 *         imageUrl: { type: string }
 *         status: { type: string, enum: [pending, approved, rejected, hidden] }
 *         rejectionReason: { type: string }
 *         patient: { type: object, properties: { _id: { type: string }, fullName: { type: string }, phone: { type: string } } }
 *         reviewedAt: { type: string, format: date-time }
 *         publishedAt: { type: string, format: date-time }
 *         createdAt: { type: string, format: date-time }
 */
const storySchema = new Schema<IStory>(
  {
    title: { type: String, required: true, trim: true, minlength: 5, maxlength: 120 },
    // No minimum: a story can be as short as the patient likes. The cap only stops abuse.
    body: { type: String, required: true, trim: true, maxlength: 50000 },
    topic: { type: String, enum: CONTENT_CATEGORIES, default: "Wellness" },
    anonymous: { type: Boolean, default: true },
    authorName: { type: String, trim: true, maxlength: 60 },
    imageUrl: { type: String, trim: true },
    imageKey: { type: String },
    status: { type: String, enum: STORY_STATUSES, default: "pending" },
    rejectionReason: { type: String, trim: true, maxlength: 300 },
    patient: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    publishedAt: { type: Date },
  },
  { timestamps: true }
);

storySchema.index({ status: 1, createdAt: -1 });

storySchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { __v, imageKey: _key, ...rest } = ret as typeof ret & { __v?: number; imageKey?: string };
    return rest;
  },
});

export const Story = mongoose.model<IStory>("Story", storySchema);
