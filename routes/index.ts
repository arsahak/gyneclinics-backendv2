import { Router } from "express";
import mongoose from "mongoose";
import authRoutes from "./auth.route";
import consultationRoutes from "./consultation.route";
import doctorRoutes from "./doctor.route";
import patientRoutes from "./patient.route";
import userRoutes from "./user.route";
import videoRoutes from "./video.route";

const router = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Check that the API and database are up
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API is running
 */
router.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "Gyneclinics API is running",
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/patients", patientRoutes);
router.use("/doctors", doctorRoutes);
router.use("/consultations", consultationRoutes);
router.use("/video", videoRoutes);

export default router;
