import { Router } from "express";
import {
  getMyPayouts,
  listBalances,
  listWithdrawals,
  rejectWithdrawal,
  requestWithdrawal,
  sendWithdrawal,
  stripeLink,
} from "../controllers/payout.controller";
import { authorize, protect } from "../middleware/auth";
import { requireAccess } from "../utils/permissions";
import { validate } from "../middleware/validate";
import { listWithdrawalsRules, rejectRules, stripeLinkRules, withdrawalIdRules, withdrawRules } from "../validators/payout.validator";

// Mounted at /api/v1/payouts. Doctors are paid with Stripe Connect.
//   GET   /me              doctor: earnings (clearing / available / paid out), Stripe status, withdrawals
//   POST  /me/stripe       doctor: link to Stripe's sign-up form, or their Stripe dashboard once set up
//   POST  /me/withdraw     doctor: ask for cleared money (Stripe ready, min from settings, one open request)
//   GET   /                admin, super admin: withdrawals (todo by default) with stats
//   GET   /balances        admin, super admin: every doctor's balance and Stripe status
//   PATCH /:id/send        super admin: send it with a Stripe transfer
//   PATCH /:id/reject      super admin: not paid, with a reason
const router = Router();
const doctor = [protect, authorize("doctor")];
const view = [protect, requireAccess("payouts", "view")];
const manage = [protect, requireAccess("payouts", "manage")];

/**
 * @swagger
 * /payouts/me:
 *   get:
 *     summary: Your earnings and withdrawals (doctor)
 *     tags: [Payouts]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: balance, minWithdrawalGBP, payoutSchedule, stripe (status, destination), withdrawals }
 * /payouts/me/stripe:
 *   post:
 *     summary: Open Stripe (doctor)
 *     description: Stripe's sign-up form while the account isn't finished (the account is made on first use), or the doctor's Stripe Express dashboard to change their bank or card.
 *     tags: [Payouts]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [returnUrl]
 *             properties:
 *               returnUrl: { type: string, example: "https://app.gyneclinics.com/doctor/earnings" }
 *     responses:
 *       200: { description: "data: { url, kind: onboarding | dashboard }" }
 * /payouts/me/withdraw:
 *   post:
 *     summary: Ask to withdraw cleared earnings (doctor)
 *     tags: [Payouts]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amountGBP]
 *             properties:
 *               amountGBP: { type: number }
 *     responses:
 *       201: { description: Requested }
 *       409: { description: Another request is still open }
 *       422: { description: Stripe not set up, below the minimum, or more than available }
 * /payouts:
 *   get:
 *     summary: Withdrawal requests (admin, super admin)
 *     tags: [Payouts]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [todo, all, requested, paid, rejected] } }
 *       - { in: query, name: search, schema: { type: string } }
 *     responses:
 *       200: { description: withdrawals (with each doctor's Stripe status), pagination, stats (incl. our Stripe balance) }
 * /payouts/balances:
 *   get:
 *     summary: Every doctor's balance (admin, super admin)
 *     tags: [Payouts]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Rows of doctor, Stripe status and balance }
 * /payouts/{id}/send:
 *   patch:
 *     summary: Send the withdrawal with a Stripe transfer (super admin)
 *     tags: [Payouts]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Sent (status paid, transferRef = Stripe transfer id) }
 *       409: { description: Already closed, doctor's Stripe not ready, or our Stripe balance is too low }
 * /payouts/{id}/reject:
 *   patch:
 *     summary: Reject, with a reason the doctor sees (super admin)
 *     tags: [Payouts]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Updated }
 */
router.get("/me", ...doctor, getMyPayouts);
router.post("/me/stripe", ...doctor, stripeLinkRules, validate, stripeLink);
router.post("/me/withdraw", ...doctor, withdrawRules, validate, requestWithdrawal);
router.get("/", ...view, listWithdrawalsRules, validate, listWithdrawals);
router.get("/balances", ...view, listBalances);
router.patch("/:id/send", ...manage, withdrawalIdRules, validate, sendWithdrawal);
router.patch("/:id/reject", ...manage, rejectRules, validate, rejectWithdrawal);

export default router;
