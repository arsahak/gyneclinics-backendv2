import { body, param, query, type ValidationChain } from "express-validator";
import { PREGNANCY_STATUSES } from "../models/patient.model";
import { E164_REGEX } from "./auth.validator";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const isPastOrToday = (value: string) => new Date(value) <= new Date();

const fullNameRule = () =>
  body("fullName")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Full name must be 2–100 characters");

/**
 * Health profile fields. `prefix` nests them (e.g. "profile." for admin
 * create/edit); `onlyIf` skips them when that object wasn't sent.
 */
function healthRules(prefix = "", onlyIf?: string): ValidationChain[] {
  const field = (name: string) => {
    const chain = body(`${prefix}${name}`);
    return onlyIf ? chain.if(body(onlyIf).exists({ values: "falsy" })) : chain;
  };
  return [
    field("dateOfBirth")
      .matches(DATE_ONLY)
      .withMessage("Date of birth must be yyyy-MM-dd")
      .bail()
      .custom(isPastOrToday)
      .withMessage("Date of birth can't be in the future"),
    field("heightCm").isFloat({ min: 100, max: 230 }).withMessage("Height must be 100–230 cm").toFloat(),
    field("weightKg").isFloat({ min: 25, max: 250 }).withMessage("Weight must be 25–250 kg").toFloat(),
    field("typicalCycleLength").isInt({ min: 15, max: 60 }).withMessage("Cycle length must be 15–60 days").toInt(),
    field("typicalPeriodLength").isInt({ min: 1, max: 14 }).withMessage("Period length must be 1–14 days").toInt(),
    field("lastPeriodStart")
      .optional({ values: "falsy" })
      .matches(DATE_ONLY)
      .withMessage("Last period start must be yyyy-MM-dd")
      .bail()
      .custom(isPastOrToday)
      .withMessage("Last period start can't be in the future"),
    field("pregnancyStatus")
      .isIn(PREGNANCY_STATUSES)
      .withMessage(`Pregnancy status must be one of: ${PREGNANCY_STATUSES.join(", ")}`),
    body(`${prefix}dueDate`)
      .if(body(`${prefix}pregnancyStatus`).equals("pregnant"))
      .matches(DATE_ONLY)
      .withMessage("Due date is required when pregnant (yyyy-MM-dd)"),
  ];
}

/** PUT /patients/me — the full profile from patient onboarding or profile edit. */
export const patientProfileRules: ValidationChain[] = [fullNameRule(), ...healthRules()];

// ── Admin patient management ────────────────────────────────────────────────

export const listPatientsRules: ValidationChain[] = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be 1 or more").toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be 1–100").toInt(),
  query("status").optional().isIn(["all", "active", "suspended"]).withMessage("Status must be all, active or suspended"),
  query("sort")
    .optional()
    .isIn(["newest", "oldest", "name_asc", "name_desc"])
    .withMessage("Sort must be newest, oldest, name_asc or name_desc"),
  query("search").optional().isString().trim().isLength({ max: 100 }).withMessage("Search is too long"),
];

export const patientIdRules: ValidationChain[] = [
  param("id").isMongoId().withMessage("Invalid patient id"),
];

export const suspendPatientRules: ValidationChain[] = [
  ...patientIdRules,
  body("reason").optional({ values: "falsy" }).isString().trim().isLength({ max: 500 }).withMessage("Reason must be at most 500 characters"),
];

// Accepts "+44 7700 900123" etc. and stores "+447700900123".
const phoneRule = () =>
  body("phone")
    .customSanitizer((value) => (value == null ? value : String(value).replace(/[\s().-]/g, "")))
    .matches(E164_REGEX)
    .withMessage("Enter the mobile number with the country code, e.g. +447700900123");

const emailRule = () =>
  body("email")
    .optional({ values: "falsy" })
    .trim()
    .isEmail()
    .withMessage("Please enter a valid email address");

/** POST /patients — admin creates a patient. The health profile is optional. */
export const createPatientRules: ValidationChain[] = [
  body("fullName").trim().isLength({ min: 2, max: 100 }).withMessage("Full name must be 2–100 characters"),
  phoneRule(),
  emailRule(),
  body("profile").optional({ values: "null" }).isObject().withMessage("Profile must be an object"),
  ...healthRules("profile.", "profile"),
];

/** PATCH /patients/:id — admin edits a patient. Send only what changes. */
export const updatePatientRules: ValidationChain[] = [
  ...patientIdRules,
  fullNameRule(),
  phoneRule().optional(),
  emailRule(),
  body("profile").optional({ values: "null" }).isObject().withMessage("Profile must be an object"),
  ...healthRules("profile.", "profile"),
];
