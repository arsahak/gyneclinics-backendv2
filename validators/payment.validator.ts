import { body, param, query, type ValidationChain } from "express-validator";

/** GET /payments — staff. */
export const listPaymentsRules: ValidationChain[] = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be 1 or more").toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be 1–100").toInt(),
  query("status").optional().isIn(["all", "clearing", "cleared", "refunded"]).withMessage("Status must be all, clearing, cleared or refunded"),
  query("doctorId").optional().isMongoId().withMessage("Invalid doctor id"),
  query("method").optional().isIn(["card", "local", "wallet"]).withMessage("Method must be card, local or wallet"),
  query("search").optional().isString().trim().isLength({ max: 100 }).withMessage("Search is too long"),
];

/** PATCH /payments/:id/refund — super admin. */
export const refundPaymentRules: ValidationChain[] = [
  param("id").isMongoId().withMessage("Invalid payment id"),
  body("reason").isString().trim().isLength({ min: 3, max: 300 }).withMessage("Say why it was refunded (3 to 300 characters)"),
];
