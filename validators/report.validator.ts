import { body, param, query, type ValidationChain } from "express-validator";
import { REPORT_ACTIONS, REPORT_PRIORITIES, REPORT_REASONS, REPORT_STATUSES } from "../models/report.model";

/** POST /reports — patient (doctorId) or doctor (patientId). */
export const createReportRules: ValidationChain[] = [
  body("reason").isIn(REPORT_REASONS).withMessage("Choose what happened"),
  body("details").isString().trim().isLength({ min: 10, max: 1000 }).withMessage("Tell us what happened (10 to 1000 characters)"),
  body("doctorId").optional().isMongoId().withMessage("Invalid doctor id"),
  body("patientId").optional().isMongoId().withMessage("Invalid patient id"),
  body("consultationId").optional().isMongoId().withMessage("Invalid consultation id"),
];

/** GET /reports — staff. */
export const listReportsRules: ValidationChain[] = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be 1 or more").toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be 1–100").toInt(),
  query("status").optional().isIn(["todo", "all", ...REPORT_STATUSES]).withMessage(`Status must be one of: todo, all, ${REPORT_STATUSES.join(", ")}`),
  query("priority").optional().isIn(REPORT_PRIORITIES).withMessage(`Priority must be one of: ${REPORT_PRIORITIES.join(", ")}`),
  query("reason").optional().isIn(REPORT_REASONS).withMessage("Unknown reason"),
  query("search").optional().isString().trim().isLength({ max: 100 }).withMessage("Search is too long"),
];

export const reportIdRules: ValidationChain[] = [param("id").isMongoId().withMessage("Invalid report id")];

/** PATCH /reports/:id/close — staff. */
export const closeReportRules: ValidationChain[] = [
  ...reportIdRules,
  body("outcome").isIn(["resolved", "dismissed"]).withMessage("Outcome must be resolved or dismissed"),
  body("action")
    .if(body("outcome").equals("resolved"))
    .isIn(REPORT_ACTIONS.filter((a) => a !== "no_action"))
    .withMessage("Choose what you did"),
  body("note").optional().isString().trim().isLength({ max: 1000 }).withMessage("Note is too long (1000 characters)"),
];
