import { Router } from "express";
import {
  getMe,
  updateAvatar,
  updateMe,
  deleteMe,
  changePassword,
  removeAvatar,
} from "../controllers/user.controller";
import {
  createStaff,
  deleteStaff,
  getPermissions,
  listStaff,
  savePermissions,
  setStaffPassword,
  updateStaff,
} from "../controllers/team.controller";
import { protect, authorize } from "../middleware/auth";
import { requireAccess } from "../utils/permissions";
import { validate } from "../middleware/validate";
import { upload } from "../middleware/upload";
import {
  createStaffRules,
  updateStaffRules,
  staffPasswordRules,
  savePermissionsRules,
  updateMeRules,
  changePasswordRules,
} from "../validators/user.validator";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: Your account, the dashboard team, and access by role
 */

/**
 * @swagger
 * /users/staff:
 *   post:
 *     summary: Create a moderator, admin, or superadmin account
 *     description: >
 *       Needs "team: manage" (set in Team & Roles). A super admin can add any role;
 *       anyone else only roles below theirs (an admin adds moderators).
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fullName
 *               - email
 *               - password
 *               - role
 *             properties:
 *               fullName:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *               avatar:
 *                 type: string
 *               password:
 *                 type: string
 *                 format: password
 *               role:
 *                 type: string
 *                 enum: [moderator, admin, superadmin]
 *     responses:
 *       201:
 *         description: Staff user created successfully
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
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       403:
 *         description: Not permitted to create a user with the given role
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       409:
 *         description: Email or phone already registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       422:
 *         description: Validation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.post("/staff", protect, requireAccess("team", "manage"), createStaffRules, validate, createStaff);

/**
 * @swagger
 * /users/staff:
 *   get:
 *     summary: 'The dashboard team (needs "team: view")'
 *     description: >
 *       Every staff account, with `isYou` and `canManage` (whether you may change them:
 *       super admins manage every role, others only roles below theirs with "team: manage").
 *       data: { members, manageableRoles }
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Staff fetched successfully
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
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       403:
 *         description: Not permitted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get("/staff", protect, requireAccess("team", "view"), listStaff);

/**
 * @swagger
 * /users/staff/{id}:
 *   patch:
 *     summary: Update a staff member's role or details (admin/superadmin only)
 *     description: >
 *       An admin can only manage moderator accounts. A superadmin can manage
 *       moderator, admin, and superadmin accounts. Neither can target their own
 *       account here — use /users/me for that.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [moderator, admin, superadmin]
 *     responses:
 *       200:
 *         description: Staff member updated successfully
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
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Cannot target your own account through this endpoint
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       403:
 *         description: Not permitted to manage this account or assign this role
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       404:
 *         description: Staff member not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       409:
 *         description: Email or phone already registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *   delete:
 *     summary: Remove a staff member (admin/superadmin only)
 *     description: >
 *       An admin can only remove moderator accounts. A superadmin can remove
 *       moderator, admin, and superadmin accounts. Neither can delete their own
 *       account here.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Staff member deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Cannot delete your own account through this endpoint
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       403:
 *         description: Not permitted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       404:
 *         description: Staff member not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router
  .route("/staff/:id")
  .patch(protect, requireAccess("team", "manage"), updateStaffRules, validate, updateStaff)
  .delete(protect, requireAccess("team", "manage"), deleteStaff);

/**
 * @swagger
 * /users/staff/{id}/password:
 *   patch:
 *     summary: Set a new password for a team member
 *     description: 'Needs "team: manage" and a role above theirs (super admins can do anyone but themselves).'
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [password], properties: { password: { type: string, minLength: 6 } } }
 *     responses:
 *       200: { description: Password set }
 * /users/permissions:
 *   get:
 *     summary: Dashboard access by role (any staff)
 *     description: >
 *       Areas (one per dashboard page), each role's level (none, view, manage), your own access,
 *       who each role can add, member counts and the change history. Super admins always have full access.
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "data: { areas, roles, defaults, myRole, mine, canEdit, manageableRoles, canAdd, counts, history }" }
 *   put:
 *     summary: Change what admins and moderators can open (super admin)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roles]
 *             properties:
 *               roles:
 *                 type: object
 *                 example: { admin: { payments: view }, moderator: { patients: none } }
 *     responses:
 *       200: { description: "Saved; applies right away. data: { roles, changes }" }
 *       422: { description: Unknown area or a level that area doesn't have }
 */
router.patch("/staff/:id/password", protect, requireAccess("team", "manage"), staffPasswordRules, validate, setStaffPassword);
router.get("/permissions", protect, getPermissions);
router.put("/permissions", protect, authorize("superadmin"), savePermissionsRules, validate, savePermissions);

/**
 * @swagger
 * /users/me:
 *   get:
 *     summary: Get the authenticated user's own profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile fetched successfully
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
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get("/me", protect, getMe);

/**
 * @swagger
 * /users/me:
 *   patch:
 *     summary: Update the authenticated user's own profile (General settings)
 *     description: Does not change role or password — see /users/me/password for that.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               country:
 *                 type: string
 *                 example: GB
 *               address:
 *                 $ref: '#/components/schemas/Address'
 *     responses:
 *       200:
 *         description: Profile updated successfully
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
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       409:
 *         description: Email or phone already registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       422:
 *         description: Validation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.patch("/me", protect, updateMeRules, validate, updateMe);

/**
 * @swagger
 * /users/me:
 *   delete:
 *     summary: Delete the authenticated user's own account
 *     description: Available to any authenticated user (customer or staff). Permanently deletes the account and its avatar file, if one exists.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.delete("/me", protect, deleteMe);

/**
 * @swagger
 * /users/me/password:
 *   patch:
 *     summary: Change the authenticated user's own password
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *               newPassword:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Password updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       401:
 *         description: Not authenticated, or current password is incorrect
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       422:
 *         description: Validation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.patch(
  "/me/password",
  protect,
  changePasswordRules,
  validate,
  changePassword
);

/**
 * @swagger
 * /users/me/avatar:
 *   patch:
 *     summary: Upload/update the authenticated user's avatar
 *     description: Available to any authenticated user (customer or staff). Replaces and deletes the previous avatar from storage, if one existed.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - avatar
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Avatar updated successfully
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
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       422:
 *         description: Missing file or invalid image type
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.patch("/me/avatar", protect, upload.single("avatar"), updateAvatar);

/**
 * @swagger
 * /users/me/avatar:
 *   delete:
 *     summary: Remove the authenticated user's avatar
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Avatar removed
 */
router.delete("/me/avatar", protect, removeAvatar);

export default router;
