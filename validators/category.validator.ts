import { body, type ValidationChain } from "express-validator";
import mongoose from "mongoose";

const isValidObjectId = (value: string) => mongoose.Types.ObjectId.isValid(value);

export const createCategoryRules: ValidationChain[] = [
  body("name").trim().notEmpty().withMessage("Name is required"),
  body("description").optional({ checkFalsy: true }).trim(),
  body("parent")
    .optional({ checkFalsy: true })
    .custom(isValidObjectId)
    .withMessage("Parent must be a valid category id"),
  body("isActive").optional().isBoolean().withMessage("isActive must be a boolean").toBoolean(),
  body("sortOrder")
    .optional()
    .isInt({ min: 0 })
    .withMessage("sortOrder must be a non-negative integer")
    .toInt(),
];

export const updateCategoryRules: ValidationChain[] = [
  body("name").optional().trim().notEmpty().withMessage("Name cannot be empty"),
  body("description").optional({ checkFalsy: true }).trim(),
  body("parent")
    .optional({ checkFalsy: true })
    .custom(isValidObjectId)
    .withMessage("Parent must be a valid category id"),
  body("isActive").optional().isBoolean().withMessage("isActive must be a boolean").toBoolean(),
  body("sortOrder")
    .optional()
    .isInt({ min: 0 })
    .withMessage("sortOrder must be a non-negative integer")
    .toInt(),
];
