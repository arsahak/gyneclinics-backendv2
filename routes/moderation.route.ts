import { Router } from "express";
import { listFlags, setFlagStatus } from "../controllers/moderation.controller";
import { protect } from "../middleware/auth";
import { requireAccess } from "../utils/permissions";
import { validate } from "../middleware/validate";
import { flagStatusRules, listFlagsRules } from "../validators/chat.validator";

// Mounted at /api/v1/moderation. Staff only.
//   GET   /flags       what the chat safety filter caught (status, kind, page) with stats
//   PATCH /flags/:id   allowed / warned / suspended (blocks the sender) / escalated
const router = Router();
const canView = [protect, requireAccess("chat_moderation", "view")];
const canManage = [protect, requireAccess("chat_moderation", "manage")];

/**
 * @swagger
 * /moderation/flags:
 *   get:
 *     summary: Chat Moderation queue (staff)
 *     description: New ones first, urgent health at the top. Each has the last messages before it and the sender's earlier flags.
 *     tags: [Moderation]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [new, all, allowed, warned, suspended, escalated] } }
 *       - { in: query, name: kind, schema: { type: string, enum: [phone, email, link, social, abuse, urgent_health] } }
 *     responses:
 *       200: { description: flags, pagination, stats }
 * /moderation/flags/{id}:
 *   patch:
 *     summary: Decide on a flag (staff)
 *     description: "suspended" also blocks the sender's account.
 *     tags: [Moderation]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status: { type: string, enum: [allowed, warned, suspended, escalated] }
 *     responses:
 *       200: { description: Updated }
 */
router.get("/flags", ...canView, listFlagsRules, validate, listFlags);
router.patch("/flags/:id", ...canManage, flagStatusRules, validate, setFlagStatus);

export default router;
