import { Router } from "express";
import {
  approveDoctor,
  approveDoctorUpdate,
  createDoctor,
  deleteDoctor,
  featureDoctor,
  getDirectoryDoctor,
  getDoctor,
  getMyDoctorProfile,
  listDirectory,
  listDoctors,
  rejectDoctor,
  rejectDoctorUpdate,
  saveDoctorProfile,
  setDoctorAutoApprove,
  setDoctorVerification,
  suspendDoctor,
  unsuspendDoctor,
  updateDoctor,
  updateMyDoctorProfile,
} from "../controllers/doctor.controller";
import { authorize, protect } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  autoApproveDoctorRules,
  createDoctorRules,
  doctorIdRules,
  doctorProfileRules,
  featureDoctorRules,
  listDoctorsRules,
  rejectDoctorRules,
  rejectDoctorUpdateRules,
  suspendDoctorRules,
  updateDoctorRules,
  updateMyDoctorRules,
  verificationDoctorRules,
} from "../validators/doctor.validator";

// Mounted at /api/v1/doctors.
//   GET    /me              the signed-in doctor's full profile
//   PUT    /me              the signed-in doctor saves their profile (onboarding)
//   PATCH  /me              the signed-in doctor edits their profile (only what changes;
//                           an approved doctor's edits wait for admin review)
//   GET    /                admin: list doctors (search, status filter, sort, page, stats)
//   POST   /                admin: create a doctor (approved)
//   GET    /:id             admin: one doctor
//   PATCH  /:id             admin: edit a doctor
//   PATCH  /:id/approve     admin: approve verification
//   PATCH  /:id/reject      admin: reject verification
//   PATCH  /:id/verification admin: set pending / approved / rejected
//   PATCH  /:id/suspend     admin: block the account
//   PATCH  /:id/unsuspend   admin: unblock the account
//   PATCH  /:id/feature     admin: feature / unfeature
//   PATCH  /:id/update/approve  admin: make the doctor's pending profile update live
//   PATCH  /:id/update/reject   admin: turn the pending update down
//   PATCH  /:id/auto-approve    admin: let profile updates go live without review
//   DELETE /:id             admin: delete the account
//   GET    /directory       signed-in users: approved, active doctors (public fields)
//   GET    /directory/:id   signed-in users: one approved, active doctor
// `:id` is the Doctor profile id.
const router = Router();

/**
 * @swagger
 * tags:
 *   name: Doctors
 *   description: Doctor profile (self) and doctor management (admin)
 */

/**
 * @swagger
 * /doctors/me:
 *   put:
 *     summary: Save the signed-in doctor's profile
 *     description: >
 *       Creates the profile on first call (status pending), replaces it after that.
 *       Changing registration number, registration body or qualifications sends an
 *       approved doctor back to review.
 *     tags: [Doctors]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, specialization, qualifications, experienceYears, registrationNumber, registrationBody, city, languages, feeGBP]
 *             properties:
 *               fullName:
 *                 type: string
 *               title:
 *                 type: string
 *               specialization:
 *                 type: string
 *               qualifications:
 *                 type: array
 *                 items:
 *                   type: string
 *               experienceYears:
 *                 type: number
 *               registrationNumber:
 *                 type: string
 *               registrationBody:
 *                 type: string
 *               clinic:
 *                 type: string
 *               city:
 *                 type: string
 *               languages:
 *                 type: array
 *                 items:
 *                   type: string
 *               about:
 *                 type: string
 *               feeGBP:
 *                 type: number
 *               schedule:
 *                 $ref: '#/components/schemas/DoctorSchedule'
 *     responses:
 *       200:
 *         description: Profile saved; data is an AuthSession without a token
 *       409:
 *         description: Registration number already used
 *       422:
 *         description: Validation failed
 */
router.put("/me", protect, authorize("doctor"), doctorProfileRules, validate, saveDoctorProfile);

/**
 * @swagger
 * /doctors/me:
 *   get:
 *     summary: The signed-in doctor's full profile
 *     tags: [Doctors]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "data: Doctor with user { fullName, phone, email, avatar }"
 *       404:
 *         description: Onboarding not finished
 *   patch:
 *     summary: Edit the signed-in doctor's profile
 *     description: >
 *       Send only what changes. The phone number can't change here. Changing the
 *       registration number, registration body or qualifications sends the doctor
 *       back to review (data.reverification = true).
 *     tags: [Doctors]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AdminDoctorInput'
 *     responses:
 *       200:
 *         description: "data: Doctor with user, plus reverification: boolean"
 *       409:
 *         description: Email or registration number already used
 */
router.get("/me", protect, authorize("doctor"), getMyDoctorProfile);
router.patch("/me", protect, authorize("doctor"), updateMyDoctorRules, validate, updateMyDoctorProfile);

// ── Directory (any signed-in user) ──────────────────────────────────────────
// Registered before "/:id" so "directory" isn't read as an id.

/**
 * @swagger
 * /doctors/directory:
 *   get:
 *     summary: Approved, active doctors for patients to browse
 *     description: Public fields only — no phone, email or documents. Recommended doctors first.
 *     tags: [Doctors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: specialization, schema: { type: string } }
 *     responses:
 *       200:
 *         description: "data: Doctor[] (with user: { fullName, avatar })"
 * /doctors/directory/{id}:
 *   get:
 *     summary: One approved, active doctor's public profile
 *     tags: [Doctors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: "data: Doctor"
 *       404:
 *         description: Not found, not approved or blocked
 */
router.get("/directory", protect, listDirectory);
router.get("/directory/:id", protect, doctorIdRules, validate, getDirectoryDoctor);

// ── Admin (admin and superadmin only) ───────────────────────────────────────

const adminOnly = [protect, authorize("admin", "superadmin")];

/**
 * @swagger
 * components:
 *   schemas:
 *     AdminDoctor:
 *       allOf:
 *         - $ref: '#/components/schemas/Doctor'
 *         - type: object
 *           properties:
 *             user:
 *               type: object
 *               description: The doctor's account
 *               properties:
 *                 _id: { type: string }
 *                 fullName: { type: string }
 *                 phone: { type: string }
 *                 email: { type: string }
 *                 avatar: { type: string }
 *                 phoneVerified: { type: boolean }
 *                 isActive: { type: boolean, description: false when blocked }
 *                 suspensionReason: { type: string, nullable: true }
 *                 suspendedAt: { type: string, format: date-time, nullable: true }
 *                 lastLoginAt: { type: string, format: date-time, nullable: true }
 *                 createdAt: { type: string, format: date-time }
 *     AdminDoctorInput:
 *       type: object
 *       properties:
 *         fullName: { type: string }
 *         phone: { type: string, example: "+447700900123" }
 *         email: { type: string }
 *         title: { type: string, example: Consultant Gynaecologist }
 *         specialization: { type: string }
 *         qualifications: { type: array, items: { type: string } }
 *         experienceYears: { type: number }
 *         registrationNumber: { type: string }
 *         registrationBody: { type: string }
 *         clinic: { type: string }
 *         city: { type: string }
 *         country: { type: string }
 *         languages: { type: array, items: { type: string } }
 *         focusAreas: { type: array, items: { type: string } }
 *         about: { type: string }
 *         feeGBP: { type: number }
 *         schedule: { $ref: '#/components/schemas/DoctorSchedule' }
 *
 * /doctors:
 *   get:
 *     summary: List doctors (admin)
 *     tags: [Doctors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [all, pending, approved, rejected, suspended, featured], default: all } }
 *       - { in: query, name: search, schema: { type: string }, description: Name, phone, email, registration number, specialization or city }
 *       - { in: query, name: sort, schema: { type: string, enum: [newest, oldest, rating, experience, name_asc, name_desc], default: newest } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 10, maximum: 100 } }
 *     responses:
 *       200:
 *         description: "data: { doctors: AdminDoctor[], pagination: { total, page, limit, pages }, stats: { total, pending, approved, rejected, suspended, featured } }"
 *   post:
 *     summary: Create a doctor (admin)
 *     description: Creates the account and profile. Admin-created doctors are approved straight away.
 *     tags: [Doctors]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AdminDoctorInput'
 *     responses:
 *       201:
 *         description: "Created; data: AdminDoctor"
 *       409:
 *         description: Phone, email or registration number already used
 */
router.get("/", ...adminOnly, listDoctorsRules, validate, listDoctors);
router.post("/", ...adminOnly, createDoctorRules, validate, createDoctor);

/**
 * @swagger
 * /doctors/{id}:
 *   parameters:
 *     - { in: path, name: id, required: true, schema: { type: string }, description: Doctor profile id }
 *   get:
 *     summary: Get one doctor (admin)
 *     tags: [Doctors]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "data: AdminDoctor"
 *       404:
 *         description: Doctor not found
 *   patch:
 *     summary: Edit a doctor (admin)
 *     description: Send only what changes.
 *     tags: [Doctors]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AdminDoctorInput'
 *     responses:
 *       200:
 *         description: "Updated; data: AdminDoctor"
 *   delete:
 *     summary: Delete a doctor's account and profile (admin)
 *     tags: [Doctors]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Deleted
 */
router.get("/:id", ...adminOnly, doctorIdRules, validate, getDoctor);
router.patch("/:id", ...adminOnly, updateDoctorRules, validate, updateDoctor);
router.delete("/:id", ...adminOnly, doctorIdRules, validate, deleteDoctor);

/**
 * @swagger
 * /doctors/{id}/approve:
 *   patch:
 *     summary: Approve a doctor's verification (admin)
 *     tags: [Doctors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: "Approved; data: AdminDoctor"
 * /doctors/{id}/reject:
 *   patch:
 *     summary: Reject a doctor's verification (admin)
 *     tags: [Doctors]
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
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: "Rejected; data: AdminDoctor"
 * /doctors/{id}/suspend:
 *   patch:
 *     summary: Block a doctor's account (admin)
 *     tags: [Doctors]
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
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: "Blocked; data: AdminDoctor"
 * /doctors/{id}/unsuspend:
 *   patch:
 *     summary: Unblock a doctor's account (admin)
 *     tags: [Doctors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: "Unblocked; data: AdminDoctor"
 * /doctors/{id}/feature:
 *   patch:
 *     summary: Feature or unfeature a doctor (admin)
 *     tags: [Doctors]
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
 *             required: [featured]
 *             properties:
 *               featured: { type: boolean }
 *     responses:
 *       200:
 *         description: "data: AdminDoctor"
 */
router.patch("/:id/approve", ...adminOnly, doctorIdRules, validate, approveDoctor);
router.patch("/:id/reject", ...adminOnly, rejectDoctorRules, validate, rejectDoctor);

/**
 * @swagger
 * /doctors/{id}/verification:
 *   patch:
 *     summary: Set a doctor's verification status (admin)
 *     description: Any of pending, approved or rejected — including moving a doctor back to pending.
 *     tags: [Doctors]
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
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [pending, approved, rejected] }
 *               reason: { type: string, description: Kept when rejected }
 *     responses:
 *       200:
 *         description: "data: AdminDoctor"
 */
router.patch("/:id/verification", ...adminOnly, verificationDoctorRules, validate, setDoctorVerification);
router.patch("/:id/suspend", ...adminOnly, suspendDoctorRules, validate, suspendDoctor);
router.patch("/:id/unsuspend", ...adminOnly, doctorIdRules, validate, unsuspendDoctor);
router.patch("/:id/feature", ...adminOnly, featureDoctorRules, validate, featureDoctor);

/**
 * @swagger
 * /doctors/{id}/update/approve:
 *   patch:
 *     summary: Approve a doctor's pending profile update (admin)
 *     description: The changes in `pendingUpdate` (including a new photo) go live for patients.
 *     tags: [Doctors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: "data: AdminDoctor"
 *       409:
 *         description: No update to review, or the new registration number is taken
 * /doctors/{id}/update/reject:
 *   patch:
 *     summary: Reject a doctor's pending profile update (admin)
 *     description: The live profile stays as it is. The doctor sees the reason.
 *     tags: [Doctors]
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
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: "data: AdminDoctor"
 * /doctors/{id}/auto-approve:
 *   patch:
 *     summary: Turn auto-approve of profile updates on or off for a doctor (admin)
 *     description: Off (the default) means every profile edit waits for an admin. Registration details are always reviewed.
 *     tags: [Doctors]
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
 *             required: [enabled]
 *             properties:
 *               enabled: { type: boolean }
 *     responses:
 *       200:
 *         description: "data: AdminDoctor"
 */
router.patch("/:id/update/approve", ...adminOnly, doctorIdRules, validate, approveDoctorUpdate);
router.patch("/:id/update/reject", ...adminOnly, rejectDoctorUpdateRules, validate, rejectDoctorUpdate);
router.patch("/:id/auto-approve", ...adminOnly, autoApproveDoctorRules, validate, setDoctorAutoApprove);

export default router;
