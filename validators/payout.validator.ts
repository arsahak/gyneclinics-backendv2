import { body, param, query, type ValidationChain } from "express-validator";
import { WITHDRAWAL_STATUSES } from "../models/withdrawal.model";

/** POST /payouts/me/stripe — doctor: where Stripe sends them back to. */
export const stripeLinkRules: ValidationChain[] = [body("returnUrl").isURL({ require_tld: false, require_protocol: true }).withMessage("Invalid return address")];

/** POST /payouts/me/withdraw — doctor. */
export const withdrawRules: ValidationChain[] = [body("amountGBP").isFloat({ gt: 0 }).withMessage("Enter an amount in pounds").toFloat()];

/** GET /payouts — staff. */
export const listWithdrawalsRules: ValidationChain[] = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be 1 or more").toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be 1–100").toInt(),
  query("status").optional().isIn(["todo", "all", ...WITHDRAWAL_STATUSES]).withMessage(`Status must be one of: todo, all, ${WITHDRAWAL_STATUSES.join(", ")}`),
  query("search").optional().isString().trim().isLength({ max: 100 }).withMessage("Search is too long"),
];

export const withdrawalIdRules: ValidationChain[] = [param("id").isMongoId().withMessage("Invalid withdrawal id")];
export const rejectRules: ValidationChain[] = [
  ...withdrawalIdRules,
  body("reason").isString().trim().isLength({ min: 3, max: 300 }).withMessage("Say why (the doctor sees it)"),
];
