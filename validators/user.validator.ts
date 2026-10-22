import { body, type ValidationChain } from "express-validator";
import { PHONE_REGEX, STAFF_ROLES } from "../models/user.model";

const COUNTRY_CODE_REGEX = /^[A-Za-z]{2}$/;

export const createStaffRules: ValidationChain[] = [
  body("fullName").trim().notEmpty().withMessage("Full name is required"),
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required for staff accounts")
    .bail()
    .isEmail()
    .withMessage("Please enter a valid email address"),
  body("phone")
    .optional({ checkFalsy: true })
    .matches(PHONE_REGEX)
    .withMessage("Please enter a valid phone number"),
  body("avatar")
    .optional({ checkFalsy: true })
    .isURL()
    .withMessage("Avatar must be a valid URL"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
  body("role")
    .isIn(STAFF_ROLES)
    .withMessage(`Role must be one of: ${STAFF_ROLES.join(", ")}`),
];

export const updateStaffRules: ValidationChain[] = [
  body("fullName").optional().trim().notEmpty().withMessage("Full name cannot be empty"),
  body("email")
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage("Please enter a valid email address"),
  body("phone")
    .optional({ checkFalsy: true })
    .matches(PHONE_REGEX)
    .withMessage("Please enter a valid phone number"),
  body("role")
    .optional()
    .isIn(STAFF_ROLES)
    .withMessage(`Role must be one of: ${STAFF_ROLES.join(", ")}`),
  body("isActive").optional().isBoolean().withMessage("isActive must be true or false").toBoolean(),
  body("suspensionReason").optional().isString().isLength({ max: 300 }).withMessage("Reason is too long (300 characters)"),
];

export const staffPasswordRules: ValidationChain[] = [
  body("password").isString().isLength({ min: 6, max: 128 }).withMessage("Password must be at least 6 characters"),
];

export const savePermissionsRules: ValidationChain[] = [
  body("roles").isObject().withMessage("roles must be an object, e.g. { admin: { payments: \"view\" } }"),
  body("roles")
    .custom((value: Record<string, unknown>) => Object.keys(value).every((k) => k === "admin" || k === "moderator"))
    .withMessage("Only admin and moderator access can be changed; super admins always have full access"),
];

export const updateMeRules: ValidationChain[] = [
  body("fullName").optional().trim().notEmpty().withMessage("Full name cannot be empty"),
  body("email")
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage("Please enter a valid email address"),
  body("phone")
    .optional({ checkFalsy: true })
    .matches(PHONE_REGEX)
    .withMessage("Please enter a valid phone number"),
  body("country")
    .optional({ checkFalsy: true })
    .matches(COUNTRY_CODE_REGEX)
    .withMessage("Country must be a 2-letter ISO code, e.g. GB"),
  body("address").optional().isObject().withMessage("Address must be an object"),
  body("address.line1").optional({ checkFalsy: true }).trim(),
  body("address.line2").optional({ checkFalsy: true }).trim(),
  body("address.city").optional({ checkFalsy: true }).trim(),
  body("address.state").optional({ checkFalsy: true }).trim(),
  body("address.postCode").optional({ checkFalsy: true }).trim(),
  body("address.country")
    .optional({ checkFalsy: true })
    .matches(COUNTRY_CODE_REGEX)
    .withMessage("Address country must be a 2-letter ISO code, e.g. GB"),
];

export const changePasswordRules: ValidationChain[] = [
  body("currentPassword").notEmpty().withMessage("Current password is required"),
  body("newPassword")
    .isLength({ min: 6 })
    .withMessage("New password must be at least 6 characters"),
];
