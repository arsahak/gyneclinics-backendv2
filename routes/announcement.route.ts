import { Router } from "express";
import { cancelAnnouncement, createAnnouncement, deleteAnnouncement, getAudience, listAnnouncements } from "../controllers/announcement.controller";
import { protect } from "../middleware/auth";
import { requireAccess } from "../utils/permissions";
import { validate } from "../middleware/validate";
import { createAnnouncementRules, idRules, listAnnouncementsRules } from "../validators/notification.validator";

// Mounted at /api/v1/announcements. Admin and super admin.
//   GET    /            list with 30-day stats and open rates (sends due scheduled ones first)
//   GET    /audience    people each audience reaches, per region
//   POST   /            send now, schedule, or save a draft
//   POST   /:id/cancel  cancel a scheduled one
//   DELETE /:id         delete a draft or a cancelled one
const router = Router();
const canView = [protect, requireAccess("notifications", "view")];
const canManage = [protect, requireAccess("notifications", "manage")];

/**
 * @swagger
 * /announcements:
 *   get:
 *     summary: Announcements (admin, super admin)
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [all, draft, scheduled, sent, cancelled] } }
 *     responses:
 *       200: { description: announcements (with openRate), pagination, stats }
 *   post:
 *     summary: Send, schedule or save an announcement (admin, super admin)
 *     description: Goes to each person's in-app inbox. Push isn't connected yet and SMS is paused, so only in-app is delivered today.
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action, title, audience, channels]
 *             properties:
 *               action: { type: string, enum: [send, schedule, draft] }
 *               title: { type: string, maxLength: 60 }
 *               body: { type: string, maxLength: 240 }
 *               audience: { type: string, enum: [all, patients, doctors] }
 *               region: { type: string, enum: [europe, north_america, middle_east, asia_pacific, latin_america, africa, south_asia] }
 *               channels: { type: array, items: { type: string, enum: [in_app, push, sms] } }
 *               link: { type: string, enum: [home, doctors, learn, share_story, cycle, consultations, messages, earnings] }
 *               scheduledAt: { type: string, format: date-time }
 *               fromDraft: { type: string }
 *     responses:
 *       201: { description: Created }
 * /announcements/audience:
 *   get:
 *     summary: How many people each audience reaches, per region
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: patients, doctors, regions }
 * /announcements/{id}/cancel:
 *   post:
 *     summary: Cancel a scheduled announcement
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Cancelled }
 */
router.get("/", ...canView, listAnnouncementsRules, validate, listAnnouncements);
router.get("/audience", ...canView, getAudience);
router.post("/", ...canManage, createAnnouncementRules, validate, createAnnouncement);
router.post("/:id/cancel", ...canManage, idRules, validate, cancelAnnouncement);
router.delete("/:id", ...canManage, idRules, validate, deleteAnnouncement);

export default router;
