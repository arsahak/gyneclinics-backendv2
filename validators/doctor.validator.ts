import { body, param, query, type ValidationChain } from "express-validator";
import { SLOT_LENGTHS, SPECIALIZATIONS, TIME_REGEX } from "../models/doctor.model";
import { E164_REGEX } from "./auth.validator";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const fullNameRule = () =>
  body("fullName")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Full name must be 2–100 characters");

/**
 * Doctor profile fields. With `optional`, every field may be left out (admin
 * edit sends only what changes); otherwise the required ones must be present.
 */
function doctorFieldRules(optional = false): ValidationChain[] {
  const field = (name: string) => (optional ? body(name).optional() : body(name));
  const list = (name: string, label: string) => [
    field(name)
      .isArray({ min: 1, max: 20 })
      .withMessage(`Add at least one ${label}`),
    body(`${name}.*`).isString().trim().isLength({ min: 1, max: 80 }),
  ];
  return [
    field("title").trim().isLength({ min: 2, max: 100 }).withMessage("Title is required"),
    field("specialization")
      .isIn(SPECIALIZATIONS)
      .withMessage(`Specialization must be one of: ${SPECIALIZATIONS.join(", ")}`),
    ...list("qualifications", "qualification"),
    ...list("languages", "language"),
    body("focusAreas").optional().isArray({ max: 20 }).withMessage("Focus areas must be a list"),
    body("focusAreas.*").optional().isString().trim().isLength({ min: 1, max: 80 }),
    field("experienceYears").isInt({ min: 0, max: 70 }).withMessage("Experience must be 0–70 years").toInt(),
    field("registrationNumber").trim().isLength({ min: 3, max: 50 }).withMessage("Registration number is required"),
    field("registrationBody").trim().isLength({ min: 2, max: 120 }).withMessage("Registration body is required"),
    body("clinic").optional().trim().isLength({ max: 120 }),
    field("city").trim().isLength({ min: 2, max: 80 }).withMessage("City is required"),
    body("country").optional({ values: "falsy" }).matches(/^[A-Za-z]{2}$/).withMessage("Country must be a 2-letter ISO code"),
    body("about").optional().trim().isLength({ max: 2000 }).withMessage("About must be at most 2000 characters"),
    field("feeGBP").isFloat({ min: 0, max: 10000 }).withMessage("Fee must be 0 or more").toFloat(),
  ];
}

const scheduleRules = (): ValidationChain[] => [
  body("schedule").optional().isObject().withMessage("Schedule must be an object"),
  body("schedule.weekly")
    .optional()
    .isArray({ min: 7, max: 7 })
    .withMessage("Schedule needs 7 days, Monday first"),
  body("schedule.weekly.*").optional().isArray({ max: 6 }),
  body("schedule.weekly.*.*.start").optional().matches(TIME_REGEX).withMessage("Times must be HH:mm"),
  body("schedule.weekly.*.*.end").optional().matches(TIME_REGEX).withMessage("Times must be HH:mm"),
  body("schedule.slotMinutes").optional().isIn(SLOT_LENGTHS).toInt(),
  body("schedule.bookingWindowDays").optional().isInt({ min: 1, max: 60 }).toInt(),
  body("schedule.minNoticeHours").optional().isInt({ min: 0, max: 72 }).toInt(),
  body("schedule.instantChat").optional().isBoolean().toBoolean(),
  body("schedule.timeOff").optional().isArray(),
  body("schedule.timeOff.*").optional().matches(DATE_ONLY),
  body("schedule.timezone").optional().isString().trim().isLength({ min: 1, max: 64 }),
];

/** PUT /doctors/me — the full profile from doctor onboarding or profile edit. */
/** messaging.free / messaging.consultation, both optional. */
const messagingRules = (): ValidationChain[] => [
  body("messaging").optional().isObject().withMessage("messaging must be an object"),
  body("messaging.free").optional().isBoolean().withMessage("messaging.free must be true or false").toBoolean(),
  body("messaging.consultation")
    .optional()
    .isBoolean()
    .withMessage("messaging.consultation must be true or false")
    .toBoolean(),
];

export const doctorProfileRules: ValidationChain[] = [fullNameRule(), ...doctorFieldRules(), ...scheduleRules()];

// ── Admin doctor management ─────────────────────────────────────────────────

export const DOCTOR_STATUS_FILTERS = ["all", "pending", "approved", "rejected", "suspended", "featured", "updates"] as const;
export const DOCTOR_SORTS = ["newest", "oldest", "rating", "experience", "name_asc", "name_desc"] as const;

export const listDoctorsRules: ValidationChain[] = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be 1 or more").toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be 1–100").toInt(),
  query("status")
    .optional()
    .isIn(DOCTOR_STATUS_FILTERS)
    .withMessage(`Status must be one of: ${DOCTOR_STATUS_FILTERS.join(", ")}`),
  query("sort")
    .optional()
    .isIn(DOCTOR_SORTS)
    .withMessage(`Sort must be one of: ${DOCTOR_SORTS.join(", ")}`),
  query("search").optional().isString().trim().isLength({ max: 100 }).withMessage("Search is too long"),
];

export const doctorIdRules: ValidationChain[] = [param("id").isMongoId().withMessage("Invalid doctor id")];

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

/** POST /doctors — admin creates a doctor (account + profile). */
export const createDoctorRules: ValidationChain[] = [
  body("fullName").trim().isLength({ min: 2, max: 100 }).withMessage("Full name must be 2–100 characters"),
  phoneRule(),
  emailRule(),
  ...doctorFieldRules(),
  ...scheduleRules(),
  ...messagingRules(),
];

/** PATCH /doctors/me — the signed-in doctor edits their profile. Send only what changes. Phone can't change here. */
export const updateMyDoctorRules: ValidationChain[] = [
  fullNameRule(),
  emailRule(),
  ...doctorFieldRules(true),
  ...scheduleRules(),
  ...messagingRules(),
  body("isOnline").optional().isBoolean().withMessage("isOnline must be true or false").toBoolean(),
];

/** PATCH /doctors/:id — admin edits a doctor. Send only what changes. */
export const updateDoctorRules: ValidationChain[] = [
  ...doctorIdRules,
  fullNameRule(),
  phoneRule().optional(),
  emailRule(),
  ...doctorFieldRules(true),
  ...scheduleRules(),
  ...messagingRules(),
];

const reasonRule = (field: string) =>
  body(field)
    .optional({ values: "falsy" })
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Reason must be at most 500 characters");

export const rejectDoctorRules: ValidationChain[] = [...doctorIdRules, reasonRule("reason")];
export const verificationDoctorRules: ValidationChain[] = [
  ...doctorIdRules,
  body("status").isIn(["pending", "approved", "rejected"]).withMessage("Status must be pending, approved or rejected"),
  reasonRule("reason"),
];
export const suspendDoctorRules: ValidationChain[] = [...doctorIdRules, reasonRule("reason")];
export const featureDoctorRules: ValidationChain[] = [
  ...doctorIdRules,
  body("featured").isBoolean().withMessage("featured must be true or false").toBoolean(),
];
export const rejectDoctorUpdateRules: ValidationChain[] = [...doctorIdRules, reasonRule("reason")];
export const autoApproveDoctorRules: ValidationChain[] = [
  ...doctorIdRules,
  body("enabled").isBoolean().withMessage("enabled must be true or false").toBoolean(),
];
