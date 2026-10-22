import { Router } from "express";
import { listPayments, refundPayment } from "../controllers/payment.controller";
import { protect } from "../middleware/auth";
import { requireAccess } from "../utils/permissions";
import { validate } from "../middleware/validate";
import { listPaymentsRules, refundPaymentRules } from "../validators/payment.validator";

// Mounted at /api/v1/payments. A payment is a paid consultation.
//   GET   /             admin, super admin: list (status, doctor, method, search, page) with totals in GBP
//   PATCH /:id/refund   super admin: record a refund (only while it is still clearing)
const router = Router();

/**
 * @swagger
 * /payments:
 *   get:
 *     summary: List payments (admin, super admin)
 *     description: >
 *       Paid consultations with the money split (20% commission) and when the
 *       doctor's share clears (when the 7-day follow-up ends). Stats are in GBP;
 *       USD is converted at the app's fixed rate.
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [all, clearing, cleared, refunded] } }
 *       - { in: query, name: doctorId, schema: { type: string } }
 *       - { in: query, name: method, schema: { type: string, enum: [card, local, wallet] } }
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *     responses:
 *       200: { description: payments, pagination, stats, doctors }
 * /payments/{id}/refund:
 *   patch:
 *     summary: Record a refund (super admin)
 *     description: Only while the payment is clearing. Send the money back in the payment provider first.
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string }
 *     responses:
 *       200: { description: Recorded }
 *       409: { description: Already refunded, or already cleared }
 */
router.get("/", protect, requireAccess("payments", "view"), listPaymentsRules, validate, listPayments);
router.patch("/:id/refund", protect, requireAccess("payments", "manage"), refundPaymentRules, validate, refundPayment);

export default router;
