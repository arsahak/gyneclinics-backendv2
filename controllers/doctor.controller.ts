import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import mongoose from "mongoose";
import { Doctor } from "../models/doctor.model";
import { User } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { assertContactFree } from "../utils/contact";
import {
  approvePendingUpdate,
  fieldNeedsReview,
  PROFILE_FIELDS,
  rejectPendingUpdate,
  REVIEWED_FIELDS,
  type ReviewedField,
  stageFields,
  VERIFIED_FIELDS,
} from "../utils/doctorUpdates";
import { linkFor, notify } from "../utils/notify";
import { sessionFor } from "../utils/session";
import { alertStaff, moneyText } from "../utils/staffAlerts";

/** Create or replace the signed-in doctor's profile (onboarding and profile edit). */
export const saveDoctorProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const b = req.body;

  const profile = (await Doctor.findOne({ user: user._id })) ?? new Doctor({ user: user._id });
  const isNewDoctor = profile.isNew;
  const wasRejected = profile.verificationStatus === "rejected";
  // An approved doctor's edits go through PATCH /doctors/me, where they're reviewed.
  if (profile.verificationStatus === "approved" && !profile.isNew) {
    throw new ApiError(409, "Your profile is already approved. Edit it from your profile page");
  }
  const before = profile.isNew
    ? null
    : JSON.stringify(VERIFIED_FIELDS.map((field) => profile.get(field)));

  profile.set({
    title: b.title,
    specialization: b.specialization,
    focusAreas: b.focusAreas ?? profile.focusAreas,
    qualifications: b.qualifications,
    experienceYears: b.experienceYears,
    registrationNumber: b.registrationNumber,
    registrationBody: b.registrationBody,
    clinic: b.clinic ?? "",
    city: b.city,
    country: b.country ?? profile.country,
    languages: b.languages,
    about: b.about ?? "",
    feeGBP: b.feeGBP,
  });
  if (b.schedule) {
    profile.set("schedule", { ...profile.toObject().schedule, ...b.schedule });
  }

  const changedVerifiedFields =
    before !== null && before !== JSON.stringify(VERIFIED_FIELDS.map((field) => profile.get(field)));
  // A rejected doctor who edits their profile is resubmitting it.
  if (changedVerifiedFields || profile.verificationStatus === "rejected") {
    profile.verificationStatus = "pending";
    profile.verifiedAt = undefined;
    profile.verifiedBy = undefined;
    profile.rejectionReason = undefined;
  }

  try {
    await profile.save();
    if (isNewDoctor || (wasRejected && profile.verificationStatus === "pending")) {
      await alertStaff({
        type: "doctor_signup",
        areas: ["doctors"],
        title: isNewDoctor ? "New doctor to verify" : "Doctor resubmitted for verification",
        body: `${user.fullName || "A doctor"} · ${profile.specialization}${profile.country ? ` · ${profile.country}` : ""}. Check their registration (${profile.registrationBody} ${profile.registrationNumber}).`,
        link: `/doctors/${profile._id}`,
      });
    }
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new ApiError(409, "This registration number is already used by another doctor");
    }
    throw error;
  }

  if (b.fullName && b.fullName !== user.fullName) {
    user.fullName = b.fullName;
    await user.save();
  }

  return ApiResponse(res, 200, "Profile saved", await sessionFor(user, profile));
});

// ── Admin: doctor management ────────────────────────────────────────────────
// Doctors are listed by their Doctor profile (`_id` below is the profile id);
// account fields (name, phone, block status) come from the linked User.

const USER_FIELDS =
  "fullName email phone avatar phoneVerified emailVerified isActive suspensionReason suspendedAt createdAt lastLoginAt";

const SORTS: Record<string, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  rating: { rating: -1, reviewCount: -1 },
  experience: { experienceYears: -1 },
  name_asc: { "user.fullName": 1 },
  name_desc: { "user.fullName": -1 },
};

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type LeanDoctor = { documents?: Array<Record<string, unknown>>; pendingUpdate?: Record<string, unknown> | null };

/** Storage keys are internal; clients only need each file's URL. */
function withoutStorageKeys<T extends LeanDoctor>(doctor: T): T {
  const { avatarKey: _avatarKey, ...pending } = doctor.pendingUpdate ?? {};
  return {
    ...doctor,
    documents: (doctor.documents ?? []).map(({ key: _key, ...doc }) => doc),
    // Mongoose drops an empty `fields` object (photo-only update).
    pendingUpdate: doctor.pendingUpdate ? { fields: {}, ...pending } : null,
  };
}

async function doctorOr404(id: string) {
  const doctor = await Doctor.findById(id);
  if (!doctor) throw new ApiError(404, "Doctor not found");
  return doctor;
}

/** Doctor profile with its account fields under `user`. */
async function doctorDetails(id: string) {
  const doctor = await Doctor.findById(id).select("-__v").populate("user", USER_FIELDS).lean();
  if (!doctor) throw new ApiError(404, "Doctor not found");
  return withoutStorageKeys(doctor as unknown as LeanDoctor);
}

/** Merges `messaging.free` / `messaging.consultation` from the body into the doctor (not saved). */
function applyMessaging(doctor: InstanceType<typeof Doctor>, messaging?: { free?: boolean; consultation?: boolean }) {
  if (!messaging) return;
  const current = doctor.toObject().messaging ?? { free: false, consultation: true };
  doctor.set("messaging", {
    free: messaging.free ?? current.free,
    consultation: messaging.consultation ?? current.consultation,
  });
}

const profileUpdates = (b: Record<string, unknown>) =>
  Object.fromEntries(PROFILE_FIELDS.filter((field) => b[field] !== undefined).map((field) => [field, b[field]]));

export const listDoctors = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const status = String(req.query.status ?? "all");
  // Updates to review: oldest request first.
  const sort =
    status === "updates" && !req.query.sort
      ? { "pendingUpdate.submittedAt": 1 as const }
      : SORTS[String(req.query.sort ?? "newest")] ?? SORTS.newest;
  const search = String(req.query.search ?? "").trim();

  const doctorMatch: Record<string, unknown> = {};
  if (["pending", "approved", "rejected"].includes(status)) doctorMatch.verificationStatus = status;
  if (status === "featured") doctorMatch.recommended = true;
  if (status === "updates") doctorMatch.pendingUpdate = { $type: "object" };

  const userMatch: Record<string, unknown> = {};
  if (status === "suspended") userMatch["user.isActive"] = false;
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    userMatch.$or = [
      { "user.fullName": pattern },
      { "user.phone": pattern },
      { "user.email": pattern },
      { registrationNumber: pattern },
      { specialization: pattern },
      { city: pattern },
    ];
  }

  const [result] = await Doctor.aggregate([
    { $match: doctorMatch },
    {
      $lookup: {
        from: User.collection.name,
        localField: "user",
        foreignField: "_id",
        as: "user",
        pipeline: [{ $project: Object.fromEntries(USER_FIELDS.split(" ").map((f) => [f, 1])) }],
      },
    },
    { $unwind: "$user" },
    { $match: userMatch },
    { $project: { __v: 0 } },
    {
      $facet: {
        doctors: [{ $sort: sort }, { $skip: (page - 1) * limit }, { $limit: limit }],
        total: [{ $count: "n" }],
      },
    },
  ]).collation({ locale: "en" });

  const total = result?.total?.[0]?.n ?? 0;
  const [all, pending, approved, rejected, featured, updates, suspendedUsers] = await Promise.all([
    Doctor.countDocuments(),
    Doctor.countDocuments({ verificationStatus: "pending" }),
    Doctor.countDocuments({ verificationStatus: "approved" }),
    Doctor.countDocuments({ verificationStatus: "rejected" }),
    Doctor.countDocuments({ recommended: true }),
    Doctor.countDocuments({ pendingUpdate: { $type: "object" } }),
    User.find({ role: "doctor", isActive: false }).distinct("_id"),
  ]);
  const suspended = await Doctor.countDocuments({ user: { $in: suspendedUsers } });

  return ApiResponse(res, 200, "Doctors fetched successfully", {
    doctors: (result?.doctors ?? []).map(withoutStorageKeys),
    pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
    stats: { total: all, pending, approved, rejected, suspended, featured, updates },
  });
});

export const getDoctor = asyncHandler(async (req: Request, res: Response) => {
  return ApiResponse(res, 200, "Doctor fetched successfully", await doctorDetails(req.params.id));
});

/** Admin creates a doctor account and profile. Admin-created doctors are approved. */
export const createDoctor = asyncHandler(async (req: Request, res: Response) => {
  const b = req.body;
  await assertContactFree(b.phone, b.email);

  const user = await User.create({ fullName: b.fullName, phone: b.phone, email: b.email || undefined, role: "doctor" });
  let doctor;
  try {
    doctor = await Doctor.create({
      user: user._id,
      ...profileUpdates(b),
      ...(b.schedule && { schedule: b.schedule }),
      ...(b.messaging && { messaging: { free: false, consultation: true, ...b.messaging } }),
      verificationStatus: "approved",
      verifiedBy: req.user!._id,
      verifiedAt: new Date(),
    });
  } catch (error) {
    // Don't leave an account behind when the profile is invalid.
    await User.deleteOne({ _id: user._id });
    if ((error as { code?: number }).code === 11000) {
      throw new ApiError(409, "This registration number is already used by another doctor");
    }
    throw error;
  }

  return ApiResponse(res, 201, "Doctor created", await doctorDetails(doctor.id));
});

/** Admin edits a doctor's account and/or profile. Send only what changes. */
export const updateDoctor = asyncHandler(async (req: Request, res: Response) => {
  const doctor = await doctorOr404(req.params.id);
  const user = await User.findById(doctor.user);
  if (!user) throw new ApiError(404, "Doctor account not found");
  const b = req.body;

  const newPhone = b.phone !== undefined && b.phone !== user.phone ? b.phone : undefined;
  const newEmail = b.email && String(b.email).toLowerCase() !== user.email ? b.email : undefined;
  await assertContactFree(newPhone, newEmail, user.id);

  if (b.fullName !== undefined) user.fullName = b.fullName;
  if (newPhone) {
    user.phone = newPhone;
    user.phoneVerified = false;
  }
  if (b.email !== undefined) {
    if (!b.email) user.email = undefined;
    else if (newEmail) {
      user.email = newEmail;
      user.emailVerified = false;
    }
  }
  await user.save();

  doctor.set(profileUpdates(b));
  if (b.schedule) doctor.set("schedule", { ...doctor.toObject().schedule, ...b.schedule });
  applyMessaging(doctor, b.messaging);
  try {
    await doctor.save();
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new ApiError(409, "This registration number is already used by another doctor");
    }
    throw error;
  }

  return ApiResponse(res, 200, "Doctor updated", await doctorDetails(doctor.id));
});

/** Tells the doctor what the team decided (automatic message "profile_reviewed"). */
async function tellDoctor(doctor: { user: mongoose.Types.ObjectId }, title: string, body: string) {
  await notify([doctor.user], { autoKey: "profile_reviewed", title, body, link: linkFor("home", "doctor") });
}

const VERIFIED_TEXT = {
  approved: ["Your profile is approved", "Your GyneClinics profile is approved. Patients can now find and book you."],
  rejected: ["Your profile wasn't approved", "Your GyneClinics profile wasn't approved yet."],
} as const;

export const approveDoctor = asyncHandler(async (req: Request, res: Response) => {
  const doctor = await doctorOr404(req.params.id);
  doctor.verificationStatus = "approved";
  doctor.verifiedBy = req.user!._id as mongoose.Types.ObjectId;
  doctor.verifiedAt = new Date();
  doctor.rejectionReason = undefined;
  await doctor.save();
  await tellDoctor(doctor, ...VERIFIED_TEXT.approved);
  return ApiResponse(res, 200, "Doctor approved", await doctorDetails(doctor.id));
});

export const rejectDoctor = asyncHandler(async (req: Request, res: Response) => {
  const doctor = await doctorOr404(req.params.id);
  doctor.verificationStatus = "rejected";
  doctor.verifiedBy = req.user!._id as mongoose.Types.ObjectId;
  doctor.verifiedAt = new Date();
  doctor.rejectionReason = req.body.reason || undefined;
  await doctor.save();
  await tellDoctor(doctor, VERIFIED_TEXT.rejected[0], `${VERIFIED_TEXT.rejected[1]}${doctor.rejectionReason ? ` ${doctor.rejectionReason}` : ""}`);
  return ApiResponse(res, 200, "Doctor rejected", await doctorDetails(doctor.id));
});

/** Sets the verification status directly (e.g. from a status dropdown), including back to pending. */
export const setDoctorVerification = asyncHandler(async (req: Request, res: Response) => {
  const doctor = await doctorOr404(req.params.id);
  const status = req.body.status as "pending" | "approved" | "rejected";
  doctor.verificationStatus = status;
  if (status === "pending") {
    doctor.verifiedBy = undefined;
    doctor.verifiedAt = undefined;
  } else {
    doctor.verifiedBy = req.user!._id as mongoose.Types.ObjectId;
    doctor.verifiedAt = new Date();
  }
  doctor.rejectionReason = status === "rejected" ? req.body.reason || undefined : undefined;
  await doctor.save();
  if (status === "approved") await tellDoctor(doctor, ...VERIFIED_TEXT.approved);
  if (status === "rejected") await tellDoctor(doctor, VERIFIED_TEXT.rejected[0], `${VERIFIED_TEXT.rejected[1]}${doctor.rejectionReason ? ` ${doctor.rejectionReason}` : ""}`);
  return ApiResponse(res, 200, `Doctor marked as ${status}`, await doctorDetails(doctor.id));
});

async function setDoctorActive(req: Request, active: boolean) {
  const doctor = await doctorOr404(req.params.id);
  const user = await User.findById(doctor.user);
  if (!user) throw new ApiError(404, "Doctor account not found");
  user.isActive = active;
  user.suspensionReason = active ? undefined : req.body?.reason || undefined;
  user.suspendedAt = active ? undefined : new Date();
  await user.save();
  return doctor.id as string;
}

/** Blocks the doctor's account: they can't sign in or chat until unblocked. */
export const suspendDoctor = asyncHandler(async (req: Request, res: Response) => {
  const id = await setDoctorActive(req, false);
  return ApiResponse(res, 200, "Doctor blocked", await doctorDetails(id));
});

export const unsuspendDoctor = asyncHandler(async (req: Request, res: Response) => {
  const id = await setDoctorActive(req, true);
  return ApiResponse(res, 200, "Doctor unblocked", await doctorDetails(id));
});

/** Featured doctors are pinned near the top of the patient's doctor list. */
export const featureDoctor = asyncHandler(async (req: Request, res: Response) => {
  const doctor = await doctorOr404(req.params.id);
  doctor.recommended = req.body.featured;
  await doctor.save();
  return ApiResponse(
    res,
    200,
    doctor.recommended ? "Doctor featured" : "Doctor no longer featured",
    await doctorDetails(doctor.id)
  );
});

/** Permanently deletes the doctor's account and profile. */
export const deleteDoctor = asyncHandler(async (req: Request, res: Response) => {
  const doctor = await doctorOr404(req.params.id);
  const user = await User.findById(doctor.user);
  if (user) await user.deleteOne(); // also deletes the Doctor profile
  else await doctor.deleteOne();
  return ApiResponse(res, 200, "Doctor account deleted");
});

// ── Patient-facing directory ────────────────────────────────────────────────
// Only approved doctors whose account isn't blocked, and only public fields:
// no phone, email, documents or admin notes.

const PUBLIC_FIELDS =
  "title specialization focusAreas qualifications experienceYears registrationNumber registrationBody clinic city country languages about feeGBP schedule messaging isOnline rating reviewCount consultationCount recommended createdAt user";

async function activeDoctorUserIds() {
  return User.find({ role: "doctor", isActive: true }).distinct("_id");
}

/** Approved, active doctors for patients to browse. Recommended first, then best rated. */
export const listDirectory = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = {
    verificationStatus: "approved",
    user: { $in: await activeDoctorUserIds() },
  };
  if (req.query.specialization) filter.specialization = String(req.query.specialization);

  const doctors = await Doctor.find(filter)
    .select(PUBLIC_FIELDS)
    .populate("user", "fullName avatar")
    .sort({ recommended: -1, rating: -1, reviewCount: -1, createdAt: -1 })
    .limit(200)
    .lean();

  return ApiResponse(res, 200, "Doctors fetched successfully", doctors);
});

/** One approved, active doctor's public profile. */
export const getDirectoryDoctor = asyncHandler(async (req: Request, res: Response) => {
  const doctor = await Doctor.findOne({
    _id: req.params.id,
    verificationStatus: "approved",
    user: { $in: await activeDoctorUserIds() },
  })
    .select(PUBLIC_FIELDS)
    .populate("user", "fullName avatar")
    .lean();
  if (!doctor) throw new ApiError(404, "Doctor not found");
  return ApiResponse(res, 200, "Doctor fetched successfully", doctor);
});

// ── The signed-in doctor ────────────────────────────────────────────────────

/** Own profile with account fields, for the doctor's profile page. */
async function myDoctorPayload(userId: unknown) {
  const doctor = await Doctor.findOne({ user: userId })
    .select("-__v")
    .populate("user", "fullName phone email avatar phoneVerified emailVerified")
    .lean();
  if (!doctor) throw new ApiError(404, "Complete your doctor profile first");
  return withoutStorageKeys(doctor as unknown as LeanDoctor);
}

export const getMyDoctorProfile = asyncHandler(async (req: Request, res: Response) => {
  return ApiResponse(res, 200, "Profile fetched successfully", await myDoctorPayload(req.user!._id));
});

/**
 * The doctor edits their own profile. Send only what changes.
 *
 * For an approved doctor, edits to what patients see wait for an admin
 * (`pendingUpdate`) unless the admin turned on auto-approve; registration
 * number, registration body and qualifications always wait. Email, schedule
 * and messaging settings are saved straight away. A rejected doctor who changes their
 * registration details is sent back to review.
 */
export const updateMyDoctorProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const b = req.body;
  const doctor = await Doctor.findOne({ user: user._id });
  if (!doctor) throw new ApiError(404, "Complete your doctor profile first");

  const newEmail = b.email && String(b.email).toLowerCase() !== user.email ? b.email : undefined;
  await assertContactFree(undefined, newEmail, user.id);

  // Split the edits into ones that go live now and ones that wait for review.
  const toReview: Partial<Record<ReviewedField, unknown>> = {};
  const before = JSON.stringify(VERIFIED_FIELDS.map((field) => doctor.get(field)));
  for (const field of REVIEWED_FIELDS) {
    if (b[field] === undefined) continue;
    if (fieldNeedsReview(doctor, field)) toReview[field] = b[field];
    else if (field === "fullName") user.fullName = b.fullName;
    else doctor.set(field, b[field]);
  }
  if (b.schedule) doctor.set("schedule", { ...doctor.toObject().schedule, ...b.schedule });
  // How patients can reach the doctor is saved straight away, like the schedule.
  applyMessaging(doctor, b.messaging);

  const inReview = Object.keys(toReview).length > 0 ? await stageFields(doctor, user, toReview) : Boolean(doctor.pendingUpdate);

  const resubmitted =
    doctor.verificationStatus === "rejected" &&
    before !== JSON.stringify(VERIFIED_FIELDS.map((field) => doctor.get(field)));
  if (resubmitted) {
    doctor.verificationStatus = "pending";
    doctor.verifiedAt = undefined;
    doctor.verifiedBy = undefined;
    doctor.rejectionReason = undefined;
  }
  try {
    await doctor.save();
    if (Object.keys(toReview).length > 0) {
      await alertStaff({
        type: "doctor_update",
        areas: ["doctors"],
        title: "Doctor profile update to review",
        body: `${user.fullName || "A doctor"} changed: ${Object.keys(toReview).join(", ")}.`,
        link: `/doctors/${doctor._id}`,
      });
    }
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new ApiError(409, "This registration number is already used by another doctor");
    }
    throw error;
  }

  if (b.email !== undefined) {
    if (!b.email) user.email = undefined;
    else if (newEmail) {
      user.email = newEmail;
      user.emailVerified = false;
    }
  }
  if (user.isModified()) await user.save();

  const message =
    Object.keys(toReview).length > 0 && inReview
      ? "Saved. Patients will see your changes once an admin approves them."
      : resubmitted
        ? "Saved. Your profile will be reviewed again before it's visible to patients."
        : "Profile saved";
  return ApiResponse(res, 200, message, { ...(await myDoctorPayload(user._id)), inReview, reverification: resubmitted });
});

// ── Admin: reviewing a doctor's profile update ──────────────────────────────

async function doctorWithUser(id: string) {
  const doctor = await doctorOr404(id);
  const user = await User.findById(doctor.user);
  if (!user) throw new ApiError(404, "Doctor account not found");
  return { doctor, user };
}

/** Makes the doctor's pending changes live for patients. */
export const approveDoctorUpdate = asyncHandler(async (req: Request, res: Response) => {
  const { doctor, user } = await doctorWithUser(req.params.id);
  await approvePendingUpdate(doctor, user);
  await tellDoctor(doctor, "Profile changes approved", "Your profile changes are approved and patients can see them now.");
  return ApiResponse(res, 200, "Profile update approved", await doctorDetails(doctor.id));
});

/** Turns the doctor's pending changes down; patients keep seeing the current profile. */
export const rejectDoctorUpdate = asyncHandler(async (req: Request, res: Response) => {
  const doctor = await doctorOr404(req.params.id);
  await rejectPendingUpdate(doctor, req.body.reason);
  await tellDoctor(doctor, "Profile changes not approved", `Your profile changes weren't approved.${req.body.reason ? ` ${req.body.reason}` : ""} Patients still see your current profile.`);
  return ApiResponse(res, 200, "Profile update rejected", await doctorDetails(doctor.id));
});

/** Whether this doctor's profile edits go live without review. */
export const setDoctorAutoApprove = asyncHandler(async (req: Request, res: Response) => {
  const doctor = await doctorOr404(req.params.id);
  doctor.autoApproveUpdates = req.body.enabled;
  await doctor.save();
  return ApiResponse(
    res,
    200,
    doctor.autoApproveUpdates ? "Profile updates will go live without review" : "Profile updates will need approval",
    await doctorDetails(doctor.id)
  );
});
