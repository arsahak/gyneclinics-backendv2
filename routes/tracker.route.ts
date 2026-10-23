import { Router } from "express";
import {
  addBabyGrowth,
  addPeriod,
  addWeight,
  clearTracker,
  deleteBabyGrowth,
  deletePeriod,
  deleteWeight,
  getTracker,
  updatePeriod,
} from "../controllers/tracker.controller";
import { authorize, protect } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { babyGrowthRules, entryIdRules, periodRules, weightRules } from "../validators/tracker.validator";

// Mounted at /api/v1/tracker. The signed-in patient's own health logs.
//   GET    /                 periods, weights, baby growth and reminder settings
//   DELETE /                 delete every log entry
//   POST   /periods          log a period; PATCH / DELETE /periods/:id
//   POST   /weights          log a weight; DELETE /weights/:id
//   POST   /baby             log a scan;   DELETE /baby/:id
const router = Router();
router.use(protect, authorize("patient"));

/**
 * @swagger
 * tags:
 *   name: Tracker
 *   description: The patient's own period, weight and baby growth logs
 * components:
 *   schemas:
 *     PeriodEntry:
 *       type: object
 *       required: [start]
 *       properties:
 *         _id: { type: string, readOnly: true }
 *         start: { type: string, example: "2026-10-08" }
 *         end: { type: string, example: "2026-10-12", description: Empty while the period is ongoing }
 *         flow: { type: string, enum: [light, medium, heavy] }
 *         symptoms: { type: array, items: { type: string }, example: [Cramps, Fatigue] }
 *         note: { type: string }
 *     WeightEntry:
 *       type: object
 *       required: [date, kg]
 *       properties:
 *         _id: { type: string, readOnly: true }
 *         date: { type: string, example: "2026-10-20" }
 *         kg: { type: number, example: 61.5 }
 *     BabyGrowthEntry:
 *       type: object
 *       required: [date, week, weightG, lengthCm]
 *       properties:
 *         _id: { type: string, readOnly: true }
 *         date: { type: string, example: "2026-10-20" }
 *         week: { type: integer, example: 28 }
 *         weightG: { type: number, example: 1150 }
 *         lengthCm: { type: number, example: 37.6 }
 * /tracker:
 *   get:
 *     summary: The patient's health logs
 *     description: >
 *       Newest first. On the first call, the last period and weight from onboarding
 *       become the first entries. Changing logs keeps the profile's last period start
 *       and weight up to date.
 *     tags: [Tracker]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "data: { periods: PeriodEntry[], weights: WeightEntry[], babyGrowth: BabyGrowthEntry[], reminders }" }
 *       404: { description: Profile not set up yet }
 *   delete:
 *     summary: Delete every log entry
 *     tags: [Tracker]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Deleted }
 * /tracker/periods:
 *   post:
 *     summary: Log a period
 *     tags: [Tracker]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PeriodEntry' }
 *     responses:
 *       201: { description: "data: PeriodEntry" }
 *       409: { description: A period already starts that day }
 * /tracker/periods/{id}:
 *   patch:
 *     summary: Replace a period entry
 *     description: Send the whole entry; empty fields are removed.
 *     tags: [Tracker]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PeriodEntry' }
 *     responses:
 *       200: { description: "data: PeriodEntry" }
 *       404: { description: Not found }
 *   delete:
 *     summary: Delete a period entry
 *     tags: [Tracker]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Deleted }
 * /tracker/weights:
 *   post:
 *     summary: Log a weight
 *     tags: [Tracker]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/WeightEntry' }
 *     responses:
 *       201: { description: "data: WeightEntry" }
 * /tracker/weights/{id}:
 *   delete:
 *     summary: Delete a weight entry
 *     tags: [Tracker]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Deleted }
 * /tracker/baby:
 *   post:
 *     summary: Log baby growth from a scan report
 *     tags: [Tracker]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/BabyGrowthEntry' }
 *     responses:
 *       201: { description: "data: BabyGrowthEntry" }
 * /tracker/baby/{id}:
 *   delete:
 *     summary: Delete a scan entry
 *     tags: [Tracker]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Deleted }
 */
router.get("/", getTracker);
router.delete("/", clearTracker);
router.post("/periods", periodRules, validate, addPeriod);
router.patch("/periods/:id", entryIdRules, periodRules, validate, updatePeriod);
router.delete("/periods/:id", entryIdRules, validate, deletePeriod);
router.post("/weights", weightRules, validate, addWeight);
router.delete("/weights/:id", entryIdRules, validate, deleteWeight);
router.post("/baby", babyGrowthRules, validate, addBabyGrowth);
router.delete("/baby/:id", entryIdRules, validate, deleteBabyGrowth);

export default router;
