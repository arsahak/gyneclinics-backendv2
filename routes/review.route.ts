import { Router } from "express";
import { createReview, deleteReview, listDoctorReviews, listReviews, setReviewStatus } from "../controllers/review.controller";
import { authorize, protect } from "../middleware/auth";
import { requireAccess } from "../utils/permissions";
import { validate } from "../middleware/validate";
import { createReviewRules, doctorReviewsRules, listReviewsRules, reviewIdRules, reviewStatusRules } from "../validators/review.validator";

// Mounted at /api/v1/reviews.
//   POST   /                    patient: review a doctor after a consultation with them (once)
//   GET    /doctor/:doctorId    signed-in users: a doctor's published reviews (+ your own)
//   GET    /                    staff: list (status, doctor, rating, search, page) with stats
//   PATCH  /:id/status          staff: publish / hold / hide (reason)
//   DELETE /:id                 staff: delete
const router = Router();
const canView = [protect, requireAccess("reviews", "view")];
const canManage = [protect, requireAccess("reviews", "manage")];

/**
 * @swagger
 * /reviews:
 *   post:
 *     summary: Review a doctor (patient)
 *     description: >
 *       Only after a consultation with that doctor has started, once per doctor.
 *       Contact details are refused. 1 and 2 star reviews are held for a team check.
 *     tags: [Reviews]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [doctorId, rating, text]
 *             properties:
 *               doctorId: { type: string }
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               text: { type: string, minLength: 10, maxLength: 1000 }
 *     responses:
 *       201: { description: Saved (published or held) }
 *       403: { description: No consultation with this doctor yet }
 *       409: { description: Already reviewed this doctor }
 *       422: { description: Validation failed or contact details in the text }
 *   get:
 *     summary: List reviews (staff)
 *     tags: [Reviews]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [all, published, held, hidden] } }
 *       - { in: query, name: doctorId, schema: { type: string } }
 *       - { in: query, name: rating, schema: { type: integer, minimum: 1, maximum: 5 } }
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *     responses:
 *       200: { description: reviews, pagination, stats (counts, average, byRating) and doctors (average per doctor) }
 */
router.post("/", protect, authorize("patient"), createReviewRules, validate, createReview);
router.get("/", ...canView, listReviewsRules, validate, listReviews);

/**
 * @swagger
 * /reviews/doctor/{doctorId}:
 *   get:
 *     summary: A doctor's published reviews (signed-in users)
 *     description: Authors are shown as "Verified patient". `mine` is the caller's own review, even while held.
 *     tags: [Reviews]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: doctorId, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: reviews, mine, pagination }
 */
router.get("/doctor/:doctorId", protect, doctorReviewsRules, validate, listDoctorReviews);

/**
 * @swagger
 * /reviews/{id}/status:
 *   patch:
 *     summary: Publish, hold or hide a review (staff)
 *     tags: [Reviews]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [published, held, hidden] }
 *               reason: { type: string, description: Why it was hidden (staff only) }
 *     responses:
 *       200: { description: Updated; the doctor's rating is recalculated }
 * /reviews/{id}:
 *   delete:
 *     summary: Delete a review (staff)
 *     tags: [Reviews]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Deleted; the doctor's rating is recalculated }
 */
router.patch("/:id/status", ...canManage, reviewStatusRules, validate, setReviewStatus);
router.delete("/:id", ...canManage, reviewIdRules, validate, deleteReview);

export default router;
