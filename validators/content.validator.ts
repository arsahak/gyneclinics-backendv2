import { body, param, query, type ValidationChain } from "express-validator";
import { CONTENT_CATEGORIES, CONTENT_FORMATS, CONTENT_VISIBILITIES } from "../models/content.model";

export const CONTENT_STATUS_FILTERS = ["all", ...CONTENT_VISIBILITIES, "sponsored"] as const;
export const CONTENT_SORTS = ["newest", "oldest", "title_asc", "title_desc"] as const;

const URL_PATTERN = /^https?:\/\/\S+$/i;

export const contentIdRules: ValidationChain[] = [param("id").isMongoId().withMessage("Invalid content id")];

const pageRules = (): ValidationChain[] => [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be 1 or more").toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be 1–100").toInt(),
  query("category").optional().isString().trim().isLength({ max: 50 }),
];

/** GET /content — staff list. */
export const listContentRules: ValidationChain[] = [
  ...pageRules(),
  query("status")
    .optional()
    .isIn(CONTENT_STATUS_FILTERS)
    .withMessage(`Status must be one of: ${CONTENT_STATUS_FILTERS.join(", ")}`),
  query("sort").optional().isIn(CONTENT_SORTS).withMessage(`Sort must be one of: ${CONTENT_SORTS.join(", ")}`),
  query("search").optional().isString().trim().isLength({ max: 100 }).withMessage("Search is too long"),
];

/** GET /content/feed — patients' Learn feed. */
export const feedRules: ValidationChain[] = pageRules();
export const feedItemRules: ValidationChain[] = [
  param("slug").matches(/^[a-z0-9-]{1,100}$/i).withMessage("Invalid article"),
];

/** Fields for create (all required ones) or update (`partial`: only what's sent). */
function contentFields(partial: boolean): ValidationChain[] {
  const required = (chain: ValidationChain) => (partial ? chain.optional() : chain);
  return [
    required(body("title")).isString().trim().isLength({ min: 3, max: 150 }).withMessage("Title must be 3–150 characters"),
    required(body("body")).isString().isLength({ min: 1, max: 200_000 }).withMessage("Write the content"),
    body("format").optional().isIn(CONTENT_FORMATS).withMessage(`Format must be one of: ${CONTENT_FORMATS.join(", ")}`),
    body("imageUrl")
      .optional({ values: "falsy" })
      .isString()
      .trim()
      .matches(URL_PATTERN)
      .withMessage("Image must be a full https:// link"),
    required(body("category"))
      .isIn(CONTENT_CATEGORIES)
      .withMessage(`Category must be one of: ${CONTENT_CATEGORIES.join(", ")}`),
    // Empty = take it from the start of the body.
    body("excerpt").optional({ values: "null" }).isString().trim().isLength({ max: 300 }).withMessage("Summary must be at most 300 characters"),
    body("authorName").optional().isString().trim().isLength({ max: 80 }).withMessage("Author must be at most 80 characters"),
    body("authorRole").optional().isString().trim().isLength({ max: 120 }).withMessage("Author role must be at most 120 characters"),
    // null = estimate it from the body.
    body("readTimeMinutes")
      .optional({ values: "null" })
      .isInt({ min: 1, max: 120 })
      .withMessage("Read time must be 1–120 minutes")
      .toInt(),
    body("visibility")
      .optional()
      .isIn(CONTENT_VISIBILITIES)
      .withMessage(`Visibility must be one of: ${CONTENT_VISIBILITIES.join(", ")}`),
    body("sponsored").optional().isBoolean().withMessage("sponsored must be true or false").toBoolean(),
    body("sponsorName").optional({ values: "falsy" }).isString().trim().isLength({ max: 80 }),
    body("sponsorName")
      .if(body("sponsored").equals("true"))
      .trim()
      .notEmpty()
      .withMessage("Add the sponsor's name"),
  ];
}

export const createContentRules: ValidationChain[] = contentFields(false);
export const updateContentRules: ValidationChain[] = [...contentIdRules, ...contentFields(true)];
