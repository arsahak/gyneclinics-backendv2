import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../middleware/asyncHandler";
import { AD_SLOTS, Advertisement, type AdSlot, type IAdvertisement } from "../models/advertisement.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";

const SORTS: Record<string, Record<string, 1 | -1>> = {
  priority: { priority: -1, createdAt: -1 },
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  impressions: { impressions: -1 },
  clicks: { clicks: -1 },
};

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Midnight UTC today: an ad with endDate = today still shows today. */
const startOfToday = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

/** Mongo filter for each status, as the dashboard shows it. */
function statusFilter(status: string): Record<string, unknown> {
  const today = startOfToday();
  const started = { $or: [{ startDate: null }, { startDate: { $lte: today } }] };
  const notEnded = { $or: [{ endDate: null }, { endDate: { $gte: today } }] };
  switch (status) {
    case "live":
      return { active: true, $and: [started, notEnded] };
    case "scheduled":
      return { active: true, startDate: { $gt: today }, ...notEnded };
    case "ended":
      return { active: true, endDate: { $lt: today } };
    case "paused":
      return { active: false };
    default:
      return {};
  }
}

const toDay = (value: unknown) => (value ? new Date(`${String(value)}T00:00:00.000Z`) : undefined);

async function adOr404(id: string) {
  const ad = await Advertisement.findById(id);
  if (!ad) throw new ApiError(404, "Ad not found");
  return ad;
}

/** Applies body fields (not saved). */
function applyFields(ad: IAdvertisement, b: Record<string, unknown>) {
  for (const key of ["advertiser", "headline", "body", "cta", "linkUrl", "tone", "placements", "priority", "active"] as const) {
    if (b[key] !== undefined) ad.set(key, typeof b[key] === "string" ? String(b[key]).trim() : b[key]);
  }
  if (b.priceGBP !== undefined) ad.priceGBP = b.priceGBP === null ? undefined : Number(b.priceGBP) || undefined;
  if (b.imageUrl !== undefined) ad.imageUrl = b.imageUrl ? String(b.imageUrl).trim() : undefined;
  if (b.startDate !== undefined) ad.startDate = toDay(b.startDate);
  if (b.endDate !== undefined) ad.endDate = toDay(b.endDate);
  if (ad.startDate && ad.endDate && ad.endDate < ad.startDate) throw new ApiError(422, "The end date is before the start date");
}

// ── Staff ───────────────────────────────────────────────────────────────────

export const listAds = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const sort = SORTS[String(req.query.sort ?? "priority")] ?? SORTS.priority;
  const search = String(req.query.search ?? "").trim();

  const filter: Record<string, unknown> = { ...statusFilter(String(req.query.status ?? "all")) };
  if (req.query.placement) filter.placements = String(req.query.placement);
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    filter.$and = [...((filter.$and as unknown[]) ?? []), { $or: [{ headline: pattern }, { advertiser: pattern }] }];
  }

  const [ads, total, all, live, totals] = await Promise.all([
    Advertisement.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
    Advertisement.countDocuments(filter),
    Advertisement.countDocuments(),
    Advertisement.countDocuments(statusFilter("live")),
    Advertisement.aggregate<{ impressions: number; clicks: number }>([
      { $group: { _id: null, impressions: { $sum: "$impressions" }, clicks: { $sum: "$clicks" } } },
    ]),
  ]);

  return ApiResponse(res, 200, "Ads fetched successfully", {
    ads,
    pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
    stats: { total: all, live, impressions: totals[0]?.impressions ?? 0, clicks: totals[0]?.clicks ?? 0 },
  });
});

export const getAd = asyncHandler(async (req: Request, res: Response) => {
  return ApiResponse(res, 200, "Ad fetched successfully", await adOr404(req.params.id));
});

export const createAd = asyncHandler(async (req: Request, res: Response) => {
  const ad = new Advertisement({ createdBy: req.user!._id });
  applyFields(ad, req.body);
  await ad.save();
  return ApiResponse(res, 201, "Ad created", ad);
});

/** Send only what changes. `priceGBP`, `startDate`, `endDate`: null clears them. */
export const updateAd = asyncHandler(async (req: Request, res: Response) => {
  const ad = await adOr404(req.params.id);
  applyFields(ad, req.body);
  ad.updatedBy = req.user!._id as mongoose.Types.ObjectId;
  await ad.save();
  return ApiResponse(res, 200, "Ad updated", ad);
});

export const deleteAd = asyncHandler(async (req: Request, res: Response) => {
  const ad = await adOr404(req.params.id);
  await ad.deleteOne();
  return ApiResponse(res, 200, "Ad deleted");
});

// ── The app ─────────────────────────────────────────────────────────────────

const SERVE_FIELDS = "advertiser headline body cta linkUrl priceGBP tone imageUrl";

/**
 * The ad to show in each requested slot: the live one with the highest
 * priority (newest first on a tie). Slots with no live ad are null.
 */
export const serveAds = asyncHandler(async (req: Request, res: Response) => {
  const slots = ((req.query.slots as unknown as string[] | undefined)?.length ? req.query.slots : AD_SLOTS) as AdSlot[];
  const live = statusFilter("live");
  const entries = await Promise.all(
    slots.map(async (slot) => {
      const ad = await Advertisement.findOne({ ...live, placements: slot }).sort({ priority: -1, createdAt: -1 }).select(SERVE_FIELDS);
      return [slot, ad] as const;
    })
  );
  return ApiResponse(res, 200, "Ads fetched successfully", Object.fromEntries(entries));
});

/** Counts a view or a click from the app. */
export const trackAd = asyncHandler(async (req: Request, res: Response) => {
  const field = req.body.event === "click" ? "clicks" : "impressions";
  const result = await Advertisement.updateOne({ _id: req.params.id }, { $inc: { [field]: 1 } });
  if (result.matchedCount === 0) throw new ApiError(404, "Ad not found");
  return ApiResponse(res, 200, "Counted");
});
