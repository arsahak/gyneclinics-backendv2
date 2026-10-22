import { body, param, query, type ValidationChain } from "express-validator";
import { CONSULTATION_MODES } from "../models/consultation.model";
import { CONSULTATION_STAGES } from "../utils/consultationStage";
import { REGION_IDS } from "../utils/regions";

const isTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

const bookingRules: ValidationChain[] = [
  body("doctorId").isMongoId().withMessage("Invalid doctor id"),
  body("mode").isIn(CONSULTATION_MODES).withMessage("Mode must be instant or scheduled"),
  body("concern").isString().trim().isLength({ min: 1, max: 1000 }).withMessage("Describe your concern (up to 1000 characters)"),
  body("startsAt").isISO8601().withMessage("startsAt must be a date-time").toDate(),
  body("timezone").optional().isString().custom(isTimeZone).withMessage("Unknown time zone"),
  body("regionId").isIn(REGION_IDS).withMessage(`Region must be one of: ${REGION_IDS.join(", ")}`),
];

/** POST /consultations — a free booking. */
export const createConsultationRules: ValidationChain[] = [
  body("reference").optional().matches(/^GC-[A-Z0-9]{6}$/).withMessage("Reference must look like GC-4K7Q2M"),
  ...bookingRules,
];

/** POST /consultations/checkout — start paying for a booking. */
export const startCheckoutRules: ValidationChain[] = bookingRules;

/** POST /consultations/checkout/:paymentIntentId/confirm */
export const confirmCheckoutRules: ValidationChain[] = [
  param("paymentIntentId").matches(/^pi_[A-Za-z0-9]+$/).withMessage("Invalid payment id"),
];

const CONSULTATION_SORTS = ["newest", "oldest", "starts_soon", "starts_latest"];

/** GET /consultations — staff list. */
export const listConsultationsRules: ValidationChain[] = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be 1 or more").toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be 1–100").toInt(),
  query("stage").optional().isIn(["all", ...CONSULTATION_STAGES]).withMessage(`Stage must be one of: all, ${CONSULTATION_STAGES.join(", ")}`),
  query("mode").optional().isIn(CONSULTATION_MODES).withMessage("Mode must be instant or scheduled"),
  query("doctorId").optional().isMongoId().withMessage("Invalid doctor id"),
  query("sort").optional().isIn(CONSULTATION_SORTS).withMessage(`Sort must be one of: ${CONSULTATION_SORTS.join(", ")}`),
  query("search").optional().isString().trim().isLength({ max: 100 }).withMessage("Search is too long"),
];
