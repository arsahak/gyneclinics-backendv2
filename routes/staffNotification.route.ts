import { Router } from "express";
import { param, query, body } from "express-validator";
import { listMine, readAll, realtimeTicket, setRead } from "../controllers/staffNotification.controller";
import { protect } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { requireAccess } from "../utils/permissions";

// Mounted at /api/v1/staff-notifications. Every staff member's own dashboard bell.
//   GET   /             your notifications (filter=all|unread), with the unread count
//   PATCH /read-all     mark everything read
//   PATCH /:id          { read: true | false }
//   POST  /ticket       short ticket for the live socket (event "staff:notification", "staff:unread")
const router = Router();

const AREAS = ["patients", "doctors", "consultations", "reviews", "reports", "chat_moderation", "chat_monitoring", "payments", "payouts", "content", "stories", "ads", "notifications", "chatbot", "analytics", "fees", "team"];
const staff = [protect, requireAccess(AREAS, "view")];

/**
 * @swagger
 * /staff-notifications:
 *   get:
 *     summary: Your dashboard notifications (staff)
 *     description: >
 *       Things the team may need to act on: new patients and doctors, bookings, refunds, withdrawal
 *       requests, reports, flagged chat messages, stories and held reviews. Each staff member only
 *       gets the ones their role can see (Team & Roles), each with its own read state. Kept 90 days.
 *     tags: [Staff notifications]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: filter, schema: { type: string, enum: [all, unread] } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer, maximum: 50 } }
 *     responses:
 *       200: { description: "data: { notifications: [{ _id, type, title, body, link, priority, readAt, createdAt }], unread, pagination }" }
 * /staff-notifications/read-all:
 *   patch:
 *     summary: Mark all your notifications read
 *     tags: [Staff notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Done }
 * /staff-notifications/{id}:
 *   patch:
 *     summary: Mark one read or unread
 *     tags: [Staff notifications]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { read: { type: boolean } } }
 *     responses:
 *       200: { description: "data: { notification, unread }" }
 * /staff-notifications/ticket:
 *   post:
 *     summary: Ticket for live notifications (socket.io)
 *     description: Connect with io(API_URL, { path "/socket.io", auth { ticket } }) and listen for "staff:notification" ({ notification, unread }) and "staff:unread" ({ unread }). Valid 15 minutes for connecting.
 *     tags: [Staff notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "data: { ticket, path, event }" }
 */
router.get(
  "/",
  ...staff,
  [
    query("filter").optional().isIn(["all", "unread"]).withMessage("filter must be all or unread"),
    query("page").optional().isInt({ min: 1 }).toInt(),
    query("limit").optional().isInt({ min: 1, max: 50 }).toInt(),
  ],
  validate,
  listMine
);
router.patch("/read-all", ...staff, readAll);
router.post("/ticket", ...staff, realtimeTicket);
router.patch("/:id", ...staff, [param("id").isMongoId().withMessage("Invalid id"), body("read").optional().isBoolean().toBoolean()], validate, setRead);

export default router;
