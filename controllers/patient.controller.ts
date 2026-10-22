import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { Patient } from "../models/patient.model";
import { User } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { assertContactFree } from "../utils/contact";
import { sessionFor } from "../utils/session";
import { alertStaff, moneyText } from "../utils/staffAlerts";

// Patient endpoints:
//   - the signed-in patient saves their own health profile (PUT /patients/me)
//   - admins list, view, block and unblock patient accounts
// A blocked patient (isActive = false) can't sign in or use the API.

const dateOrUndefined = (value?: string) => (value ? new Date(value) : undefined);

/** Create or replace the signed-in patient's profile (onboarding and profile edit). */
export const savePatientProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const b = req.body;

  const profile = (await Patient.findOne({ user: user._id })) ?? new Patient({ user: user._id });
  const isNew = profile.isNew;
  profile.set({
    dateOfBirth: dateOrUndefined(b.dateOfBirth),
    heightCm: b.heightCm,
    weightKg: b.weightKg,
    typicalCycleLength: b.typicalCycleLength,
    typicalPeriodLength: b.typicalPeriodLength,
    lastPeriodStart: dateOrUndefined(b.lastPeriodStart),
    pregnancyStatus: b.pregnancyStatus,
    dueDate: b.pregnancyStatus === "pregnant" ? dateOrUndefined(b.dueDate) : undefined,
  });
  if (isNew) profile.onboardedAt = new Date();
  await profile.save();

  if (b.fullName && b.fullName !== user.fullName) {
    user.fullName = b.fullName;
    await user.save();
  }
  if (isNew) {
    await alertStaff({
      type: "patient_signup",
      areas: ["patients"],
      title: "New patient signed up",
      body: `${user.fullName || "A patient"} joined${user.country ? ` from ${user.country}` : ""}${profile.pregnancyStatus === "pregnant" ? " · pregnant" : ""}.`,
      link: `/patient/${user._id}`,
    });
  }

  return ApiResponse(res, isNew ? 201 : 200, "Profile saved", await sessionFor(user, profile));
});

// ── Admin ───────────────────────────────────────────────────────────────────

const USER_FIELDS =
  "fullName email phone avatar phoneVerified emailVerified isActive suspensionReason suspendedAt createdAt lastLoginAt";

const SORTS: Record<string, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  name_asc: { fullName: 1 },
  name_desc: { fullName: -1 },
};

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** User fields plus their patient profile (or null before onboarding). */
async function withProfiles<T extends { _id: unknown }>(users: T[]) {
  const profiles = await Patient.find({ user: { $in: users.map((u) => u._id) } })
    .select("-__v")
    .lean();
  const byUser = new Map(profiles.map((p) => [String(p.user), p]));
  return users.map((user) => ({ ...user, profile: byUser.get(String(user._id)) ?? null }));
}

async function findPatientOr404(id: string) {
  const user = await User.findOne({ _id: id, role: "patient" });
  if (!user) throw new ApiError(404, "Patient not found");
  return user;
}

async function patientDetails(id: string) {
  const user = await User.findById(id).select(USER_FIELDS).lean();
  if (!user) throw new ApiError(404, "Patient not found");
  const [patient] = await withProfiles([user]);
  return patient;
}

export const listPatients = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const status = String(req.query.status ?? "all");
  const sort = SORTS[String(req.query.sort ?? "newest")] ?? SORTS.newest;
  const search = String(req.query.search ?? "").trim();

  const filter: Record<string, unknown> = { role: "patient" };
  if (status === "active") filter.isActive = true;
  if (status === "suspended") filter.isActive = false;
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ fullName: pattern }, { phone: pattern }, { email: pattern }];
  }

  const [users, total, allPatients, blocked, pregnant] = await Promise.all([
    User.find(filter)
      .select(USER_FIELDS)
      .sort(sort)
      .collation({ locale: "en" })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
    User.countDocuments({ role: "patient" }),
    User.countDocuments({ role: "patient", isActive: false }),
    Patient.countDocuments({ pregnancyStatus: "pregnant" }),
  ]);

  return ApiResponse(res, 200, "Patients fetched successfully", {
    patients: await withProfiles(users),
    pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
    stats: { total: allPatients, active: allPatients - blocked, blocked, pregnant },
  });
});

export const getPatient = asyncHandler(async (req: Request, res: Response) => {
  await findPatientOr404(req.params.id);
  return ApiResponse(res, 200, "Patient fetched successfully", await patientDetails(req.params.id));
});

export const suspendPatient = asyncHandler(async (req: Request, res: Response) => {
  const user = await findPatientOr404(req.params.id);
  user.isActive = false;
  user.suspensionReason = req.body.reason || undefined;
  user.suspendedAt = new Date();
  await user.save();
  return ApiResponse(res, 200, "Patient blocked", await patientDetails(user.id));
});

export const unsuspendPatient = asyncHandler(async (req: Request, res: Response) => {
  const user = await findPatientOr404(req.params.id);
  user.isActive = true;
  user.suspensionReason = undefined;
  user.suspendedAt = undefined;
  await user.save();
  return ApiResponse(res, 200, "Patient unblocked", await patientDetails(user.id));
});

/** Health profile fields an admin can set, mapped to the Patient model. */
function profileFields(p: Record<string, unknown>) {
  return {
    dateOfBirth: dateOrUndefined(p.dateOfBirth as string),
    heightCm: p.heightCm,
    weightKg: p.weightKg,
    typicalCycleLength: p.typicalCycleLength,
    typicalPeriodLength: p.typicalPeriodLength,
    lastPeriodStart: dateOrUndefined(p.lastPeriodStart as string),
    pregnancyStatus: p.pregnancyStatus,
    dueDate: p.pregnancyStatus === "pregnant" ? dateOrUndefined(p.dueDate as string) : undefined,
  };
}

/**
 * Admin creates a patient account. They sign in later with this phone number
 * (OTP). Without a health profile, they complete onboarding on first sign-in.
 */
export const createPatient = asyncHandler(async (req: Request, res: Response) => {
  const { fullName, phone, email, profile } = req.body;
  await assertContactFree(phone, email);

  const user = await User.create({ fullName, phone, email: email || undefined, role: "patient" });
  if (profile) {
    try {
      await Patient.create({ user: user._id, ...profileFields(profile), onboardedAt: new Date() });
    } catch (error) {
      // Don't leave an account behind when the profile is invalid.
      await User.deleteOne({ _id: user._id });
      throw error;
    }
  }

  return ApiResponse(res, 201, "Patient created", await patientDetails(user.id));
});

/** Admin edits a patient's contact details and/or health profile. */
export const updatePatient = asyncHandler(async (req: Request, res: Response) => {
  const user = await findPatientOr404(req.params.id);
  const { fullName, phone, email, profile } = req.body;

  const newPhone = phone !== undefined && phone !== user.phone ? phone : undefined;
  const newEmail = email && email.toLowerCase() !== user.email ? email : undefined;
  await assertContactFree(newPhone, newEmail, user.id);

  if (fullName !== undefined) user.fullName = fullName;
  if (newPhone) {
    user.phone = newPhone;
    user.phoneVerified = false;
  }
  if (email !== undefined) {
    if (!email) user.email = undefined;
    else if (newEmail) {
      user.email = newEmail;
      user.emailVerified = false;
    }
  }
  await user.save();

  if (profile) {
    const existing = await Patient.findOne({ user: user._id });
    const doc = existing ?? new Patient({ user: user._id, onboardedAt: new Date() });
    doc.set(profileFields(profile));
    await doc.save();
  }

  return ApiResponse(res, 200, "Patient updated", await patientDetails(user.id));
});
