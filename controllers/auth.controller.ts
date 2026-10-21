import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { isStaffRole, User, type IUser } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { generateSignupToken, generateToken, verifySignupToken } from "../utils/generateToken";
import { sessionFor } from "../utils/session";
import { checkOtp, sendOtp } from "../utils/phoneOtp";

// Patients and doctors sign in with their phone:
//   1. POST /auth/otp/send     → SMS code
//   2. POST /auth/otp/verify   → known number: logged in
//                                new number:   signupToken
//   3. POST /auth/register     → signupToken + role + name creates the account
// Staff sign in with email and password at POST /auth/staff/login.

const assertCanSignIn = (user: IUser) => {
  if (!user.isActive) throw new ApiError(403, "Your account has been deactivated");
};

export const sendOtpCode = asyncHandler(async (req: Request, res: Response) => {
  await sendOtp(req.body.phone);
  return ApiResponse(res, 200, "Verification code sent", { phone: req.body.phone });
});

export const verifyOtpCode = asyncHandler(async (req: Request, res: Response) => {
  const { phone, code } = req.body;

  const approved = await checkOtp(phone, code);
  if (!approved) throw new ApiError(400, "That code is incorrect or has expired");

  const user = await User.findOne({ phone });

  if (!user) {
    // New number: the app asks for role and name, then calls /auth/register.
    return ApiResponse(res, 200, "Phone verified. Create your account to continue", {
      isNewUser: true,
      phone,
      signupToken: generateSignupToken(phone),
    });
  }

  if (isStaffRole(user.role)) {
    throw new ApiError(403, "Staff accounts sign in with email and password");
  }
  assertCanSignIn(user);

  user.phoneVerified = true;
  user.lastLoginAt = new Date();
  await user.save();

  return ApiResponse(res, 200, "Signed in successfully", {
    isNewUser: false,
    token: generateToken({ id: user.id, role: user.role }),
    ...(await sessionFor(user)),
  });
});

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { signupToken, role, fullName } = req.body;

  const phone = verifySignupToken(signupToken);
  if (!phone) {
    throw new ApiError(401, "Your verification has expired. Please request a new code");
  }

  if (await User.exists({ phone })) {
    throw new ApiError(409, "An account already exists for this number. Please sign in");
  }

  let user: IUser;
  try {
    user = await User.create({
      fullName: fullName || "",
      phone,
      phoneVerified: true,
      role,
      lastLoginAt: new Date(),
    });
  } catch (error) {
    // Two register calls with the same token at once.
    if ((error as { code?: number }).code === 11000) {
      throw new ApiError(409, "An account already exists for this number. Please sign in");
    }
    throw error;
  }

  return ApiResponse(res, 201, "Account created successfully", {
    token: generateToken({ id: user.id, role: user.role }),
    ...(await sessionFor(user)),
  });
});

export const staffLogin = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: String(email).toLowerCase() }).select("+password");
  // Same message for every failure, so the form doesn't reveal which emails exist.
  if (!user || !isStaffRole(user.role) || !(await user.comparePassword(password))) {
    throw new ApiError(401, "Incorrect email or password");
  }
  assertCanSignIn(user);

  user.lastLoginAt = new Date();
  await user.save();

  return ApiResponse(res, 200, "Signed in successfully", {
    token: generateToken({ id: user.id, role: user.role }),
    user,
  });
});

export const getSession = asyncHandler(async (req: Request, res: Response) => {
  return ApiResponse(res, 200, "Session fetched successfully", await sessionFor(req.user!));
});

export const acceptConsent = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  if (!user.consentAt) {
    user.consentAt = new Date();
    await user.save();
  }
  return ApiResponse(res, 200, "Consent recorded", await sessionFor(user));
});
