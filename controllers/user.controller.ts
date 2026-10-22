import type { Request, Response } from "express";
import { User } from "../models/user.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { Doctor } from "../models/doctor.model";
import { photoNeedsReview, stagePhoto, stagePhotoRemoval } from "../utils/doctorUpdates";
import { deleteStoredFile, uploadImage } from "../utils/storage";

/** The approved doctor profile whose photo changes wait for review, if any. */
async function reviewedDoctorFor(user: Express.Request["user"]) {
  if (user?.role !== "doctor") return null;
  const doctor = await Doctor.findOne({ user: user._id });
  return doctor && photoNeedsReview(doctor) ? doctor : null;
}

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  return ApiResponse(res, 200, "Profile fetched successfully", req.user);
});

// General settings: any authenticated user editing their own account.
export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const requester = req.user!;
  const { fullName, email, phone, address, country } = req.body;

  if (email && email.toLowerCase() !== requester.email) {
    const existing = await User.findOne({ email: String(email).toLowerCase() });
    if (existing) throw new ApiError(409, "Email is already registered");
  }

  if (phone && phone !== requester.phone) {
    const existing = await User.findOne({ phone });
    if (existing) throw new ApiError(409, "Phone number is already registered");
  }

  if (fullName !== undefined) requester.fullName = fullName;
  // A changed email or phone has to be verified again.
  if (email !== undefined && email.toLowerCase() !== requester.email) {
    requester.email = email;
    requester.emailVerified = false;
  }
  if (phone !== undefined && phone !== requester.phone) {
    requester.phone = phone;
    requester.phoneVerified = false;
  }
  if (address !== undefined) requester.address = address;
  if (country !== undefined) requester.country = country;

  await requester.save();

  return ApiResponse(res, 200, "Profile updated successfully", requester);
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;

  const requester = await User.findById(req.user!.id).select("+password");
  if (!requester) throw new ApiError(401, "User no longer exists");

  const matches = await requester.comparePassword(currentPassword);
  if (!matches) throw new ApiError(401, "Current password is incorrect");

  requester.password = newPassword;
  await requester.save();

  return ApiResponse(res, 200, "Password updated successfully");
});

// Self-service account deletion: any authenticated user removing their own
// account. The User model also deletes the patient/doctor profile. Staff removing *other* staff accounts goes
// through deleteStaff above instead.
export const deleteMe = asyncHandler(async (req: Request, res: Response) => {
  const requester = req.user!;
  const avatarKey = requester.avatarKey;

  await requester.deleteOne();
  if (avatarKey) await deleteStoredFile(avatarKey);

  return ApiResponse(res, 200, "Account deleted successfully");
});

export const updateAvatar = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new ApiError(422, "Choose an image to upload");

  const requester = req.user!;
  const previousAvatarKey = requester.avatarKey;

  const uploaded = await uploadImage(req.file, "avatars", { square: 400 });

  // An approved doctor's new photo waits for an admin before patients see it.
  const doctor = await reviewedDoctorFor(requester);
  if (doctor) {
    try {
      await stagePhoto(doctor, uploaded);
    } catch (err) {
      await deleteStoredFile(uploaded.key);
      throw err;
    }
    return ApiResponse(res, 200, "Photo sent for review", { ...requester.toJSON(), inReview: true });
  }

  requester.avatar = uploaded.url;
  requester.avatarKey = uploaded.key;

  try {
    await requester.save();
  } catch (err) {
    await deleteStoredFile(uploaded.key);
    throw err;
  }

  if (previousAvatarKey) await deleteStoredFile(previousAvatarKey);

  return ApiResponse(res, 200, "Photo updated", requester);
});

export const removeAvatar = asyncHandler(async (req: Request, res: Response) => {
  const requester = req.user!;

  const doctor = await reviewedDoctorFor(requester);
  if (doctor) {
    await stagePhotoRemoval(doctor, requester);
    return ApiResponse(res, 200, "Photo change sent for review", { ...requester.toJSON(), inReview: true });
  }

  const previousAvatarKey = requester.avatarKey;
  requester.avatar = "";
  requester.avatarKey = "";
  await requester.save();
  if (previousAvatarKey) await deleteStoredFile(previousAvatarKey);

  return ApiResponse(res, 200, "Photo removed", requester);
});
