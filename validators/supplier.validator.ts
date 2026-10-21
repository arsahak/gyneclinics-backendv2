import { body, type ValidationChain } from "express-validator";
import { EMAIL_REGEX, PHONE_REGEX } from "../models/user.model";

export const createSupplierRules: ValidationChain[] = [
  body("name").trim().notEmpty().withMessage("Name is required"),
  body("contactPerson").optional({ checkFalsy: true }).trim(),
  body("email")
    .optional({ checkFalsy: true })
    .trim()
    .matches(EMAIL_REGEX)
    .withMessage("Enter a valid email address"),
  body("phone")
    .optional({ checkFalsy: true })
    .trim()
    .matches(PHONE_REGEX)
    .withMessage("Enter a valid phone number"),
  body("address").optional({ checkFalsy: true }).trim(),
  body("website").optional({ checkFalsy: true }).trim().isURL().withMessage("Enter a valid website URL"),
  body("description").optional({ checkFalsy: true }).trim(),
  body("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be a boolean")
    .toBoolean(),
  body("sortOrder")
    .optional()
    .isInt({ min: 0 })
    .withMessage("sortOrder must be a non-negative integer")
    .toInt(),
];

export const updateSupplierRules: ValidationChain[] = [
  body("name")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Name cannot be empty"),
  body("contactPerson").optional({ checkFalsy: true }).trim(),
  body("email")
    .optional({ checkFalsy: true })
    .trim()
    .matches(EMAIL_REGEX)
    .withMessage("Enter a valid email address"),
  body("phone")
    .optional({ checkFalsy: true })
    .trim()
    .matches(PHONE_REGEX)
    .withMessage("Enter a valid phone number"),
  body("address").optional({ checkFalsy: true }).trim(),
  body("website").optional({ checkFalsy: true }).trim().isURL().withMessage("Enter a valid website URL"),
  body("description").optional({ checkFalsy: true }).trim(),
  body("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be a boolean")
    .toBoolean(),
  body("sortOrder")
    .optional()
    .isInt({ min: 0 })
    .withMessage("sortOrder must be a non-negative integer")
    .toInt(),
];
