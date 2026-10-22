import { body, param, query, type ValidationChain } from "express-validator";
import { CONTENT_CATEGORIES } from "../models/content.model";
import { STORY_STATUSES } from "../models/story.model";

export const STORY_STATUS_FILTERS = ["all", ...STORY_STATUSES] as const;
export const STORY_SORTS = ["newest", "oldest", "title_asc", "title_desc"] as const;
const URL_PATTERN = /^https?:\/\/\S+$/i;

export const storyIdRules: ValidationChain[] = [param("id").isMongoId().withMessage("Invalid story id")];

const pageRules = (): ValidationChain[] => [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be 1 or more").toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be 1–100").toInt(),
];

/** GET /stories — staff list. */
export const listStoriesRules: ValidationChain[] = [
  ...pageRules(),
  query("status").optional().isIn(STORY_STATUS_FILTERS).withMessage(`Status must be one of: ${STORY_STATUS_FILTERS.join(", ")}`),
  query("topic").optional().isIn(CONTENT_CATEGORIES).withMessage("Unknown topic"),
  query("sort").optional().isIn(STORY_SORTS).withMessage(`Sort must be one of: ${STORY_SORTS.join(", ")}`),
  query("search").optional().isString().trim().isLength({ max: 100 }).withMessage("Search is too long"),
];

export const feedStoriesRules: ValidationChain[] = pageRules();

/** Fields a patient sends, or staff edit (`partial`). Multipart forms send booleans as text. */
function storyFields(partial: boolean): ValidationChain[] {
  const required = (chain: ValidationChain) => (partial ? chain.optional() : chain);
  return [
    required(body("title")).isString().trim().isLength({ min: 5, max: 120 }).withMessage("Title must be 5–120 characters"),
    required(body("body")).isString().trim().notEmpty().withMessage("Write your story").isLength({ max: 50000 }).withMessage("Your story is too long"),
    required(body("topic")).isIn(CONTENT_CATEGORIES).withMessage(`Topic must be one of: ${CONTENT_CATEGORIES.join(", ")}`),
    body("anonymous").optional().isBoolean().withMessage("anonymous must be true or false").toBoolean(),
    body("authorName").optional({ values: "falsy" }).isString().trim().isLength({ max: 60 }).withMessage("Name must be at most 60 characters"),
  ];
}

/** POST /stories — a patient shares a story (multipart, optional "image"). */
export const createStoryRules: ValidationChain[] = storyFields(false);

/** PATCH /stories/:id — staff corrections. */
export const updateStoryRules: ValidationChain[] = [
  ...storyIdRules,
  ...storyFields(true),
  body("imageUrl").optional({ values: "falsy" }).isString().trim().matches(URL_PATTERN).withMessage("Image must be a full https:// link"),
];

/** PATCH /stories/:id/status — approve, reject (optional reason), hide, back to pending. */
export const storyStatusRules: ValidationChain[] = [
  ...storyIdRules,
  body("status").isIn(STORY_STATUSES).withMessage(`Status must be one of: ${STORY_STATUSES.join(", ")}`),
  body("reason").optional({ values: "falsy" }).isString().trim().isLength({ max: 300 }).withMessage("Reason must be at most 300 characters"),
];
