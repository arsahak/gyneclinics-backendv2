import { body, param, type ValidationChain } from "express-validator";
import { PERIOD_FLOWS } from "../models/tracker.model";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
// A day up to tomorrow is accepted, so a patient ahead of UTC can log "today".
const notInFuture = (value: string) => Date.parse(`${value}T00:00:00Z`) <= Date.now() + 86_400_000;

const dayRule = (field: string, label: string) =>
  body(field)
    .matches(DATE_ONLY)
    .withMessage(`${label} must be a real date (yyyy-MM-dd)`)
    .bail()
    .isISO8601({ strict: true })
    .withMessage(`${label} must be a real date (yyyy-MM-dd)`)
    .bail()
    .custom(notInFuture)
    .withMessage(`${label} can't be in the future`);

export const entryIdRules: ValidationChain[] = [param("id").isMongoId().withMessage("Invalid entry")];

/** POST /tracker/periods and PATCH /tracker/periods/:id (the whole entry). */
export const periodRules: ValidationChain[] = [
  dayRule("start", "Start date"),
  body("end")
    .optional({ values: "falsy" })
    .matches(DATE_ONLY)
    .withMessage("End date must be a real date (yyyy-MM-dd)")
    .bail()
    .isISO8601({ strict: true })
    .withMessage("End date must be a real date (yyyy-MM-dd)")
    .bail()
    .custom((end: string, { req }) => end >= req.body.start)
    .withMessage("The end date must be on or after the start date")
    .bail()
    .custom((end: string, { req }) => Date.parse(end) - Date.parse(req.body.start) <= 14 * 86_400_000)
    .withMessage("A period can be at most 15 days long"),
  body("flow").optional({ values: "falsy" }).isIn(PERIOD_FLOWS).withMessage(`Flow must be one of: ${PERIOD_FLOWS.join(", ")}`),
  body("symptoms").optional().isArray({ max: 20 }).withMessage("Symptoms must be a list"),
  body("symptoms.*").isString().trim().isLength({ min: 1, max: 40 }).withMessage("Each symptom must be 1–40 characters"),
  body("note").optional({ values: "falsy" }).isString().trim().isLength({ max: 500 }).withMessage("Note must be at most 500 characters"),
];

export const weightRules: ValidationChain[] = [
  dayRule("date", "Date"),
  body("kg").isFloat({ min: 25, max: 250 }).withMessage("Weight must be 25–250 kg").toFloat(),
];

export const babyGrowthRules: ValidationChain[] = [
  dayRule("date", "Scan date"),
  body("week").isInt({ min: 4, max: 42 }).withMessage("Week must be 4–42").toInt(),
  body("weightG").isFloat({ min: 1, max: 6000 }).withMessage("Weight must be 1–6000 g").toFloat(),
  body("lengthCm").isFloat({ min: 0.1, max: 60 }).withMessage("Length must be 0.1–60 cm").toFloat(),
];
