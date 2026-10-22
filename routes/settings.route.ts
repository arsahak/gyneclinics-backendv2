import { Router } from "express";
import { getFeeSettings, getPayoutRun, getPricing, runPayoutsNow, saveFeeSettings } from "../controllers/settings.controller";
import { protect } from "../middleware/auth";
import { requireAccess } from "../utils/permissions";
import { validate } from "../middleware/validate";
import { saveFeesRules } from "../validators/settings.validator";

// Mounted at /api/v1/settings.
//   GET  /pricing              public: each region's currency and price (share of the UK fee)
//   GET  /fees                 admin, super admin: commission, region prices, withdrawals, per-doctor rates, history
//   PUT  /fees                 super admin: save them (new bookings use them; past bookings keep their rate)
//   GET  /fees/payouts         admin, super admin: next weekly run, last run, who'd be paid now
//   POST /fees/payouts/run     super admin: pay everyone who can be paid now (Stripe)
const router = Router();

/**
 * @swagger
 * /settings/pricing:
 *   get:
 *     summary: Price per region (public)
 *     description: Each region pays `multiplier` × the doctor's UK fee, in `currency` (USD uses gbpToUsd). Whole numbers, minimum 1.
 *     tags: [Settings]
 *     responses:
 *       200: { description: "data: { gbpToUsd, regions: [{ id, name, currency, multiplier }] }" }
 * /settings/fees:
 *   get:
 *     summary: Fees & Commission (admin, super admin)
 *     tags: [Settings]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "commissionRate, minWithdrawalGBP, payoutSchedule, regions, gbpToUsd, sessionHours, followUpDays, stripe, payouts (nextRunAt, lastRun, preview), overrides, doctors, history" }
 *   put:
 *     summary: Save Fees & Commission (super admin)
 *     description: Rates are fractions (0.2 = 20%). `overrides` is the full list; doctors left out use the standard rate.
 *     tags: [Settings]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [commissionRate, minWithdrawalGBP, payoutSchedule, overrides]
 *             properties:
 *               commissionRate: { type: number, minimum: 0, maximum: 0.5 }
 *               minWithdrawalGBP: { type: number }
 *               payoutSchedule: { type: string, enum: [on_request, weekly] }
 *               regionMultipliers:
 *                 type: object
 *                 description: "Optional. Share of the UK fee per region, 0.05–3, e.g. { south_asia: 0.3 }"
 *                 additionalProperties: { type: number }
 *               overrides:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     doctorId: { type: string }
 *                     rate: { type: number }
 *                     note: { type: string }
 *     responses:
 *       200: { description: "Saved. data includes `changes` (what changed, in words; also added to the history)" }
 * /settings/fees/payouts:
 *   get:
 *     summary: Payout run preview (admin, super admin)
 *     description: Next weekly run (Fridays 9:00 UK time, when the schedule is weekly), the last run, and who would be paid now.
 *     tags: [Settings]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "data: { nextRunAt, lastRun, preview: { lines, totalGBP, readyGBP } }" }
 * /settings/fees/payouts/run:
 *   post:
 *     summary: Pay everyone who can be paid now, with Stripe (super admin)
 *     description: Sends every open request; with the weekly schedule also each doctor's available balance (at least the minimum). Doctors whose Stripe isn't ready are skipped.
 *     tags: [Settings]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "data: { result: { sent, skipped, sentGBP }, nextRunAt, lastRun, preview }" }
 *       409: { description: A run is already going }
 */
router.get("/pricing", getPricing);
router.get("/fees", protect, requireAccess("fees", "view"), getFeeSettings);
router.put("/fees", protect, requireAccess("fees", "manage"), saveFeesRules, validate, saveFeeSettings);
router.get("/fees/payouts", protect, requireAccess("fees", "view"), getPayoutRun);
router.post("/fees/payouts/run", protect, requireAccess("payouts", "manage"), runPayoutsNow);

export default router;
