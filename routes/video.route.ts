import { Router } from "express";
import { joinConsultationCall, joinTestCall } from "../controllers/video.controller";
import { authorize, protect } from "../middleware/auth";

// Mounted at /api/v1/video.
//   POST /test-call                      doctor or patient: a private room to check camera and mic
//   POST /consultations/:reference       the consultation's patient or doctor: token for its call
const router = Router();

/**
 * @swagger
 * /video/test-call:
 *   post:
 *     summary: Check your camera and microphone (doctor or patient)
 *     description: "Returns a Twilio Video token for a private room only you can join. Up to 10 minutes."
 *     tags: [Video]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "data: { token, roomName, identity, maxMinutes }"
 *       502:
 *         description: Twilio couldn't open the room
 */
router.post("/test-call", protect, authorize("doctor", "patient"), joinTestCall);

/**
 * @swagger
 * /video/consultations/{reference}:
 *   post:
 *     summary: Join a consultation's video call (its patient or doctor)
 *     description: >
 *       One room per consultation, for its patient and its doctor only. Opens 10 minutes
 *       before the start and closes when the session ends (24 hours after the start, or
 *       when the doctor closes the consultation). Each person can stay 60 minutes per join.
 *     tags: [Video]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: reference, required: true, schema: { type: string, example: GC-4K7Q2M } }
 *     responses:
 *       200:
 *         description: "data: { token, roomName, identity, maxMinutes }"
 *       404:
 *         description: No such consultation, or it isn't yours
 *       409:
 *         description: The call isn't open (too early, ended, or cancelled)
 *       502:
 *         description: Twilio couldn't open the room
 */
router.post("/consultations/:reference", protect, authorize("doctor", "patient"), joinConsultationCall);

export default router;
