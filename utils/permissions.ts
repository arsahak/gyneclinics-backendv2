import type { NextFunction, Request, Response } from "express";
import { RolePermission, type AccessLevel, type EditableRole } from "../models/rolePermission.model";
import { isStaffRole, type StaffRole } from "../models/user.model";
import { ApiError } from "./ApiError";

// Dashboard access by role. Each area of the dashboard (one per sidebar page)
// gets a level per role: none, view (read only) or manage (read and change).
// Super admins always manage everything; admins and moderators are set in
// Team & Roles. Every staff route checks it with requireAccess(area, level).

export interface Area {
  key: string;
  group: string;
  label: string;
  /** What "manage" lets someone do here. */
  manage: string;
  /** Some areas are read only by nature (reading chats, analytics). */
  levels: AccessLevel[];
}

const ALL: AccessLevel[] = ["none", "view", "manage"];
const READ: AccessLevel[] = ["none", "view"];

export const AREAS: Area[] = [
  { key: "patients", group: "People", label: "Patients", manage: "Edit, add and suspend patients", levels: ALL },
  { key: "doctors", group: "People", label: "Doctors and verification", manage: "Approve, edit, suspend and feature doctors", levels: ALL },
  { key: "consultations", group: "Care", label: "Consultations", manage: "See every booking", levels: READ },
  { key: "reviews", group: "Care", label: "Doctor reviews", manage: "Hide, show and delete reviews", levels: ALL },
  { key: "reports", group: "Safety", label: "Reports", manage: "Take and close reports", levels: ALL },
  { key: "chat_moderation", group: "Safety", label: "Chat moderation", manage: "Review and close flagged messages", levels: ALL },
  { key: "chat_monitoring", group: "Safety", label: "Chat monitoring (read chats)", manage: "Read patient–doctor chats", levels: READ },
  { key: "payments", group: "Money", label: "Payments and refunds", manage: "Refund patients through Stripe", levels: ALL },
  { key: "payouts", group: "Money", label: "Payouts to doctors", manage: "Send and reject payouts with Stripe", levels: ALL },
  { key: "content", group: "Content", label: "Learn articles", manage: "Write, publish and delete articles", levels: ALL },
  { key: "stories", group: "Content", label: "Community stories", manage: "Approve, edit and delete stories", levels: ALL },
  { key: "ads", group: "Content", label: "Advertisements", manage: "Create, edit and delete ads", levels: ALL },
  { key: "notifications", group: "Engage", label: "Notifications", manage: "Send announcements and switch auto messages", levels: ALL },
  { key: "chatbot", group: "Engage", label: "AI chatbot", manage: "Train the chatbot", levels: ALL },
  { key: "analytics", group: "Insights", label: "Analytics", manage: "See the numbers", levels: READ },
  { key: "fees", group: "Settings", label: "Fees, commission and consultation rules", manage: "Change commission, prices and rules", levels: ALL },
  { key: "team", group: "Settings", label: "Team and roles", manage: "Add, change and remove team members below their role", levels: ALL },
];

export type AreaKey = (typeof AREAS)[number]["key"];
export type Matrix = Record<string, AccessLevel>;

const RANK: Record<AccessLevel, number> = { none: 0, view: 1, manage: 2 };

/** The starting plan, used until a super admin changes it. */
export const DEFAULT_ACCESS: Record<EditableRole, Matrix> = {
  admin: {
    patients: "manage", doctors: "manage", consultations: "view", reviews: "manage", reports: "manage",
    chat_moderation: "manage", chat_monitoring: "view", payments: "view", payouts: "view", content: "manage",
    stories: "manage", ads: "manage", notifications: "manage", chatbot: "manage", analytics: "view", fees: "view", team: "manage",
  },
  moderator: {
    patients: "view", doctors: "view", consultations: "view", reviews: "manage", reports: "manage",
    chat_moderation: "manage", chat_monitoring: "view", payments: "none", payouts: "none", content: "none",
    stories: "manage", ads: "none", notifications: "none", chatbot: "none", analytics: "none", fees: "none", team: "none",
  },
};

const FULL: Matrix = Object.fromEntries(AREAS.map((a) => [a.key, a.levels[a.levels.length - 1]]));

let cache: { at: number; roles: Record<EditableRole, Matrix> } | null = null;

/** Every role's access (stored, filled in with the defaults). Cached 30 seconds. */
export async function getAccess(): Promise<Record<StaffRole, Matrix>> {
  if (!cache || Date.now() - cache.at > 30_000) {
    const doc = await RolePermission.findOne({ key: "roles" }).lean();
    const fill = (role: EditableRole): Matrix => {
      const saved = (doc?.roles?.[role] ?? {}) as Record<string, AccessLevel>;
      return Object.fromEntries(AREAS.map((a) => [a.key, a.levels.includes(saved[a.key]) ? saved[a.key] : DEFAULT_ACCESS[role][a.key]]));
    };
    cache = { at: Date.now(), roles: { admin: fill("admin"), moderator: fill("moderator") } };
  }
  return { superadmin: FULL, ...cache.roles };
}

export function forgetAccessCache() {
  cache = null;
}

export async function accessFor(role: string): Promise<Matrix> {
  if (!isStaffRole(role)) return Object.fromEntries(AREAS.map((a) => [a.key, "none"]));
  return (await getAccess())[role];
}

export const allows = (have: AccessLevel | undefined, need: AccessLevel) => RANK[have ?? "none"] >= RANK[need];

const labelOf = (key: string) => AREAS.find((a) => a.key === key)?.label ?? key;

/**
 * Route guard (after `protect`): the user's role needs at least `level` on one
 * of the areas. Patients and doctors never pass.
 */
export const requireAccess =
  (areas: AreaKey | AreaKey[], level: Exclude<AccessLevel, "none">) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const role = req.user?.role;
      if (!role || !isStaffRole(role)) throw new ApiError(403, "You do not have permission to perform this action");
      const list = Array.isArray(areas) ? areas : [areas];
      const mine = await accessFor(role);
      if (!list.some((a) => allows(mine[a], level))) {
        const what = labelOf(list[0]);
        throw new ApiError(403, level === "view" ? `Your role doesn't have access to ${what}` : `Your role can only view ${what}, not change it`);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
