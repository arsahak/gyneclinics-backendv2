import { Router } from "express";
import {
  createPatient,
  getPatient,
  listPatients,
  savePatientProfile,
  suspendPatient,
  unsuspendPatient,
  updatePatient,
} from "../controllers/patient.controller";
import { authorize, protect } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  createPatientRules,
  listPatientsRules,
  patientIdRules,
  patientProfileRules,
  suspendPatientRules,
  updatePatientRules,
} from "../validators/patient.validator";

// Mounted at /api/v1/patients.
//   PUT   /me             the signed-in patient saves their profile
//   GET   /               admin: list patients (search, filter, sort, page, stats)
//   POST  /               admin: create a patient
//   GET   /:id            admin: one patient
//   PATCH /:id            admin: edit a patient
//   PATCH /:id/suspend    admin: block
//   PATCH /:id/unsuspend  admin: unblock
const router = Router();

/**
 * @swagger
 * tags:
 *   name: Patients
 *   description: Patient profile (self) and patient management (admin)
 */

/**
 * @swagger
 * /patients/me:
 *   put:
 *     summary: Save the signed-in patient's profile
 *     description: Creates the profile on first call (finishes onboarding), replaces it after that. Returns the session with the next step.
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [dateOfBirth, heightCm, weightKg, typicalCycleLength, typicalPeriodLength, pregnancyStatus]
 *             properties:
 *               fullName:
 *                 type: string
 *               dateOfBirth:
 *                 type: string
 *                 example: "1997-04-12"
 *               heightCm:
 *                 type: number
 *               weightKg:
 *                 type: number
 *               typicalCycleLength:
 *                 type: number
 *               typicalPeriodLength:
 *                 type: number
 *               lastPeriodStart:
 *                 type: string
 *                 example: "2026-10-08"
 *               pregnancyStatus:
 *                 type: string
 *                 enum: [not_pregnant, trying, pregnant, postpartum]
 *               dueDate:
 *                 type: string
 *                 description: Required when pregnant
 *     responses:
 *       200:
 *         description: Profile updated; data is an AuthSession without a token
 *       201:
 *         description: Profile created
 *       422:
 *         description: Validation failed
 */
router.put("/me", protect, authorize("patient"), patientProfileRules, validate, savePatientProfile);

// ── Admin: patient management (admin and superadmin only) ───────────────────

const adminOnly = [protect, authorize("admin", "superadmin")];

/**
 * @swagger
 * components:
 *   schemas:
 *     AdminPatient:
 *       type: object
 *       description: Patient account fields plus their health profile (null before onboarding)
 *       properties:
 *         _id:
 *           type: string
 *         fullName:
 *           type: string
 *         phone:
 *           type: string
 *         email:
 *           type: string
 *         avatar:
 *           type: string
 *         phoneVerified:
 *           type: boolean
 *         emailVerified:
 *           type: boolean
 *         isActive:
 *           type: boolean
 *           description: false when blocked
 *         suspensionReason:
 *           type: string
 *           nullable: true
 *         suspendedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         profile:
 *           nullable: true
 *           allOf:
 *             - $ref: '#/components/schemas/Patient'
 *
 * /patients:
 *   get:
 *     summary: List patients (admin)
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [all, active, suspended], default: all } }
 *       - { in: query, name: search, schema: { type: string }, description: Name, phone or email }
 *       - { in: query, name: sort, schema: { type: string, enum: [newest, oldest, name_asc, name_desc], default: newest } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 10, maximum: 100 } }
 *     responses:
 *       200:
 *         description: "data: { patients: AdminPatient[], pagination: { total, page, limit, pages }, stats: { total, active, blocked, pregnant } }"
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 */
router.get("/", ...adminOnly, listPatientsRules, validate, listPatients);

/**
 * @swagger
 * components:
 *   schemas:
 *     AdminPatientProfileInput:
 *       type: object
 *       required: [dateOfBirth, heightCm, weightKg, typicalCycleLength, typicalPeriodLength, pregnancyStatus]
 *       properties:
 *         dateOfBirth: { type: string, example: "1995-05-05" }
 *         heightCm: { type: number, example: 160 }
 *         weightKg: { type: number, example: 58 }
 *         typicalCycleLength: { type: number, example: 28 }
 *         typicalPeriodLength: { type: number, example: 5 }
 *         lastPeriodStart: { type: string, example: "2026-10-01" }
 *         pregnancyStatus: { type: string, enum: [not_pregnant, trying, pregnant, postpartum] }
 *         dueDate: { type: string, description: Required when pregnant }
 *
 * /patients:
 *   post:
 *     summary: Create a patient (admin)
 *     description: >
 *       The patient signs in later with this phone number (OTP). Without a
 *       profile, they complete onboarding on first sign-in.
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullName, phone]
 *             properties:
 *               fullName: { type: string }
 *               phone: { type: string, example: "+447700900123" }
 *               email: { type: string }
 *               profile:
 *                 $ref: '#/components/schemas/AdminPatientProfileInput'
 *     responses:
 *       201:
 *         description: "Created; data: AdminPatient"
 *       409:
 *         description: Phone or email already registered
 *       422:
 *         description: Validation failed
 */
router.post("/", ...adminOnly, createPatientRules, validate, createPatient);

/**
 * @swagger
 * /patients/{id}:
 *   get:
 *     summary: Get one patient (admin)
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: "data: AdminPatient"
 *       404:
 *         description: Patient not found
 */
router.get("/:id", ...adminOnly, patientIdRules, validate, getPatient);

/**
 * @swagger
 * /patients/{id}:
 *   patch:
 *     summary: Edit a patient (admin)
 *     description: Send only what changes. A new phone or email must be verified again.
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName: { type: string }
 *               phone: { type: string }
 *               email: { type: string, description: Empty string removes it }
 *               profile:
 *                 $ref: '#/components/schemas/AdminPatientProfileInput'
 *     responses:
 *       200:
 *         description: "Updated; data: AdminPatient"
 *       404:
 *         description: Patient not found
 *       409:
 *         description: Phone or email already registered
 */
router.patch("/:id", ...adminOnly, updatePatientRules, validate, updatePatient);

/**
 * @swagger
 * /patients/{id}/suspend:
 *   patch:
 *     summary: Block a patient (admin)
 *     description: The patient can't sign in or use the app until unblocked.
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: "Blocked; data: AdminPatient"
 *       404:
 *         description: Patient not found
 */
router.patch("/:id/suspend", ...adminOnly, suspendPatientRules, validate, suspendPatient);

/**
 * @swagger
 * /patients/{id}/unsuspend:
 *   patch:
 *     summary: Unblock a patient (admin)
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: "Unblocked; data: AdminPatient"
 *       404:
 *         description: Patient not found
 */
router.patch("/:id/unsuspend", ...adminOnly, patientIdRules, validate, unsuspendPatient);

export default router;
