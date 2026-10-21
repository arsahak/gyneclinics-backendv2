import type { IDoctor, IPendingUpdate } from "../models/doctor.model";
import { Doctor } from "../models/doctor.model";
import type { IUser } from "../models/user.model";
import { ApiError } from "./ApiError";
import { deleteStoredFile, type StoredFile } from "./storage";

// Review of an approved doctor's profile edits. Patients see the live profile;
// edits wait in `pendingUpdate` until an admin approves them. With
// `autoApproveUpdates` on, only the registration fields wait.

/** Profile fields a doctor (or admin) can edit. */
export const PROFILE_FIELDS = [
  "title",
  "specialization",
  "focusAreas",
  "qualifications",
  "experienceYears",
  "registrationNumber",
  "registrationBody",
  "clinic",
  "city",
  "country",
  "languages",
  "about",
  "feeGBP",
] as const;

/** Fields shown to patients, so an approved doctor's edits to them are reviewed. */
export const REVIEWED_FIELDS = ["fullName", ...PROFILE_FIELDS] as const;
export type ReviewedField = (typeof REVIEWED_FIELDS)[number];

/** Always reviewed, even with auto-approve on. */
export const VERIFIED_FIELDS = ["registrationNumber", "registrationBody", "qualifications"] as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function liveValue(doctor: IDoctor, user: IUser, field: ReviewedField) {
  if (field === "fullName") return user.fullName;
  const value = doctor.get(field);
  return Array.isArray(value) ? [...value] : value;
}

/** Whether an edit to this field waits for an admin. */
export function fieldNeedsReview(doctor: IDoctor, field: ReviewedField) {
  if (doctor.verificationStatus !== "approved") return false;
  return !doctor.autoApproveUpdates || (VERIFIED_FIELDS as readonly string[]).includes(field);
}

/** Whether a new or removed photo waits for an admin. */
export function photoNeedsReview(doctor: IDoctor) {
  return doctor.verificationStatus === "approved" && !doctor.autoApproveUpdates;
}

/** Saves `pending`, or clears it when nothing is left to review. */
function setPending(doctor: IDoctor, pending: IPendingUpdate | null) {
  const empty = !pending || (Object.keys(pending.fields ?? {}).length === 0 && pending.avatar === undefined);
  doctor.set("pendingUpdate", empty ? undefined : { ...pending, submittedAt: new Date() });
  doctor.markModified("pendingUpdate");
  // A new update replaces the last rejection.
  doctor.set("updateRejection", undefined);
}

/** Throws 409 when another doctor already has this registration. */
async function assertRegistrationFree(doctor: IDoctor, fields: Record<string, unknown>) {
  if (fields.registrationNumber === undefined && fields.registrationBody === undefined) return;
  const taken = await Doctor.exists({
    _id: { $ne: doctor._id },
    registrationNumber: fields.registrationNumber ?? doctor.registrationNumber,
    registrationBody: fields.registrationBody ?? doctor.registrationBody,
  });
  if (taken) throw new ApiError(409, "This registration number is already used by another doctor");
}

/**
 * Adds edits that need review to the doctor's pending update (not saved).
 * An edit back to the live value drops it from the update. Returns true when
 * something is waiting for review.
 */
export async function stageFields(doctor: IDoctor, user: IUser, edits: Partial<Record<ReviewedField, unknown>>) {
  const fields = { ...(doctor.pendingUpdate?.fields ?? {}) };
  for (const [field, value] of Object.entries(edits) as Array<[ReviewedField, unknown]>) {
    if (same(value, liveValue(doctor, user, field))) delete fields[field];
    else fields[field] = value;
  }
  await assertRegistrationFree(doctor, fields);
  setPending(doctor, { ...(doctor.pendingUpdate ?? { submittedAt: new Date() }), fields });
  return Boolean(doctor.pendingUpdate);
}

/** Sends a new photo for review (saves the doctor). */
export async function stagePhoto(doctor: IDoctor, photo: StoredFile) {
  const previousKey = doctor.pendingUpdate?.avatarKey;
  setPending(doctor, {
    fields: doctor.pendingUpdate?.fields ?? {},
    submittedAt: new Date(),
    avatar: photo.url,
    avatarKey: photo.key,
  });
  await doctor.save();
  await deleteStoredFile(previousKey);
}

/** Asks to remove the photo, or drops a photo that's still in review (saves the doctor). */
export async function stagePhotoRemoval(doctor: IDoctor, user: IUser) {
  const previousKey = doctor.pendingUpdate?.avatarKey;
  const { avatar: _avatar, avatarKey: _key, ...rest } = doctor.pendingUpdate ?? { fields: {}, submittedAt: new Date() };
  setPending(doctor, user.avatar ? { ...rest, avatar: "" } : rest);
  await doctor.save();
  await deleteStoredFile(previousKey);
}

/** Makes the pending update live (saves the doctor and user). */
export async function approvePendingUpdate(doctor: IDoctor, user: IUser) {
  const pending = doctor.pendingUpdate;
  if (!pending) throw new ApiError(409, "This doctor has no update to review");

  // Mongoose drops an empty `fields` object on save (photo-only update).
  for (const [field, value] of Object.entries(pending.fields ?? {})) {
    if (field === "fullName") user.fullName = String(value);
    else if ((PROFILE_FIELDS as readonly string[]).includes(field)) doctor.set(field, value);
  }
  const previousAvatarKey = pending.avatar !== undefined ? user.avatarKey : undefined;
  if (pending.avatar !== undefined) {
    user.avatar = pending.avatar;
    user.avatarKey = pending.avatarKey ?? "";
  }
  doctor.set("pendingUpdate", undefined);
  doctor.set("updateRejection", undefined);

  try {
    await doctor.save();
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new ApiError(409, "This registration number is already used by another doctor");
    }
    throw error;
  }
  if (user.isModified()) await user.save();
  await deleteStoredFile(previousAvatarKey);
}

/** Turns the pending update down; the live profile stays as it is (saves the doctor). */
export async function rejectPendingUpdate(doctor: IDoctor, reason?: string) {
  const pending = doctor.pendingUpdate;
  if (!pending) throw new ApiError(409, "This doctor has no update to review");
  doctor.set("pendingUpdate", undefined);
  doctor.set("updateRejection", { reason: reason || undefined, at: new Date() });
  await doctor.save();
  await deleteStoredFile(pending.avatarKey);
}
