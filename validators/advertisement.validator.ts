import { body, param, query, type ValidationChain } from "express-validator";
import { AD_SLOTS, AD_TONES } from "../models/advertisement.model";

export const AD_STATUS_FILTERS = ["all", "live", "scheduled", "paused", "ended"] as const;
export const AD_SORTS = ["priority", "newest", "oldest", "impressions", "clicks"] as const;

const URL_PATTERN = /^https?:\/\/\S+$/i;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const adIdRules: ValidationChain[] = [param("id").isMongoId().withMessage("Invalid ad id")];

/** GET /advertisements — staff list. */
export const listAdsRules: ValidationChain[] = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be 1 or more").toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be 1–100").toInt(),
  query("status").optional().isIn(AD_STATUS_FILTERS).withMessage(`Status must be one of: ${AD_STATUS_FILTERS.join(", ")}`),
  query("placement").optional().isIn(AD_SLOTS).withMessage(`Placement must be one of: ${AD_SLOTS.join(", ")}`),
  query("sort").optional().isIn(AD_SORTS).withMessage(`Sort must be one of: ${AD_SORTS.join(", ")}`),
  query("search").optional().isString().trim().isLength({ max: 100 }).withMessage("Search is too long"),
];

/** GET /advertisements/serve?slots=home,learn-feed — the app. */
export const serveAdsRules: ValidationChain[] = [
  query("slots")
    .optional()
    .customSanitizer((value) => String(value).split(",").map((s) => s.trim()).filter(Boolean))
    .custom((slots: string[]) => slots.every((s) => (AD_SLOTS as readonly string[]).includes(s)))
    .withMessage(`Slots must be from: ${AD_SLOTS.join(", ")}`),
];

/** POST /advertisements/:id/track — the app counts a view or a click. */
export const trackAdRules: ValidationChain[] = [
  ...adIdRules,
  body("event").isIn(["impression", "click"]).withMessage("event must be impression or click"),
];

function adFields(partial: boolean): ValidationChain[] {
  const required = (chain: ValidationChain) => (partial ? chain.optional() : chain);
  return [
    required(body("advertiser")).isString().trim().isLength({ min: 2, max: 60 }).withMessage("Advertiser must be 2–60 characters"),
    required(body("headline")).isString().trim().isLength({ min: 3, max: 60 }).withMessage("Headline must be 3–60 characters"),
    required(body("body")).isString().trim().isLength({ min: 1, max: 120 }).withMessage("The line about it must be 1–120 characters"),
    required(body("cta")).isString().trim().isLength({ min: 1, max: 24 }).withMessage("Button text must be 1–24 characters"),
    required(body("linkUrl")).isString().trim().matches(URL_PATTERN).withMessage("Button link must start with https://"),
    // null = no price.
    body("priceGBP").optional({ values: "null" }).isFloat({ min: 0, max: 100000 }).withMessage("Price must be a positive number").toFloat(),
    body("tone").optional().isIn(AD_TONES).withMessage(`Colour must be one of: ${AD_TONES.join(", ")}`),
    body("imageUrl").optional({ values: "falsy" }).isString().trim().matches(URL_PATTERN).withMessage("Image must be a full https:// link"),
    required(body("placements")).isArray({ min: 1 }).withMessage("Choose at least one placement"),
    body("placements.*").isIn(AD_SLOTS).withMessage(`Placements must be from: ${AD_SLOTS.join(", ")}`),
    body("priority").optional().isInt({ min: 0, max: 100 }).withMessage("Priority must be 0–100").toInt(),
    body("active").optional().isBoolean().withMessage("active must be true or false").toBoolean(),
    // yyyy-MM-dd, or null to clear.
    body("startDate").optional({ values: "null" }).matches(DAY_PATTERN).withMessage("Start date must be yyyy-MM-dd"),
    body("endDate").optional({ values: "null" }).matches(DAY_PATTERN).withMessage("End date must be yyyy-MM-dd"),
  ];
}

export const createAdRules: ValidationChain[] = adFields(false);
export const updateAdRules: ValidationChain[] = [...adIdRules, ...adFields(true)];
