import { body, type ValidationChain } from "express-validator";
import { CONSULTATION_MODES } from "../models/consultation.model";

const isTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

/** POST /consultations — the patient's payment went through. */
export const createConsultationRules: ValidationChain[] = [
  body("reference").matches(/^GC-[A-Z0-9]{6}$/).withMessage("Reference must look like GC-4K7Q2M"),
  body("doctorId").isMongoId().withMessage("Invalid doctor id"),
  body("mode").isIn(CONSULTATION_MODES).withMessage("Mode must be instant or scheduled"),
  body("concern").isString().trim().isLength({ min: 1, max: 1000 }).withMessage("Describe your concern (up to 1000 characters)"),
  body("startsAt").isISO8601().withMessage("startsAt must be a date-time").toDate(),
  body("timezone").optional().isString().custom(isTimeZone).withMessage("Unknown time zone"),
  body("payment").isObject().withMessage("Payment is required"),
  body("payment.amount").isFloat({ min: 0 }).withMessage("Payment amount can't be negative").toFloat(),
  body("payment.currency").isString().trim().isLength({ min: 3, max: 3 }).withMessage("Currency must be a 3-letter code"),
  body("payment.regionId").isString().trim().notEmpty().withMessage("Region is required"),
  body("payment.method").isString().trim().notEmpty().withMessage("Payment method is required"),
  body("payment.reference").isString().trim().notEmpty().withMessage("Payment reference is required"),
  body("payment.details").optional().isString().trim().isLength({ max: 100 }),
  body("payment.paidAt").optional().isISO8601().toDate(),
];
