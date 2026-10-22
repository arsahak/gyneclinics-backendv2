import { body, param, query, type ValidationChain } from "express-validator";
import { FLAG_KINDS, FLAG_STATUSES } from "../models/chatFlag.model";

const pageRules: ValidationChain[] = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be 1 or more").toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be 1–100").toInt(),
];

/** POST /chats/messages — patient (doctorId) or doctor (chatId). */
export const sendMessageRules: ValidationChain[] = [
  body("text").isString().trim().isLength({ min: 1, max: 2000 }).withMessage("Write a message (up to 2000 characters)"),
  body("doctorId").optional().isMongoId().withMessage("Invalid doctor id"),
  body("chatId").optional().isMongoId().withMessage("Invalid chat id"),
];

export const doctorIdRules: ValidationChain[] = [param("doctorId").isMongoId().withMessage("Invalid doctor id")];
export const chatIdRules: ValidationChain[] = [param("id").isMongoId().withMessage("Invalid chat id")];

/** GET /chats — staff. */
export const listChatsRules: ValidationChain[] = [
  ...pageRules,
  query("type").optional().isIn(["free", "consultation", "follow_up"]).withMessage("Type must be free, consultation or follow_up"),
  query("waiting").optional().isIn(["doctor", "patient"]).withMessage("Waiting must be doctor or patient"),
  query("doctorId").optional().isMongoId().withMessage("Invalid doctor id"),
  query("flagged").optional().isIn(["true", "false"]),
  query("search").optional().isString().trim().isLength({ max: 100 }).withMessage("Search is too long"),
];

/** GET /moderation/flags — staff. */
export const listFlagsRules: ValidationChain[] = [
  ...pageRules,
  query("status").optional().isIn(["all", ...FLAG_STATUSES]).withMessage(`Status must be one of: all, ${FLAG_STATUSES.join(", ")}`),
  query("kind").optional().isIn(FLAG_KINDS).withMessage(`Kind must be one of: ${FLAG_KINDS.join(", ")}`),
];

/** PATCH /moderation/flags/:id — staff. */
export const flagStatusRules: ValidationChain[] = [
  param("id").isMongoId().withMessage("Invalid flag id"),
  body("status").isIn(FLAG_STATUSES.filter((s) => s !== "new")).withMessage("Status must be allowed, warned, suspended or escalated"),
];
