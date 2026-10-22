import { body, param, query, type ValidationChain } from "express-validator";
import { REVIEW_STATUSES } from "../models/review.model";

const pageRules = (maxLimit = 100): ValidationChain[] => [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be 1 or more").toInt(),
  query("limit").optional().isInt({ min: 1, max: maxLimit }).withMessage(`Limit must be 1–${maxLimit}`).toInt(),
];

/** POST /reviews — patient. */
export const createReviewRules: ValidationChain[] = [
  body("doctorId").isMongoId().withMessage("Invalid doctor id"),
  body("rating").isInt({ min: 1, max: 5 }).withMessage("Choose 1 to 5 stars").toInt(),
  body("text").isString().trim().isLength({ min: 10, max: 1000 }).withMessage("Write at least 10 characters (up to 1000)"),
];

/** GET /reviews/doctor/:doctorId — signed-in users. */
export const doctorReviewsRules: ValidationChain[] = [param("doctorId").isMongoId().withMessage("Invalid doctor id"), ...pageRules(50)];

/** GET /reviews — staff. */
export const listReviewsRules: ValidationChain[] = [
  ...pageRules(),
  query("status").optional().isIn(["all", ...REVIEW_STATUSES]).withMessage(`Status must be one of: all, ${REVIEW_STATUSES.join(", ")}`),
  query("doctorId").optional().isMongoId().withMessage("Invalid doctor id"),
  query("rating").optional().isInt({ min: 1, max: 5 }).withMessage("Rating must be 1–5").toInt(),
  query("search").optional().isString().trim().isLength({ max: 100 }).withMessage("Search is too long"),
];

export const reviewIdRules: ValidationChain[] = [param("id").isMongoId().withMessage("Invalid review id")];

/** PATCH /reviews/:id/status — staff. */
export const reviewStatusRules: ValidationChain[] = [
  ...reviewIdRules,
  body("status").isIn(REVIEW_STATUSES).withMessage(`Status must be one of: ${REVIEW_STATUSES.join(", ")}`),
  body("reason").optional().isString().trim().isLength({ max: 300 }).withMessage("Reason is too long (300 characters)"),
];
