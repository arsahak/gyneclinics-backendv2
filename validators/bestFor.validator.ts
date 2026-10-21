import { body, type ValidationChain } from "express-validator";
import mongoose from "mongoose";
import {
  BEST_FOR_ICON_NAME,
  parseBestForColors,
} from "../utils/bestForColors";

const isValidObjectId = (value: string) =>
  mongoose.Types.ObjectId.isValid(value);

const sharedRules: ValidationChain[] = [
  // Empty means "no group" — the entry is itself a group.
  body("parent")
    .optional({ checkFalsy: true })
    .custom(isValidObjectId)
    .withMessage("Group must be a valid id"),
  // A JSON string in the multipart body; a thrown Error's message becomes
  // the validation message.
  body("colors").custom((colors) => {
    parseBestForColors(colors);
    return true;
  }),
  body("icon")
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .matches(BEST_FOR_ICON_NAME)
    .withMessage("icon must be an icon name"),
  body("removeImage")
    .optional()
    .isBoolean()
    .withMessage("removeImage must be a boolean")
    .toBoolean(),
  body("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be a boolean")
    .toBoolean(),
  body("isPinned")
    .optional()
    .isBoolean()
    .withMessage("isPinned must be a boolean")
    .toBoolean(),
  body("sortOrder")
    .optional()
    .isInt({ min: 0 })
    .withMessage("sortOrder must be a non-negative integer")
    .toInt(),
];

export const createBestForRules: ValidationChain[] = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ max: 60 })
    .withMessage("Name can be at most 60 characters"),
  ...sharedRules,
];

export const updateBestForRules: ValidationChain[] = [
  body("name")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Name cannot be empty")
    .isLength({ max: 60 })
    .withMessage("Name can be at most 60 characters"),
  ...sharedRules,
];
