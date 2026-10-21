import { body, type ValidationChain } from "express-validator";
import { EMAIL_REGEX, PHONE_REGEX } from "../models/user.model";
import {
  VENDOR_LEVELS,
  VENDOR_OWNERSHIPS,
  VENDOR_STATUSES,
} from "../models/vendors.model";

const parseJsonArray = (value: string) => {
  if (value === undefined || value === "") return true;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Must be a JSON-encoded array");
  }
  if (!Array.isArray(parsed)) throw new Error("Must be a JSON-encoded array");
  return true;
};

const categoriesRule = body("categories")
  .optional({ checkFalsy: true })
  .custom(parseJsonArray)
  .withMessage("categories must be a JSON-encoded array of strings");

const categoryCommissionsRule = body("categoryCommissions")
  .optional({ checkFalsy: true })
  .custom((value: string) => {
    if (value === undefined || value === "") return true;
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error(
        "categoryCommissions must be a JSON-encoded array of { category, rate }",
      );
    }
    if (!Array.isArray(parsed)) {
      throw new Error(
        "categoryCommissions must be a JSON-encoded array of { category, rate }",
      );
    }
    for (const entry of parsed) {
      const rate = (entry as { rate?: unknown })?.rate;
      const rateIsNumeric =
        typeof rate === "number" ||
        (typeof rate === "string" && rate.trim() !== "" && !isNaN(Number(rate)));

      if (
        typeof entry !== "object" ||
        entry === null ||
        typeof (entry as { category?: unknown }).category !== "string" ||
        !rateIsNumeric
      ) {
        throw new Error(
          "Each categoryCommissions entry needs a string category and numeric rate",
        );
      }
    }
    return true;
  });

const commonRules: ValidationChain[] = [
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
  body("website")
    .optional({ checkFalsy: true })
    .trim()
    .isURL()
    .withMessage("Enter a valid website URL"),
  body("socialLink")
    .optional({ checkFalsy: true })
    .trim()
    .isURL()
    .withMessage("Enter a valid social media URL"),
  body("password")
    .optional({ checkFalsy: true })
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
  body("description").optional({ checkFalsy: true }).trim(),
  body("status")
    .optional()
    .isIn(VENDOR_STATUSES)
    .withMessage(`status must be one of: ${VENDOR_STATUSES.join(", ")}`),
  body("level")
    .optional()
    .isIn(VENDOR_LEVELS)
    .withMessage(`level must be one of: ${VENDOR_LEVELS.join(", ")}`),
  body("ownership")
    .optional()
    .isIn(VENDOR_OWNERSHIPS)
    .withMessage(`ownership must be one of: ${VENDOR_OWNERSHIPS.join(", ")}`),
  categoriesRule,
  body("commissionRate")
    .optional({ checkFalsy: true })
    .isFloat({ min: 0, max: 100 })
    .withMessage("commissionRate must be between 0 and 100")
    .toFloat(),
  categoryCommissionsRule,
  body("commissionNotes").optional({ checkFalsy: true }).trim(),
];

export const createVendorRules: ValidationChain[] = [
  body("name").trim().notEmpty().withMessage("Name is required"),
  ...commonRules,
];

export const updateVendorRules: ValidationChain[] = [
  body("name").optional().trim().notEmpty().withMessage("Name cannot be empty"),
  ...commonRules,
];

export const vendorSigninRules: ValidationChain[] = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .matches(EMAIL_REGEX)
    .withMessage("Enter a valid email address"),
  body("password").notEmpty().withMessage("Password is required"),
];
