import mongoose, { Schema, Document } from "mongoose";

// Learn-feed content written by staff, shown in the webapp's Learn page.
// Patients only see "published" items. Formats and categories match the webapp.

/** guide = article. */
export const CONTENT_FORMATS = ["guide", "blog", "story", "image"] as const;
export const CONTENT_CATEGORIES = [
  "Periods",
  "Fertility",
  "Pregnancy",
  "Menopause",
  "Pelvic Health",
  "Wellness",
  "Stories",
] as const;
export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];
export const CONTENT_VISIBILITIES = ["published", "draft", "hidden"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];
export type ContentVisibility = (typeof CONTENT_VISIBILITIES)[number];

export interface IContent extends Document {
  /** URL name, e.g. "what-is-a-normal-cycle". Set once from the title. */
  slug: string;
  title: string;
  /** Cleaned HTML (see utils/contentHtml.ts). */
  body: string;
  /** Short summary for feed cards and the article intro. */
  excerpt: string;
  /** excerpt is taken from the body (updated when the body changes). */
  excerptEstimated: boolean;
  format: ContentFormat;
  imageUrl?: string;
  category: ContentCategory;
  /** Set by staff, or estimated from the body. */
  readTimeMinutes: number;
  /** readTimeMinutes is estimated (updated when the body changes). */
  readTimeEstimated: boolean;
  visibility: ContentVisibility;
  sponsored: boolean;
  sponsorName?: string;
  /** First time it was published. */
  publishedAt?: Date;
  /** Byline shown to patients, e.g. "GyneClinics Editorial Team". */
  authorName: string;
  /** e.g. "Reviewed by a consultant gynaecologist". */
  authorRole: string;
  author: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Content:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         slug: { type: string, example: what-is-a-normal-cycle }
 *         title: { type: string, example: Understanding your cycle }
 *         body: { type: string, description: Cleaned HTML }
 *         excerpt: { type: string }
 *         format: { type: string, enum: [guide, blog, story, image], description: "guide = article" }
 *         imageUrl: { type: string }
 *         category: { type: string, enum: [Periods, Fertility, Pregnancy, Menopause, Pelvic Health, Wellness, Stories] }
 *         authorName: { type: string, example: GyneClinics Editorial Team }
 *         authorRole: { type: string, example: Reviewed by a consultant gynaecologist }
 *         readTimeMinutes: { type: number, example: 4 }
 *         visibility: { type: string, enum: [published, draft, hidden] }
 *         sponsored: { type: boolean }
 *         sponsorName: { type: string }
 *         publishedAt: { type: string, format: date-time }
 *         author: { type: object, properties: { _id: { type: string }, fullName: { type: string } } }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 */
const contentSchema = new Schema<IContent>(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    body: { type: String, required: true },
    excerpt: { type: String, default: "", maxlength: 300 },
    excerptEstimated: { type: Boolean, default: true },
    format: { type: String, enum: CONTENT_FORMATS, default: "guide" },
    imageUrl: { type: String, trim: true },
    category: { type: String, required: true, enum: CONTENT_CATEGORIES },
    readTimeMinutes: { type: Number, min: 1, max: 120, default: 1 },
    readTimeEstimated: { type: Boolean, default: true },
    visibility: { type: String, enum: CONTENT_VISIBILITIES, default: "draft" },
    sponsored: { type: Boolean, default: false },
    sponsorName: { type: String, trim: true, maxlength: 80 },
    publishedAt: { type: Date },
    authorName: { type: String, trim: true, maxlength: 80, default: "GyneClinics Editorial Team" },
    authorRole: { type: String, trim: true, maxlength: 120, default: "Reviewed by a consultant gynaecologist" },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// Feed: published items by category, newest first.
contentSchema.index({ visibility: 1, category: 1, publishedAt: -1 });
contentSchema.index({ createdAt: -1 });

contentSchema.pre("save", function (next) {
  if (this.visibility === "published" && !this.publishedAt) this.publishedAt = new Date();
  if (!this.sponsored) this.sponsorName = undefined;
  next();
});

contentSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { __v, ...rest } = ret as typeof ret & { __v?: number };
    return rest;
  },
});

export const Content = mongoose.model<IContent>("Content", contentSchema);
