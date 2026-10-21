import { body } from "express-validator";

export const submitReviewRules = [
  body("rating")
    .isInt({ min: 1, max: 5 })
    .withMessage("Rating must be between 1 and 5"),
  body("comment")
    .trim()
    .isLength({ min: 3, max: 1000 })
    .withMessage("Review must be between 3 and 1000 characters"),
];

export const moderateReviewRules = [
  body("status")
    .isIn(["approved", "rejected"])
    .withMessage("Status must be approved or rejected"),
  body("moderationNote")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Moderation note cannot exceed 500 characters"),
];
