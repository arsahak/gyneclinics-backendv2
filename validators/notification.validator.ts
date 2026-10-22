import { body, param, query, type ValidationChain } from "express-validator";
import { ANNOUNCEMENT_AUDIENCES, ANNOUNCEMENT_CHANNELS, ANNOUNCEMENT_STATUSES, LINK_TARGETS } from "../models/announcement.model";
import { REGION_IDS } from "../utils/regions";

/** POST /announcements — staff. */
export const createAnnouncementRules: ValidationChain[] = [
  body("action").isIn(["send", "schedule", "draft"]).withMessage("Action must be send, schedule or draft"),
  body("title").isString().trim().isLength({ min: 1, max: 60 }).withMessage("Add a title (up to 60 characters)"),
  body("body")
    .if(body("action").not().equals("draft"))
    .isString()
    .trim()
    .isLength({ min: 1, max: 240 })
    .withMessage("Write the message (up to 240 characters)"),
  body("body").optional().isString().isLength({ max: 240 }).withMessage("The message is too long (240 characters)"),
  body("audience").isIn(ANNOUNCEMENT_AUDIENCES).withMessage("Choose who gets it"),
  body("region").optional({ checkFalsy: true }).isIn(REGION_IDS).withMessage("Unknown region"),
  body("channels").isArray({ min: 1 }).withMessage("Pick at least one way to send it"),
  body("channels.*").isIn(ANNOUNCEMENT_CHANNELS).withMessage("Unknown channel"),
  body("link").optional({ checkFalsy: true }).isIn(LINK_TARGETS).withMessage("Unknown link"),
  body("scheduledAt").if(body("action").equals("schedule")).isISO8601().withMessage("Choose the date and time"),
  body("fromDraft").optional().isMongoId(),
];

export const listAnnouncementsRules: ValidationChain[] = [
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
  query("status").optional().isIn(["all", ...ANNOUNCEMENT_STATUSES]).withMessage("Unknown status"),
];

export const idRules: ValidationChain[] = [param("id").isMongoId().withMessage("Invalid id")];

export const myNotificationsRules: ValidationChain[] = [query("limit").optional().isInt({ min: 1, max: 100 }).toInt()];

export const autoMessageRules: ValidationChain[] = [
  param("key").isString().trim().isLength({ min: 2, max: 40 }),
  body("enabled").isBoolean().withMessage("enabled must be true or false").toBoolean(),
];
