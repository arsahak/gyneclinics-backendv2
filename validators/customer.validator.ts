import { body, type ValidationChain } from "express-validator";
import {
  BD_DIVISIONS,
  DELIVERY_ZONES,
  PHONE_REGEX,
} from "../models/user.model";

const commonRules: ValidationChain[] = [
  body("firstName").optional().trim().notEmpty().withMessage("First name cannot be empty"),
  body("lastName").optional().trim().notEmpty().withMessage("Last name cannot be empty"),
  body("companyName").optional({ checkFalsy: true }).trim(),
  body("email")
    .optional({ checkFalsy: true })
    .trim()
    .isEmail()
    .withMessage("Please enter a valid email address")
    .customSanitizer((value: string) => value.toLowerCase()),
  body("phone")
    .optional({ checkFalsy: true })
    .trim()
    .matches(PHONE_REGEX)
    .withMessage("Please enter a valid phone number"),
  body("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be a boolean")
    .toBoolean(),
  body("address").optional().isObject().withMessage("Address must be an object"),
  body("address.division").optional({ checkFalsy: true }).isIn(BD_DIVISIONS),
  body("address.district").optional({ checkFalsy: true }).trim(),
  body("address.upazila").optional({ checkFalsy: true }).trim(),
  body("address.postOffice").optional({ checkFalsy: true }).trim(),
  body("address.postCode")
    .optional({ checkFalsy: true })
    .matches(/^[0-9]{4}$/)
    .withMessage("Please enter a valid 4-digit post code"),
  body("address.area").optional({ checkFalsy: true }).trim(),
  body("address.zone").optional({ checkFalsy: true }).isIn(DELIVERY_ZONES),
];

export const createCustomerRules: ValidationChain[] = [
  body("firstName").trim().notEmpty().withMessage("First name is required"),
  body("lastName").trim().notEmpty().withMessage("Last name is required"),
  ...commonRules.slice(2),
  body("password")
    .isString()
    .isLength({ min: 8, max: 72 })
    .withMessage("Password must be between 8 and 72 characters"),
  body().custom((_value, { req }) => {
    if (!req.body.email && !req.body.phone) {
      throw new Error("Either email or phone is required");
    }
    return true;
  }),
];

export const updateCustomerRules: ValidationChain[] = [
  ...commonRules,
  body("password")
    .optional({ checkFalsy: true })
    .isString()
    .isLength({ min: 8, max: 72 })
    .withMessage("Password must be between 8 and 72 characters"),
];
