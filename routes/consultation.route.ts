import { Router } from "express";
import { createConsultation } from "../controllers/consultation.controller";
import { authorize, protect } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { createConsultationRules } from "../validators/consultation.validator";

// Mounted at /api/v1/consultations.
//   POST /   the patient's payment went through: save the booking, text a confirmation
const router = Router();

/**
 * @swagger
 * /consultations:
 *   post:
 *     summary: Save a paid booking and text the patient a confirmation
 *     description: Called once the patient's payment is confirmed. The SMS result is returned; a failed SMS doesn't undo the booking.
 *     tags: [Consultations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reference, doctorId, mode, concern, startsAt, payment]
 *             properties:
 *               reference: { type: string, example: GC-4K7Q2M }
 *               doctorId: { type: string }
 *               mode: { type: string, enum: [instant, scheduled] }
 *               concern: { type: string }
 *               startsAt: { type: string, format: date-time }
 *               timezone: { type: string, example: Asia/Dhaka }
 *               payment:
 *                 type: object
 *                 properties:
 *                   amount: { type: number }
 *                   currency: { type: string, example: USD }
 *                   regionId: { type: string }
 *                   method: { type: string }
 *                   reference: { type: string }
 *                   details: { type: string }
 *                   paidAt: { type: string, format: date-time }
 *     responses:
 *       201:
 *         description: "data: { consultation: Consultation, sms: { status: sent | failed | skipped, to } }"
 *       404:
 *         description: Doctor not available
 *       409:
 *         description: Doctor not taking consultations, or booking already saved
 */
router.post("/", protect, authorize("patient"), createConsultationRules, validate, createConsultation);

export default router;
