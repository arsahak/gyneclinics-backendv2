import { body, type ValidationChain } from "express-validator";
import mongoose from "mongoose";
import { PRODUCT_UNITS, PRODUCT_VIDEO_SOURCES } from "../models/product.model";
import { parseBestForIds } from "../utils/bestFor";
import {
  normalizeProductOptions,
  parseSizePrices,
} from "../utils/productOptions";

const isValidObjectId = (value: string) => mongoose.Types.ObjectId.isValid(value);

// `sizes` and `colors` are JSON strings in the multipart body. Checked
// together (colors reference sizes) and only for shape here — the controller
// re-runs the same normalizer to get the cleaned values. A thrown Error's
// message becomes the validation message.
const productOptionRules: ValidationChain[] = [
  body("colors").custom((colors, { req }) => {
    normalizeProductOptions(req.body?.sizes, colors);
    return true;
  }),
  body("sizePrices").custom((sizePrices) => {
    parseSizePrices(sizePrices);
    return true;
  }),
  // A JSON string too; the controller checks the ids are real options.
  body("bestFor").custom((bestFor) => {
    parseBestForIds(bestFor);
    return true;
  }),
];

export const createProductRules: ValidationChain[] = [
  body("title").trim().notEmpty().withMessage("Title is required"),
  body("sku").trim().notEmpty().withMessage("SKU is required"),
  body("category")
    .notEmpty()
    .withMessage("Category is required")
    .custom(isValidObjectId)
    .withMessage("Category must be a valid id"),
  body("brand")
    .optional({ checkFalsy: true })
    .custom(isValidObjectId)
    .withMessage("Brand must be a valid id"),
  body("vendor")
    .optional({ checkFalsy: true })
    .custom(isValidObjectId)
    .withMessage("Vendor must be a valid id"),
  body("shortDescription").optional({ checkFalsy: true }).trim(),
  body("overview").optional({ checkFalsy: true }).trim(),
  body("price")
    .notEmpty()
    .withMessage("Price is required")
    .isFloat({ min: 0 })
    .withMessage("Price must be a positive number")
    .toFloat(),
  body("discountPrice")
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage("Discount price must be a positive number")
    .toFloat(),
  body("unit")
    .optional()
    .isIn(PRODUCT_UNITS)
    .withMessage(`Unit must be one of: ${PRODUCT_UNITS.join(", ")}`),
  body("weight")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Weight must be a non-negative number")
    .toFloat(),
  body("stock")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Stock must be a non-negative integer")
    .toInt(),
  body("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be a boolean")
    .toBoolean(),
  body("isFeatured")
    .optional()
    .isBoolean()
    .withMessage("isFeatured must be a boolean")
    .toBoolean(),
  body("isTrending")
    .optional()
    .isBoolean()
    .withMessage("isTrending must be a boolean")
    .toBoolean(),
  body("isBestSeller")
    .optional()
    .isBoolean()
    .withMessage("isBestSeller must be a boolean")
    .toBoolean(),
  body("isFreeDelivery")
    .optional()
    .isBoolean()
    .withMessage("isFreeDelivery must be a boolean")
    .toBoolean(),
  body("isNewArrival")
    .optional()
    .isBoolean()
    .withMessage("isNewArrival must be a boolean")
    .toBoolean(),
  body("videoSource")
    .optional({ checkFalsy: true })
    .isIn(PRODUCT_VIDEO_SOURCES)
    .withMessage(`videoSource must be one of: ${PRODUCT_VIDEO_SOURCES.join(", ")}`),
  body("videoUrl").optional({ checkFalsy: true }).trim(),
  body("sortOrder")
    .optional()
    .isInt({ min: 0 })
    .withMessage("sortOrder must be a non-negative integer")
    .toInt(),
  ...productOptionRules,
];

export const updateProductRules: ValidationChain[] = [
  body("title").optional().trim().notEmpty().withMessage("Title cannot be empty"),
  body("sku").optional().trim().notEmpty().withMessage("SKU cannot be empty"),
  body("category")
    .optional()
    .custom(isValidObjectId)
    .withMessage("Category must be a valid id"),
  body("brand")
    .optional({ checkFalsy: true })
    .custom(isValidObjectId)
    .withMessage("Brand must be a valid id"),
  body("vendor")
    .optional({ checkFalsy: true })
    .custom(isValidObjectId)
    .withMessage("Vendor must be a valid id"),
  body("shortDescription").optional({ checkFalsy: true }).trim(),
  body("overview").optional({ checkFalsy: true }).trim(),
  body("price")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Price must be a positive number")
    .toFloat(),
  body("discountPrice")
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage("Discount price must be a positive number")
    .toFloat(),
  body("unit")
    .optional()
    .isIn(PRODUCT_UNITS)
    .withMessage(`Unit must be one of: ${PRODUCT_UNITS.join(", ")}`),
  body("weight")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Weight must be a non-negative number")
    .toFloat(),
  body("stock")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Stock must be a non-negative integer")
    .toInt(),
  body("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be a boolean")
    .toBoolean(),
  body("isFeatured")
    .optional()
    .isBoolean()
    .withMessage("isFeatured must be a boolean")
    .toBoolean(),
  body("isTrending")
    .optional()
    .isBoolean()
    .withMessage("isTrending must be a boolean")
    .toBoolean(),
  body("isBestSeller")
    .optional()
    .isBoolean()
    .withMessage("isBestSeller must be a boolean")
    .toBoolean(),
  body("isFreeDelivery")
    .optional()
    .isBoolean()
    .withMessage("isFreeDelivery must be a boolean")
    .toBoolean(),
  body("isNewArrival")
    .optional()
    .isBoolean()
    .withMessage("isNewArrival must be a boolean")
    .toBoolean(),
  body("videoSource")
    .optional({ checkFalsy: true })
    .isIn(PRODUCT_VIDEO_SOURCES)
    .withMessage(`videoSource must be one of: ${PRODUCT_VIDEO_SOURCES.join(", ")}`),
  body("videoUrl").optional({ checkFalsy: true }).trim(),
  body("removeVideo").optional().isBoolean().toBoolean(),
  body("sortOrder")
    .optional()
    .isInt({ min: 0 })
    .withMessage("sortOrder must be a non-negative integer")
    .toInt(),
  body("removeFeatureImage").optional().isBoolean().toBoolean(),
  body("keepGalleryImages").optional().isString(),
  ...productOptionRules,
];
