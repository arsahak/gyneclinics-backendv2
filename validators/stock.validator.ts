import { body, type ValidationChain } from "express-validator";
import mongoose from "mongoose";

const isValidObjectId = (value: string) => mongoose.Types.ObjectId.isValid(value);

export const createStockRules: ValidationChain[] = [
  body("product")
    .notEmpty()
    .withMessage("Product is required")
    .custom(isValidObjectId)
    .withMessage("Product must be a valid id"),
  body("supplier")
    .notEmpty()
    .withMessage("Supplier is required")
    .custom(isValidObjectId)
    .withMessage("Supplier must be a valid id"),
  body("quantity")
    .notEmpty()
    .withMessage("Quantity is required")
    .isInt({ min: 1 })
    .withMessage("Quantity must be at least 1")
    .toInt(),
  body("costPrice")
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage("Cost price must be a positive number")
    .toFloat(),
  body("note").optional({ checkFalsy: true }).trim(),
];

export const updateStockRules: ValidationChain[] = [
  body("product")
    .optional()
    .custom(isValidObjectId)
    .withMessage("Product must be a valid id"),
  body("supplier")
    .optional()
    .custom(isValidObjectId)
    .withMessage("Supplier must be a valid id"),
  body("quantity")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Quantity must be at least 1")
    .toInt(),
  body("costPrice")
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage("Cost price must be a positive number")
    .toFloat(),
  body("note").optional({ checkFalsy: true }).trim(),
];
