import { body, type ValidationChain } from "express-validator";

export const createBrandRules: ValidationChain[] = [
  body("name").trim().notEmpty().withMessage("Name is required"),
  body("description").optional({ checkFalsy: true }).trim(),
  body("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be a boolean")
    .toBoolean(),
  body("isTopBrand")
    .optional()
    .isBoolean()
    .withMessage("isTopBrand must be a boolean")
    .toBoolean(),
  body("sortOrder")
    .optional()
    .isInt({ min: 0 })
    .withMessage("sortOrder must be a non-negative integer")
    .toInt(),
];

export const updateBrandRules: ValidationChain[] = [
  body("name")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Name cannot be empty"),
  body("description").optional({ checkFalsy: true }).trim(),
  body("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be a boolean")
    .toBoolean(),
  body("isTopBrand")
    .optional()
    .isBoolean()
    .withMessage("isTopBrand must be a boolean")
    .toBoolean(),
  body("sortOrder")
    .optional()
    .isInt({ min: 0 })
    .withMessage("sortOrder must be a non-negative integer")
    .toInt(),
];
