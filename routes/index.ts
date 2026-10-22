import { Router } from "express";
import mongoose from "mongoose";
import advertisementRoutes from "./advertisement.route";
import announcementRoutes from "./announcement.route";
import chatRoutes from "./chat.route";
import authRoutes from "./auth.route";
import consultationRoutes from "./consultation.route";
import contentRoutes from "./content.route";
import doctorRoutes from "./doctor.route";
import moderationRoutes from "./moderation.route";
import notificationRoutes from "./notification.route";
import patientRoutes from "./patient.route";
import paymentRoutes from "./payment.route";
import payoutRoutes from "./payout.route";
import reportRoutes from "./report.route";
import reviewRoutes from "./review.route";
import settingsRoutes from "./settings.route";
import dashboardRoutes from "./dashboard.route";
import staffNotificationRoutes from "./staffNotification.route";
import storyRoutes from "./story.route";
import uploadRoutes from "./upload.route";
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
router.use("/content", contentRoutes);
router.use("/uploads", uploadRoutes);
router.use("/advertisements", advertisementRoutes);
router.use("/stories", storyRoutes);
router.use("/reviews", reviewRoutes);
router.use("/reports", reportRoutes);
router.use("/chats", chatRoutes);
router.use("/moderation", moderationRoutes);
router.use("/payments", paymentRoutes);
router.use("/payouts", payoutRoutes);
router.use("/announcements", announcementRoutes);
router.use("/notifications", notificationRoutes);
router.use("/settings", settingsRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/staff-notifications", staffNotificationRoutes);

export default router;
