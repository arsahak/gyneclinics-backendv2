import { Router } from "express";
import { confirmCheckout, startCheckout } from "../controllers/checkout.controller";
import { createConsultation, listConsultations, listMyConsultations } from "../controllers/consultation.controller";
import { authorize, protect } from "../middleware/auth";
import { requireAccess } from "../utils/permissions";
import { validate } from "../middleware/validate";
import { confirmCheckoutRules, createConsultationRules, listConsultationsRules, startCheckoutRules } from "../validators/consultation.validator";

// Mounted at /api/v1/consultations.
//   POST /checkout              patient: price + Stripe PaymentIntent for a paid booking
//   POST /checkout/:id/confirm  patient: Stripe says it's paid → save the booking, text a confirmation
//   POST /                      patient: a free booking (fee 0)
//   GET  /mine                  patient or doctor: your own consultations
//   GET  /                      staff: list (stage, mode, doctor, search, sort, page) with a count per stage
const router = Router();
const patient = [protect, authorize("patient")];

/**
 * @swagger
 * components:
 *   schemas:
 *     BookingRequest:
 *       type: object
 *       required: [doctorId, mode, concern, startsAt, regionId]
 *       properties:
 *         doctorId: { type: string }
 *         mode: { type: string, enum: [instant, scheduled] }
 *         concern: { type: string }
 *         startsAt: { type: string, format: date-time }
 *         timezone: { type: string, example: Asia/Dhaka }
 *         regionId: { type: string, enum: [europe, north_america, middle_east, asia_pacific, latin_america, africa, south_asia] }
 * /consultations/checkout:
 *   post:
 *     summary: Start paying for a booking (Stripe)
 *     description: >
 *       The price comes from the doctor's fee and the region, never from the app.
 *       Returns a Stripe PaymentIntent client secret and the publishable key for Stripe's card form.
 *     tags: [Consultations]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/BookingRequest' }
 *     responses:
 *       201: { description: "data: { paymentIntentId, clientSecret, publishableKey, mode: test | live, reference, amount, currency }" }
 *       404: { description: Doctor not available }
 *       409: { description: The consultation is free (use POST /consultations) }
 * /consultations/checkout/{paymentIntentId}/confirm:
 *   post:
 *     summary: Save the booking once Stripe has the payment
 *     description: Safe to call more than once; the Stripe webhook does the same.
 *     tags: [Consultations]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: paymentIntentId, required: true, schema: { type: string } }
 *     responses:
 *       201: { description: "Booked. data: { consultation, sms: { status, to } }" }
 *       200: { description: Already booked (returned as is) }
 *       202: { description: The payment is still processing }
 *       402: { description: Not paid }
 * /consultations:
 *   post:
 *     summary: Book a free consultation (fee 0) and text the patient a confirmation
 *     description: Paid consultations use /consultations/checkout instead. A failed SMS doesn't undo the booking.
 *     tags: [Consultations]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/BookingRequest'
 *               - type: object
 *                 properties:
 *                   reference: { type: string, example: GC-4K7Q2M }
 *     responses:
 *       201:
 *         description: "data: { consultation: Consultation, sms: { status: sent | failed | skipped, to } }"
 *       402:
 *         description: The consultation isn't free
 *       404:
 *         description: Doctor not available
 */
router.post("/checkout", ...patient, startCheckoutRules, validate, startCheckout);
router.post("/checkout/:paymentIntentId/confirm", ...patient, confirmCheckoutRules, validate, confirmCheckout);
router.post("/", ...patient, createConsultationRules, validate, createConsultation);

/**
 * @swagger
 * /consultations/mine:
 *   get:
 *     summary: Your own consultations (patient or doctor)
 *     description: >
 *       Newest start first, up to 300. Each has its `stage` (upcoming, live, follow_up,
 *       completed, cancelled, refunded), the payment the patient made, and the doctor
 *       (for a doctor, also the patient).
 *     tags: [Consultations]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: "data: [{ reference, mode, concern, startsAt, status, stage, bookedAt, completedAt, refundedAt, payment, doctor: { _id, title, specialization, fullName, avatar }, patient? }]"
 */
router.get("/mine", protect, authorize("patient", "doctor"), listMyConsultations);

/**
 * @swagger
 * /consultations:
 *   get:
 *     summary: List consultations (staff)
 *     description: >
 *       Every booking with the patient and the doctor. Each item has a `stage`
 *       worked out from its status and start time: upcoming, live (the 24h chat),
 *       follow_up (the 7 days after), completed, cancelled or refunded.
 *     tags: [Consultations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: stage, schema: { type: string, enum: [all, upcoming, live, follow_up, completed, cancelled, refunded] } }
 *       - { in: query, name: mode, schema: { type: string, enum: [instant, scheduled] } }
 *       - { in: query, name: doctorId, schema: { type: string } }
 *       - { in: query, name: search, schema: { type: string }, description: Reference, concern, patient or doctor name/phone }
 *       - { in: query, name: sort, schema: { type: string, enum: [newest, oldest, starts_soon, starts_latest] } }
 *       - { in: query, name: page, schema: { type: integer, minimum: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100 } }
 *     responses:
 *       200:
 *         description: consultations, pagination, stats (count per stage) and doctors (who have bookings)
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not staff
 *       422:
 *         description: Validation failed
 */
router.get("/", protect, requireAccess("consultations", "view"), listConsultationsRules, validate, listConsultations);

export default router;
