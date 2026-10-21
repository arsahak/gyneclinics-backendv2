import { body, param, type ValidationChain } from "express-validator";
import mongoose from "mongoose";
import {
  COST_CATEGORIES,
  COST_PAYMENT_METHODS,
  COST_PAYERS,
} from "../models/cost.model";

const commonRules = (optional: boolean): ValidationChain[] => {
  const field = (name: string, message: string) => {
    const chain = body(name);
    if (optional) return chain.optional();
    return chain.notEmpty().withMessage(message);
  };

  return [
    field("title", "Cost title is required")
      .trim()
      .isLength({ max: 120 })
      .withMessage("Cost title cannot exceed 120 characters"),
    field("category", "Category is required")
      .isIn(COST_CATEGORIES)
      .withMessage("Invalid cost category"),
    body("customCategory")
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ max: 80 })
      .withMessage("Custom category cannot exceed 80 characters"),
    field("reason", "Reason is required")
      .trim()
      .isLength({ max: 1000 })
      .withMessage("Reason cannot exceed 1000 characters"),
    field("amount", "Amount is required")
      .isFloat({ min: 1 })
      .withMessage("Amount must be at least ৳1")
      .toFloat(),
    field("expenseDate", "Expense date is required")
      .isISO8601({ strict: true })
      .withMessage("Expense date must be a valid date")
      .toDate(),
    field("paymentMethod", "Payment method is required")
      .isIn(COST_PAYMENT_METHODS)
      .withMessage("Invalid payment method"),
    field("paidBy", "Paid by is required")
      .isIn(COST_PAYERS)
      .withMessage("Invalid payer"),
    body("reference")
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ max: 120 })
      .withMessage("Reference cannot exceed 120 characters"),
    body("comment")
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ max: 500 })
      .withMessage("Comment cannot exceed 500 characters"),
    body("removeAttachment")
      .optional()
      .isBoolean()
      .withMessage("removeAttachment must be true or false")
      .toBoolean(),
    body("customCategory").custom((value, { req }) => {
      if (req.body.category === "Other" && !String(value || "").trim()) {
        throw new Error("Custom category is required when category is Other");
      }
      return true;
    }),
  ];
};

export const createCostRules = commonRules(false);
export const updateCostRules = commonRules(true);

export const costIdRules: ValidationChain[] = [
  param("id").custom((value) => mongoose.Types.ObjectId.isValid(value)).withMessage(
    "Invalid cost id",
  ),
];
