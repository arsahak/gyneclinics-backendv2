import { Router } from "express";
import { getOverview } from "../controllers/dashboard.controller";
import { protect } from "../middleware/auth";
import { requireAccess } from "../utils/permissions";

// Mounted at /api/v1/dashboard.
//   GET /overview   any staff: the dashboard home (each part only if the role can see that area)
const router = Router();

const anyStaffArea = ["patients", "doctors", "consultations", "reviews", "reports", "chat_moderation", "chat_monitoring", "payments", "payouts", "content", "stories", "ads", "notifications", "chatbot", "analytics", "fees", "team"];

/**
 * @swagger
 * /dashboard/overview:
 *   get:
 *     summary: Dashboard home numbers (staff)
 *     description: >
 *       Live numbers for the dashboard home. Each part is included only if your role can see
 *       that area in Team & Roles, otherwise it is null: payments (this month, last month,
 *       30 days, recent), payouts (where doctors' money is, open requests, top doctors),
 *       patients, doctors, stories, reports, flags (chat moderation), reviews, consultations.
 *       Money is in GBP (USD at the fixed rate); months and days are UK time.
 *     tags: [Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "data: { now, payments, payouts, patients, doctors, stories, reports, flags, reviews, consultations }" }
 *       403: { description: Not staff }
 */
router.get("/overview", protect, requireAccess(anyStaffArea, "view"), getOverview);

export default router;
