import { body, param, type ValidationChain } from "express-validator";
import { COUPON_TYPES } from "../models/coupon.model";

export const validateCouponRules: ValidationChain[] = [
  body("code")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Coupon code is required")
    .isLength({ max: 40 })
    .withMessage("Coupon code is too long"),
  body("subtotal")
    .isFloat({ min: 0 })
    .withMessage("Subtotal must be a non-negative number")
    .toFloat(),
];

const couponFieldRules = (required: boolean): ValidationChain[] => {
  const field = (name: string) =>
    required ? body(name) : body(name).optional();

  return [
    field("code")
      .isString()
      .trim()
      .notEmpty()
      .withMessage("Coupon code is required")
      .isLength({ max: 40 })
      .withMessage("Coupon code must be 40 characters or fewer")
      .matches(/^[A-Za-z0-9_-]+$/)
      .withMessage("Coupon code may only contain letters, numbers, - and _"),
    field("discountType")
      .isIn(COUPON_TYPES)
      .withMessage(`Discount type must be one of: ${COUPON_TYPES.join(", ")}`),
    field("discountValue")
      .isFloat({ gt: 0 })
      .withMessage("Discount value must be more than zero")
      .toFloat(),
    body("minOrderAmount")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Minimum order amount must be a non-negative number")
      .toFloat(),
    body("expiresAt")
      .optional({ nullable: true })
      .isISO8601()
      .withMessage("Expiry must be a valid date")
      .toDate(),
    body("isActive")
      .optional()
      .isBoolean()
      .withMessage("isActive must be true or false")
      .toBoolean(),
  ];
};

export const createCouponRules = couponFieldRules(true);

export const updateCouponRules = couponFieldRules(false);

export const couponIdRules: ValidationChain[] = [
  param("id").isMongoId().withMessage("Invalid coupon id"),
];
