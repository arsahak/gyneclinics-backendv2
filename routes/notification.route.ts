import { Router } from "express";
import { listAutoMessages, listMyNotifications, markAllRead, markRead, notificationTicket, setAutoMessage } from "../controllers/notification.controller";
import { authorize, protect } from "../middleware/auth";
import { requireAccess } from "../utils/permissions";
import { validate } from "../middleware/validate";
import { autoMessageRules, idRules, myNotificationsRules } from "../validators/notification.validator";

// Mounted at /api/v1/notifications.
//   GET   /mine         patient or doctor: your inbox and unread count
//   PATCH /read-all     patient or doctor: mark everything read
//   PATCH /:id/read     patient or doctor: mark one read
//   GET   /auto         admin, super admin: automatic messages with on/off and this week's count
//   PATCH /auto/:key    admin, super admin: switch one on or off
const router = Router();
const app = [protect, authorize("patient", "doctor")];
const canView = [protect, requireAccess("notifications", "view")];
const canManage = [protect, requireAccess("notifications", "manage")];

/**
 * @swagger
 * /notifications/mine:
 *   get:
 *     summary: Your notifications (patient or doctor)
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: notifications, unread }
 * /notifications/read-all:
 *   patch:
 *     summary: Mark all your notifications read
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Done }
 * /notifications/{id}/read:
 *   patch:
 *     summary: Mark one notification read
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Done }
 * /notifications/auto:
 *   get:
 *     summary: Automatic messages (admin, super admin)
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Each message with state (live/planned), enabled and sent7d }
 * /notifications/auto/{key}:
 *   patch:
 *     summary: Switch an automatic message on or off
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled: { type: boolean }
 *     responses:
 *       200: { description: Updated }
 */
router.get("/mine", ...app, myNotificationsRules, validate, listMyNotifications);
router.patch("/read-all", ...app, markAllRead);
/**
 * @swagger
 * /notifications/ticket:
 *   post:
 *     summary: Ticket for live notifications (patient, doctor)
 *     description: Connect with io(API_URL, { path "/socket.io", auth { ticket } }) and listen for "notification:new" ({ notification, unread }) and "notification:unread" ({ unread }). Valid 15 minutes for connecting.
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "data: { ticket, path }" }
 */
router.post("/ticket", ...app, notificationTicket);
router.patch("/:id/read", ...app, idRules, validate, markRead);
router.get("/auto", ...canView, listAutoMessages);
router.patch("/auto/:key", ...canManage, autoMessageRules, validate, setAutoMessage);

export default router;
