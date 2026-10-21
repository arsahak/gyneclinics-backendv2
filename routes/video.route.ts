import { Router } from "express";
import { joinTestCall } from "../controllers/video.controller";
import { authorize, protect } from "../middleware/auth";

// Mounted at /api/v1/video.
//   POST /test-call   doctor or patient: token for the shared 30-minute test room
const router = Router();

/**
 * @swagger
 * /video/test-call:
 *   post:
 *     summary: Join the shared test video call (doctor or patient)
 *     description: "Returns a Twilio Video token for one shared test room. Each person can stay up to 30 minutes; the room holds 2 people."
 *     tags: [Video]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "data: { token, roomName, roomSid, identity, maxMinutes }"
 *       502:
 *         description: Twilio couldn't open the room
 */
router.post("/test-call", protect, authorize("doctor", "patient"), joinTestCall);

export default router;
