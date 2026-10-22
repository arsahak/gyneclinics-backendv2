import { Router } from "express";
import { createAd, deleteAd, getAd, listAds, serveAds, trackAd, updateAd } from "../controllers/advertisement.controller";
import { protect } from "../middleware/auth";
import { requireAccess } from "../utils/permissions";
import { validate } from "../middleware/validate";
import { adIdRules, createAdRules, listAdsRules, serveAdsRules, trackAdRules, updateAdRules } from "../validators/advertisement.validator";

// Mounted at /api/v1/advertisements.
//   GET    /serve        signed-in users: the ad for each slot (?slots=home,learn-feed)
//   POST   /:id/track    signed-in users: count a view or click { event: impression | click }
//   GET    /             admin: list (search, placement, status, sort, page, stats)
//   POST   /             admin: create
//   GET    /:id          admin: one ad
//   PATCH  /:id          admin: edit (only what changes)
//   DELETE /:id          admin: delete
const router = Router();
const canView = [protect, requireAccess("ads", "view")];
const canManage = [protect, requireAccess("ads", "manage")];

/**
 * @swagger
 * /advertisements/serve:
 *   get:
 *     summary: The ad to show in each slot (signed-in users)
 *     description: For each slot, the live ad with the highest priority. Slots without a live ad are null.
 *     tags: [Advertisements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: slots, schema: { type: string }, description: "Comma-separated, e.g. home,learn-feed. Default: all slots." }
 *     responses:
 *       200:
 *         description: "data: { [slot]: Advertisement | null }"
 * /advertisements/{id}/track:
 *   post:
 *     summary: Count a view or a click (signed-in users)
 *     tags: [Advertisements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [event]
 *             properties:
 *               event: { type: string, enum: [impression, click] }
 *     responses:
 *       200:
 *         description: Counted
 */
router.get("/serve", protect, serveAdsRules, validate, serveAds);
router.post("/:id/track", protect, trackAdRules, validate, trackAd);

/**
 * @swagger
 * /advertisements:
 *   get:
 *     summary: All ads (admin)
 *     tags: [Advertisements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [all, live, scheduled, paused, ended] } }
 *       - { in: query, name: placement, schema: { type: string, enum: [home, learn-feed, article-end, doctors-feed, doctor-dashboard] } }
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: sort, schema: { type: string, enum: [priority, newest, oldest, impressions, clicks] } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: "data: { ads, pagination, stats: { total, live, impressions, clicks } }"
 *   post:
 *     summary: Create an ad (admin)
 *     tags: [Advertisements]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Advertisement'
 *     responses:
 *       201:
 *         description: "data: Advertisement"
 * /advertisements/{id}:
 *   get:
 *     summary: One ad (admin)
 *     tags: [Advertisements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: "data: Advertisement"
 *   patch:
 *     summary: Edit an ad; send only what changes (admin)
 *     description: "priceGBP, startDate, endDate: null clears them. Dates are yyyy-MM-dd."
 *     tags: [Advertisements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: "data: Advertisement"
 *   delete:
 *     summary: Delete an ad (admin)
 *     tags: [Advertisements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Deleted
 */
router.get("/", ...canView, listAdsRules, validate, listAds);
router.post("/", ...canManage, createAdRules, validate, createAd);
router.get("/:id", ...canView, adIdRules, validate, getAd);
router.patch("/:id", ...canManage, updateAdRules, validate, updateAd);
router.delete("/:id", ...canManage, adIdRules, validate, deleteAd);

export default router;
