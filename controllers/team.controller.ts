import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../middleware/asyncHandler";
import { ACCESS_LEVELS, EDITABLE_ROLES, RolePermission, type AccessLevel, type EditableRole } from "../models/rolePermission.model";
import { STAFF_ROLES, User, type IUser, type StaffRole } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { accessFor, allows, AREAS, DEFAULT_ACCESS, forgetAccessCache, getAccess } from "../utils/permissions";
import { deleteStoredFile } from "../utils/storage";

// Team & Roles: dashboard staff, and what each role can open.
//   - Viewing the team needs "team: view"; adding, changing and removing needs "team: manage".
//   - Super admins manage every role. Anyone else manages only roles below theirs
//     (an admin manages moderators). Nobody changes their own account here.
//   - There's always at least one active super admin.
//   - Super admins set what admins and moderators can open (the permission matrix).

const RANK: Record<StaffRole, number> = { moderator: 1, admin: 2, superadmin: 3 };
const ROLE_LABEL: Record<StaffRole, string> = { superadmin: "Super admin", admin: "Admin", moderator: "Moderator" };
const LEVEL_LABEL: Record<AccessLevel, string> = { none: "no access", view: "view", manage: "manage" };

/** Roles this person may add, change and remove. */
async function manageableRoles(user: IUser): Promise<StaffRole[]> {
  if (user.role === "superadmin") return [...STAFF_ROLES];
  if (!allows((await accessFor(user.role))["team"], "manage")) return [];
  return STAFF_ROLES.filter((r) => RANK[r] < RANK[user.role as StaffRole]);
}

const STAFF_FIELDS = "fullName email phone avatar role isActive suspensionReason suspendedAt lastLoginAt createdAt";

/** The member, if this person may change them. */
async function manageableMember(req: Request): Promise<IUser> {
  const me = req.user!;
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, "Team member not found");
  const target = await User.findOne({ _id: req.params.id, role: { $in: STAFF_ROLES } });
  if (!target) throw new ApiError(404, "Team member not found");
  if (String(target._id) === String(me._id)) throw new ApiError(400, "You can't change your own account here. Use your profile, or ask another super admin.");
  if (!(await manageableRoles(me)).includes(target.role as StaffRole)) {
    throw new ApiError(403, `Your role can't change ${ROLE_LABEL[target.role as StaffRole].toLowerCase()}s`);
  }
  return target;
}

/** Stops the change if it would leave no active super admin. */
async function keepOneSuperadmin(target: IUser, nextRole: string, nextActive: boolean) {
  if (target.role !== "superadmin" || (nextRole === "superadmin" && nextActive)) return;
  const others = await User.countDocuments({ role: "superadmin", isActive: true, _id: { $ne: target._id } });
  if (others === 0) throw new ApiError(409, "There must always be at least one active super admin.");
}

const toMember = (u: IUser, me: IUser, roles: StaffRole[]) => ({
  _id: u._id,
  fullName: u.fullName,
  email: u.email,
  phone: u.phone,
  avatar: u.avatar,
  role: u.role,
  isActive: u.isActive,
  suspensionReason: u.suspensionReason,
  lastLoginAt: u.lastLoginAt,
  createdAt: u.createdAt,
  isYou: String(u._id) === String(me._id),
  canManage: String(u._id) !== String(me._id) && roles.includes(u.role as StaffRole),
});

/** GET /users/staff — everyone on the team, with what you may do to each. */
export const listStaff = asyncHandler(async (req: Request, res: Response) => {
  const me = req.user!;
  const [staff, roles] = await Promise.all([User.find({ role: { $in: STAFF_ROLES } }).select(STAFF_FIELDS).sort({ createdAt: 1 }), manageableRoles(me)]);
  return ApiResponse(res, 200, "Team fetched successfully", { members: staff.map((u) => toMember(u, me, roles)), manageableRoles: roles });
});

/** POST /users/staff — add a team member (email + password sign-in). */
export const createStaff = asyncHandler(async (req: Request, res: Response) => {
  const me = req.user!;
  const { fullName, email, phone, password, role } = req.body;
  const roles = await manageableRoles(me);
  if (!roles.includes(role)) throw new ApiError(403, `Your role can't add ${ROLE_LABEL[role as StaffRole]?.toLowerCase() ?? role}s`);
  const mail = String(email).trim().toLowerCase();
  if (await User.exists({ email: mail })) throw new ApiError(409, "Email is already registered");
  if (phone && (await User.exists({ phone }))) throw new ApiError(409, "Phone number is already registered");
  const user = await User.create({ fullName: String(fullName).trim(), email: mail, phone: phone || undefined, emailVerified: true, password, role });
  return ApiResponse(res, 201, `${user.fullName} added as ${ROLE_LABEL[role as StaffRole].toLowerCase()}`, toMember(user, me, roles));
});

/** PATCH /users/staff/:id — name, email, phone, role, or suspend / reactivate. */
export const updateStaff = asyncHandler(async (req: Request, res: Response) => {
  const me = req.user!;
  const target = await manageableMember(req);
  const roles = await manageableRoles(me);
  const { fullName, email, phone, role, isActive, suspensionReason } = req.body;

  if (role !== undefined && !roles.includes(role)) throw new ApiError(403, `Your role can't make someone a ${ROLE_LABEL[role as StaffRole]?.toLowerCase() ?? role}`);
  await keepOneSuperadmin(target, role ?? target.role, isActive ?? target.isActive);

  if (email !== undefined) {
    const mail = String(email).trim().toLowerCase();
    if (mail !== target.email && (await User.exists({ email: mail }))) throw new ApiError(409, "Email is already registered");
    target.email = mail;
  }
  if (phone !== undefined) {
    if (phone && phone !== target.phone && (await User.exists({ phone }))) throw new ApiError(409, "Phone number is already registered");
    target.phone = phone || undefined;
  }
  if (fullName !== undefined) target.fullName = String(fullName).trim();
  if (role !== undefined) target.role = role;
  if (isActive !== undefined && isActive !== target.isActive) {
    target.isActive = isActive;
    target.suspensionReason = isActive ? undefined : String(suspensionReason ?? "").trim() || undefined;
    target.suspendedAt = isActive ? undefined : new Date();
  }
  await target.save();
  const message = isActive === false ? `${target.fullName} can't sign in until reactivated` : isActive === true ? `${target.fullName} can sign in again` : "Changes saved";
  return ApiResponse(res, 200, message, toMember(target, me, roles));
});

/** PATCH /users/staff/:id/password — set a new password (they forgot theirs). */
export const setStaffPassword = asyncHandler(async (req: Request, res: Response) => {
  const target = await manageableMember(req);
  target.password = req.body.password;
  await target.save();
  return ApiResponse(res, 200, `New password set for ${target.fullName}. Share it with them privately.`);
});

/** DELETE /users/staff/:id — remove them from the team (their account is deleted). */
export const deleteStaff = asyncHandler(async (req: Request, res: Response) => {
  const target = await manageableMember(req);
  await keepOneSuperadmin(target, "removed", false);
  const avatarKey = target.avatarKey;
  await target.deleteOne();
  if (avatarKey) await deleteStoredFile(avatarKey);
  return ApiResponse(res, 200, `${target.fullName} removed from the team`);
});

/**
 * GET /users/permissions — any staff member: the areas, every role's access,
 * your own access (the dashboard shows only what you can open) and the history.
 */
export const getPermissions = asyncHandler(async (req: Request, res: Response) => {
  const me = req.user!;
  const [roles, doc, counts, manageable] = await Promise.all([
    getAccess(),
    RolePermission.findOne({ key: "roles" }).select("history updatedAt updatedBy").populate<{ history: { at: Date; changes: string[]; by: { fullName?: string } | null }[] }>("history.by", "fullName").lean(),
    User.aggregate<{ _id: StaffRole; n: number }>([{ $match: { role: { $in: STAFF_ROLES } } }, { $group: { _id: "$role", n: { $sum: 1 } } }]),
    manageableRoles(me),
  ]);
  const myRole = me.role as StaffRole;
  return ApiResponse(res, 200, "Permissions fetched successfully", {
    areas: AREAS,
    roles,
    defaults: DEFAULT_ACCESS,
    myRole,
    mine: roles[myRole],
    canEdit: myRole === "superadmin",
    manageableRoles: manageable,
    // Who each role can add (super admins: everyone; others: roles below theirs, with team: manage).
    canAdd: Object.fromEntries(
      STAFF_ROLES.map((r) => [r, r === "superadmin" ? [...STAFF_ROLES] : allows(roles[r].team, "manage") ? STAFF_ROLES.filter((x) => RANK[x] < RANK[r]) : []])
    ),
    counts: Object.fromEntries(STAFF_ROLES.map((r) => [r, counts.find((c) => c._id === r)?.n ?? 0])),
    history: (doc?.history ?? []).map((h) => ({ at: h.at, by: h.by?.fullName ?? null, changes: h.changes })),
  });
});

/** PUT /users/permissions — super admin: what admins and moderators can open. */
export const savePermissions = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body.roles as Partial<Record<EditableRole, Record<string, AccessLevel>>>;
  const before = await getAccess();
  const next: Record<EditableRole, Record<string, AccessLevel>> = { admin: { ...before.admin }, moderator: { ...before.moderator } };
  const changes: string[] = [];

  for (const role of EDITABLE_ROLES) {
    for (const [key, level] of Object.entries(body?.[role] ?? {})) {
      const area = AREAS.find((a) => a.key === key);
      if (!area) throw new ApiError(422, `Unknown area: ${key}`);
      if (!(ACCESS_LEVELS as readonly string[]).includes(level) || !area.levels.includes(level)) {
        throw new ApiError(422, `${area.label} can be: ${area.levels.map((l) => LEVEL_LABEL[l]).join(", ")}`);
      }
      if (before[role][key] !== level) changes.push(`${ROLE_LABEL[role]}s · ${area.label}: ${LEVEL_LABEL[before[role][key]]} → ${LEVEL_LABEL[level]}`);
      next[role][key] = level;
    }
  }

  if (changes.length) {
    const by = req.user!._id as mongoose.Types.ObjectId;
    await RolePermission.findOneAndUpdate(
      { key: "roles" },
      { $set: { key: "roles", roles: next, updatedBy: by }, $push: { history: { $each: [{ at: new Date(), by, changes }], $position: 0, $slice: 50 } } },
      { upsert: true, new: true }
    );
    forgetAccessCache();
  }
  return ApiResponse(res, 200, changes.length ? "Permissions saved. They apply right away." : "Nothing changed", { roles: await getAccess(), changes });
});
