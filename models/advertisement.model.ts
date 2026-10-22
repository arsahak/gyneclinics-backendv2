import mongoose, { Schema, Document } from "mongoose";

// Banner ads shown in the webapp. Fields match its AdBanner: advertiser,
// headline, one line, a button and an optional price. Always labelled "Ad".

/** Where an ad can show (the webapp's AdBanner slots). */
export const AD_SLOTS = ["home", "learn-feed", "article-end", "doctors-feed", "doctor-dashboard"] as const;
export const AD_TONES = ["primary", "secondary", "accent", "gold"] as const;
export type AdSlot = (typeof AD_SLOTS)[number];
export type AdTone = (typeof AD_TONES)[number];

export interface IAdvertisement extends Document {
  advertiser: string;
  headline: string;
  body: string;
  cta: string;
  linkUrl: string;
  /** Base price in GBP; the app converts it per region. */
  priceGBP?: number;
  tone: AdTone;
  imageUrl?: string;
  placements: AdSlot[];
  /** Higher shows first when several live ads share a placement. */
  priority: number;
  active: boolean;
  /** Start of the first day it shows (UTC). */
  startDate?: Date;
  /** Start of the last day it shows (UTC); shows until that day ends. */
  endDate?: Date;
  impressions: number;
  clicks: number;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Advertisement:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         advertiser: { type: string, example: WHP Store }
 *         headline: { type: string, example: Women's Multivitamin Formula }
 *         body: { type: string, example: Iron, folate and B vitamins in one daily tablet. }
 *         cta: { type: string, example: Shop now }
 *         linkUrl: { type: string, example: "https://example.com" }
 *         priceGBP: { type: number, example: 29.99 }
 *         tone: { type: string, enum: [primary, secondary, accent, gold] }
 *         imageUrl: { type: string }
 *         placements: { type: array, items: { type: string, enum: [home, learn-feed, article-end, doctors-feed, doctor-dashboard] } }
 *         priority: { type: number, example: 10 }
 *         active: { type: boolean }
 *         startDate: { type: string, format: date-time }
 *         endDate: { type: string, format: date-time }
 *         impressions: { type: number }
 *         clicks: { type: number }
 */
const advertisementSchema = new Schema<IAdvertisement>(
  {
    advertiser: { type: String, required: true, trim: true, maxlength: 60 },
    headline: { type: String, required: true, trim: true, maxlength: 60 },
    body: { type: String, required: true, trim: true, maxlength: 120 },
    cta: { type: String, required: true, trim: true, maxlength: 24 },
    linkUrl: { type: String, required: true, trim: true },
    priceGBP: { type: Number, min: 0 },
    tone: { type: String, enum: AD_TONES, default: "primary" },
    imageUrl: { type: String, trim: true },
    placements: {
      type: [{ type: String, enum: AD_SLOTS }],
      validate: { validator: (v: string[]) => v.length > 0, message: "Choose at least one placement" },
    },
    priority: { type: Number, min: 0, max: 100, default: 0 },
    active: { type: Boolean, default: true },
    startDate: { type: Date },
    endDate: { type: Date },
    impressions: { type: Number, min: 0, default: 0 },
    clicks: { type: Number, min: 0, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// Serving: live ads for a placement, best first.
advertisementSchema.index({ active: 1, placements: 1, priority: -1 });

advertisementSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { __v, ...rest } = ret as typeof ret & { __v?: number };
    return rest;
  },
});

export const Advertisement = mongoose.model<IAdvertisement>("Advertisement", advertisementSchema);
