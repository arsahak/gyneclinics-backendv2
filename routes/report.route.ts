import { Router } from "express";
import { closeReport, createReport, listMyReports, listReports, takeReport } from "../controllers/report.controller";
import { authorize, protect } from "../middleware/auth";
import { requireAccess } from "../utils/permissions";
import { validate } from "../middleware/validate";
import { closeReportRules, createReportRules, listReportsRules, reportIdRules } from "../validators/report.validator";

// Mounted at /api/v1/reports.
//   POST   /             patient: report a doctor; doctor: report a patient
//   GET    /mine         reporter: own reports and what the team did
//   GET    /             staff: list (todo/status, priority, reason, search, page) with stats
//   PATCH  /:id/take     staff: "I'll handle it"
//   PATCH  /:id/close    staff: resolve (action + note for the reporter) or dismiss
const router = Router();
const canView = [protect, requireAccess("reports", "view")];
const canManage = [protect, requireAccess("reports", "manage")];

/**
 * @swagger
 * /reports:
 *   post:
 *     summary: Report a problem with a doctor (patient) or a patient (doctor)
 *     description: >
 *       Priority comes from the reason: unsafe medical advice and fake doctor
 *       details are urgent. The latest consultation between the two is attached.
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason, details]
 *             properties:
 *               reason: { type: string, enum: [medical_concern, off_platform, no_reply, behaviour, payment, fake_profile, other] }
 *               details: { type: string, minLength: 10, maxLength: 1000 }
 *               doctorId: { type: string, description: Doctor profile id (patients) }
 *               patientId: { type: string, description: Patient user id (doctors) }
 *               consultationId: { type: string }
 *     responses:
 *       201: { description: Report saved }
 *       409: { description: Same open report already sent }
 *   get:
 *     summary: List reports (staff)
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [todo, all, open, in_review, resolved, dismissed] }, description: "todo = open and in review, urgent first (default)" }
 *       - { in: query, name: priority, schema: { type: string, enum: [urgent, high, normal] } }
 *       - { in: query, name: reason, schema: { type: string } }
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *     responses:
 *       200: { description: reports, pagination, stats }
 */
router.post("/", protect, authorize("patient", "doctor"), createReportRules, validate, createReport);
router.get("/", ...canView, listReportsRules, validate, listReports);

/**
 * @swagger
 * /reports/mine:
 *   get:
 *     summary: Your own reports and what the team did
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Reports, newest first }
 */
router.get("/mine", protect, authorize("patient", "doctor"), listMyReports);

/**
 * @swagger
 * /reports/{id}/take:
 *   patch:
 *     summary: Take a report (staff) — in review, assigned to you
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Assigned }
 * /reports/{id}/close:
 *   patch:
 *     summary: Resolve or dismiss a report (staff)
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [outcome]
 *             properties:
 *               outcome: { type: string, enum: [resolved, dismissed] }
 *               action: { type: string, enum: [warned, suspended, refunded, content_removed] }
 *               note: { type: string, description: Shown to the reporter; required when resolved }
 *     responses:
 *       200: { description: Closed }
 */
router.patch("/:id/take", ...canManage, reportIdRules, validate, takeReport);
router.patch("/:id/close", ...canManage, closeReportRules, validate, closeReport);

export default router;
