import { Router } from "express";
import { getChatForDoctor, getChatForStaff, getChatWithDoctor, listChats, listMyChats, sendMessage } from "../controllers/chat.controller";
import { authorize, protect } from "../middleware/auth";
import { requireAccess } from "../utils/permissions";
import { validate } from "../middleware/validate";
import { chatIdRules, doctorIdRules, listChatsRules, sendMessageRules } from "../validators/chat.validator";

// Mounted at /api/v1/chats.
//   GET  /mine                  patient or doctor: your conversations
//   GET  /doctor/:doctorId      patient: your chat with a doctor (+ can you write now)
//   GET  /:id                   doctor: one of your chats
//   POST /messages              patient (doctorId) or doctor (chatId): send
//   GET  /                      staff: Chat Monitoring list with stats
//   GET  /:id/staff             staff: one chat, read only
const router = Router();
const app = [protect, authorize("patient", "doctor")];
const canView = [protect, requireAccess("chat_monitoring", "view")];
const canManage = [protect, requireAccess("chat_monitoring", "manage")];

/**
 * @swagger
 * /chats/mine:
 *   get:
 *     summary: Your conversations (patient or doctor)
 *     tags: [Chats]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Chats with the other person, newest first }
 * /chats/doctor/{doctorId}:
 *   get:
 *     summary: Patient's chat with one doctor
 *     description: Messages, plus canSend (free messages on, or a consultation/follow-up running) and the reason if not.
 *     tags: [Chats]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: chat, messages, canSend, reason, type }
 * /chats/messages:
 *   post:
 *     summary: Send a message
 *     description: >
 *       Patients pass doctorId, doctors pass chatId. Contact details are refused (422)
 *       and logged for Chat Moderation. Abusive or urgent-health words are delivered and flagged.
 *     tags: [Chats]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text]
 *             properties:
 *               text: { type: string, maxLength: 2000 }
 *               doctorId: { type: string }
 *               chatId: { type: string }
 *     responses:
 *       201: { description: Sent }
 *       403: { description: Can't write to this doctor now }
 *       422: { description: Contact details or validation failed }
 * /chats:
 *   get:
 *     summary: Chat Monitoring list (staff)
 *     tags: [Chats]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: type, schema: { type: string, enum: [free, consultation, follow_up] } }
 *       - { in: query, name: waiting, schema: { type: string, enum: [doctor, patient] } }
 *       - { in: query, name: doctorId, schema: { type: string } }
 *       - { in: query, name: flagged, schema: { type: string, enum: ["true", "false"] } }
 *       - { in: query, name: search, schema: { type: string } }
 *     responses:
 *       200: { description: chats, pagination, stats, doctors }
 * /chats/{id}/staff:
 *   get:
 *     summary: One chat with all messages, read only (staff)
 *     tags: [Chats]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: chat, messages, type, consultation }
 */
router.get("/mine", ...app, listMyChats);
router.get("/doctor/:doctorId", protect, authorize("patient"), doctorIdRules, validate, getChatWithDoctor);
router.post("/messages", ...app, sendMessageRules, validate, sendMessage);
router.get("/", ...canView, listChatsRules, validate, listChats);
router.get("/:id/staff", ...canView, chatIdRules, validate, getChatForStaff);
router.get("/:id", protect, authorize("doctor"), chatIdRules, validate, getChatForDoctor);

export default router;
