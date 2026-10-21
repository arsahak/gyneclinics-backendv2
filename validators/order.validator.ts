import { body, type ValidationChain } from "express-validator";
import mongoose from "mongoose";
import {
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} from "../models/order.model";
import { BD_DIVISIONS, DELIVERY_ZONES, PHONE_REGEX } from "../models/user.model";
import { verifySigninOtpRules } from "./auth.validator";
import { BD_MOBILE_REGEX } from "../utils/signinOtp";

const isValidObjectId = (value: string) => mongoose.Types.ObjectId.isValid(value);

export const createOrderRules: ValidationChain[] = [
  body("customerName").trim().notEmpty().withMessage("Customer name is required"),
  body("customerCompany")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 120 })
    .withMessage("Company name must be 120 characters or fewer"),
  // The customer chooses how to be reached: a phone number, an email, or both.
  // Delivery is in Bangladesh, so the number is a Bangladeshi mobile:
  // 01XXXXXXXXX, 1XXXXXXXXX or +8801XXXXXXXXX (spaces and dashes dropped).
  body("customerPhone")
    .optional({ checkFalsy: true })
    .trim()
    .customSanitizer((value: string) => String(value).replace(/[\s-]/g, ""))
    .matches(BD_MOBILE_REGEX)
    .withMessage("Please enter a valid Bangladeshi mobile number"),
  body("customerEmail")
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage("Please enter a valid email address"),
  body().custom((_value, { req }) => {
    if (!req.body.customerPhone && !req.body.customerEmail) {
      throw new Error("A phone number or an email is required");
    }
    return true;
  }),
  body("shippingAddress")
    .isObject()
    .withMessage("Shipping address is required"),
  // The storefront checkout asks only for a delivery zone and an address.
  body("shippingAddress.division")
    .optional({ checkFalsy: true })
    .isIn(BD_DIVISIONS)
    .withMessage("Select a valid shipping division"),
  body("shippingAddress.district").optional({ checkFalsy: true }).trim(),
  body("shippingAddress.upazila").optional({ checkFalsy: true }).trim(),
  body("shippingAddress.postOffice").optional({ checkFalsy: true }).trim(),
  body("shippingAddress.postCode")
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[0-9]{4}$/)
    .withMessage("Post code must contain exactly four digits"),
  body("shippingAddress.area")
    .trim()
    .isLength({ min: 3 })
    .withMessage("Street address is required"),
  body("shippingAddress.zone")
    .notEmpty()
    .withMessage("Delivery zone is required")
    .isIn(DELIVERY_ZONES)
    .withMessage("Select a valid delivery zone"),
  body("items")
    .isArray({ min: 1 })
    .withMessage("An order must have at least one item")
    // The same product may appear more than once only as different
    // color/size variations.
    .custom((items: { product?: unknown; color?: unknown; size?: unknown }[]) => {
      const keys = items.map((item) =>
        [item?.product, item?.color, item?.size]
          .map((part) => String(part ?? "").trim().toLowerCase())
          .join("|"),
      );
      return new Set(keys).size === keys.length;
    })
    .withMessage(
      "Each product variation (color and size) may appear only once per order",
    ),
  body("items.*.color")
    .optional({ checkFalsy: true })
    .isString()
    .isLength({ max: 40 })
    .withMessage("Color must be a short text value"),
  body("items.*.size")
    .optional({ checkFalsy: true })
    .isString()
    .isLength({ max: 20 })
    .withMessage("Size must be a short text value"),
  body("items.*.product")
    .custom(isValidObjectId)
    .withMessage("Each item must reference a valid product id"),
  body("items.*.quantity")
    .isInt({ min: 1, max: 99 })
    .withMessage("Each item's quantity must be between 1 and 99")
    .toInt(),
  body("deliveryFee")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Delivery fee must be a non-negative number")
    .toFloat(),
  body("discount")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Discount must be a non-negative number")
    .toFloat(),
  body("paymentMethod")
    .isIn(PAYMENT_METHODS)
    .withMessage(`Payment method must be one of: ${PAYMENT_METHODS.join(", ")}`),
  body("notes").optional({ checkFalsy: true }).trim(),
  body("couponCode")
    .optional({ checkFalsy: true })
    .isString()
    .trim()
    .isLength({ max: 40 })
    .withMessage("Coupon code is too long"),
];

// Checkout for a visitor who isn't signed in: the order, plus the email/phone
// and the code that was sent to it.
export const checkoutWithOtpRules: ValidationChain[] = [
  ...verifySigninOtpRules,
  ...createOrderRules,
];

export const trackOrderRules: ValidationChain[] = [
  body("orderNumber")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Order number is required")
    .isLength({ max: 40 })
    .withMessage("Order number is too long"),
  // Whichever the order was placed with.
  body("phone")
    .optional({ checkFalsy: true })
    .isString()
    .trim()
    .matches(/^[+]?[0-9\s\-()]{7,20}$/)
    .withMessage("Please enter a valid phone number"),
  body("email")
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage("Please enter a valid email address"),
  body().custom((_value, { req }) => {
    if (!req.body.phone && !req.body.email) {
      throw new Error("A phone number or an email is required");
    }
    return true;
  }),
];

export const updateOrderRules: ValidationChain[] = [
  body("orderStatus")
    .optional()
    .isIn(ORDER_STATUSES)
    .withMessage(`Order status must be one of: ${ORDER_STATUSES.join(", ")}`),
  body("paymentStatus")
    .optional()
    .isIn(PAYMENT_STATUSES)
    .withMessage(`Payment status must be one of: ${PAYMENT_STATUSES.join(", ")}`),
  body("notes").optional({ checkFalsy: true }).trim(),
  body("customerName")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Customer name cannot be empty"),
  body("customerCompany")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 120 })
    .withMessage("Company name must be 120 characters or fewer"),
  body("customerPhone")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Customer phone cannot be empty")
    .matches(PHONE_REGEX)
    .withMessage("Please enter a valid phone number"),
  body("customerEmail")
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage("Please enter a valid email address"),
  body("shippingAddress.division").optional({ checkFalsy: true }).isIn(BD_DIVISIONS),
  body("shippingAddress.district").optional({ checkFalsy: true }).trim(),
  body("shippingAddress.upazila").optional({ checkFalsy: true }).trim(),
  body("shippingAddress.postOffice").optional({ checkFalsy: true }).trim(),
  body("shippingAddress.postCode").optional({ checkFalsy: true }).trim(),
  body("shippingAddress.area").optional({ checkFalsy: true }).trim(),
  body("shippingAddress.zone").optional({ checkFalsy: true }).isIn(DELIVERY_ZONES),
  body("items")
    .optional()
    .isArray({ min: 1 })
    .withMessage("An order must have at least one item"),
  body("items.*.product")
    .optional()
    .custom(isValidObjectId)
    .withMessage("Each item must reference a valid product id"),
  body("items.*.quantity")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Each item's quantity must be a positive integer")
    .toInt(),
];
