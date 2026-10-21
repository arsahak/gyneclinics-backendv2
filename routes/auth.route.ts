import { Router } from "express";
import {
  acceptConsent,
  getSession,
  register,
  sendOtpCode,
  staffLogin,
  verifyOtpCode,
} from "../controllers/auth.controller";
import { authorize, protect } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import { validate } from "../middleware/validate";
import {
  registerRules,
  sendOtpRules,
  staffLoginRules,
  verifyOtpRules,
} from "../validators/auth.validator";

const router = Router();

const FIFTEEN_MINUTES = 15 * 60 * 1000;
// Per IP. Twilio Verify also limits sends and attempts per phone number.
const sendLimit = rateLimit({ windowMs: FIFTEEN_MINUTES, max: 5, message: "Too many codes requested. Please try again later" });
const verifyLimit = rateLimit({ windowMs: FIFTEEN_MINUTES, max: 10, message: "Too many attempts. Please try again later" });
const loginLimit = rateLimit({ windowMs: FIFTEEN_MINUTES, max: 10, message: "Too many sign-in attempts. Please try again later" });

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: >
 *     Patients and doctors sign in with a phone code (send → verify → register
 *     for new numbers). Staff sign in with email and password.
 *
 * components:
 *   schemas:
 *     NextStep:
 *       type: string
 *       enum: [onboarding, consent, verification_pending, verification_rejected, home]
 *       description: Where the app should send the user next
 *     AuthSession:
 *       type: object
 *       properties:
 *         token:
 *           type: string
 *           description: "Send as `Authorization: Bearer <token>`"
 *         user:
 *           $ref: '#/components/schemas/User'
 *         profile:
 *           nullable: true
 *           description: Patient or Doctor profile; null until onboarding is done
 *           oneOf:
 *             - $ref: '#/components/schemas/Patient'
 *             - $ref: '#/components/schemas/Doctor'
 *         nextStep:
 *           $ref: '#/components/schemas/NextStep'
 */

/**
 * @swagger
 * /auth/otp/send:
 *   post:
 *     summary: Send a sign-in code by SMS
 *     description: >
 *       Works for new and existing numbers. In development, when OTP_BYPASS_CODE
 *       is set, no SMS is sent and that code is accepted instead.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone]
 *             properties:
 *               phone:
 *                 type: string
 *                 description: With country code. Spaces, dashes and brackets are ignored.
 *                 example: "+44 7700 900123"
 *     responses:
 *       200:
 *         description: Code sent
 *       422:
 *         description: Invalid phone number
 *       429:
 *         description: Too many codes requested
 */
router.post("/otp/send", sendLimit, sendOtpRules, validate, sendOtpCode);

/**
 * @swagger
 * /auth/otp/verify:
 *   post:
 *     summary: Check the SMS code
 *     description: >
 *       Existing number → signed in (`isNewUser: false` plus an AuthSession).
 *       New number → `isNewUser: true` and a `signupToken` (valid 15 minutes)
 *       to pass to /auth/register.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, code]
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "+447700900123"
 *               code:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Code accepted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   oneOf:
 *                     - allOf:
 *                         - $ref: '#/components/schemas/AuthSession'
 *                         - type: object
 *                           properties:
 *                             isNewUser:
 *                               type: boolean
 *                               example: false
 *                     - type: object
 *                       properties:
 *                         isNewUser:
 *                           type: boolean
 *                           example: true
 *                         phone:
 *                           type: string
 *                         signupToken:
 *                           type: string
 *       400:
 *         description: Code is incorrect or expired
 *       403:
 *         description: Staff account or deactivated account
 *       429:
 *         description: Too many attempts
 */
router.post("/otp/verify", verifyLimit, verifyOtpRules, validate, verifyOtpCode);

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Create a patient or doctor account for a verified phone
 *     description: The next step is onboarding (patient or doctor profile).
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [signupToken, role]
 *             properties:
 *               signupToken:
 *                 type: string
 *                 description: From /auth/otp/verify
 *               role:
 *                 type: string
 *                 enum: [patient, doctor]
 *               fullName:
 *                 type: string
 *                 example: Ayesha Khan
 *     responses:
 *       201:
 *         description: Account created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/AuthSession'
 *       401:
 *         description: Signup token is invalid or expired
 *       409:
 *         description: An account already exists for this number
 */
router.post("/register", verifyLimit, registerRules, validate, register);

/**
 * @swagger
 * /auth/staff/login:
 *   post:
 *     summary: Staff sign-in (moderator, admin, superadmin)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Signed in; returns `token` and `user`
 *       401:
 *         description: Incorrect email or password
 *       403:
 *         description: Account deactivated
 */
router.post("/staff/login", loginLimit, staffLoginRules, validate, staffLogin);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Current user, their profile and next step
 *     description: Call on app start to decide which screen to show.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Session (without a new token)
 *       401:
 *         description: Not authenticated
 */
router.get("/me", protect, getSession);

/**
 * @swagger
 * /auth/consent:
 *   post:
 *     summary: Accept the terms and data consent
 *     description: Safe to call again; the first acceptance time is kept.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Consent recorded; returns the session with the next step
 *       401:
 *         description: Not authenticated
 */
router.post("/consent", protect, authorize("patient", "doctor", "customer"), acceptConsent);

export default router;
