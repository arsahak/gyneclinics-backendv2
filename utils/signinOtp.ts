import crypto from "crypto";
import {
  User,
  EMAIL_REGEX,
  PLACEHOLDER_CUSTOMER_NAME,
  type IUser,
} from "../models/user.model";
import { SigninOtp, type ISigninOtp } from "../models/signinOtp.model";
import type { OtpChannel } from "../models/pendingSignup.model";
import { ApiError } from "./ApiError";
import { compareOtp, OTP_MAX_ATTEMPTS } from "./otp";

// The passwordless "sign in with a code" pieces, shared by the sign-in
// endpoints (auth.controller) and by the checkout that verifies a customer
// and places their order in one go (order.controller).

// A Bangladeshi mobile number in any of its usual spellings (01XXXXXXXXX,
// 1XXXXXXXXX, 8801XXXXXXXXX, +8801XXXXXXXXX); the capture is the part they
// all share.
export const BD_MOBILE_REGEX = /^(?:\+?880|0)?(1[3-9]\d{8})$/;

// Emails are lowercased; Bangladeshi mobiles become +8801XXXXXXXXX, the form
// the storefront saves phone numbers in.
export const signinKey = (identifier: unknown): string => {
  const value = String(identifier).trim();
  if (EMAIL_REGEX.test(value)) return value.toLowerCase();
  const bdMobile = value.match(BD_MOBILE_REGEX);
  return bdMobile ? `+880${bdMobile[1]}` : value;
};

// Accounts made before code sign-in may hold the same number in another
// spelling, so a phone lookup tries each of them.
export const findUserForSignin = (identifier: string) => {
  if (EMAIL_REGEX.test(identifier)) return User.findOne({ email: identifier });
  const bdMobile = identifier.match(BD_MOBILE_REGEX);
  const spellings = bdMobile
    ? [`+880${bdMobile[1]}`, `880${bdMobile[1]}`, `0${bdMobile[1]}`]
    : [identifier];
  return User.findOne({ phone: { $in: spellings } });
};

export const assertCanSigninAsCustomer = (user: IUser | null) => {
  if (!user) return;
  if (user.role !== "customer") {
    throw new ApiError(
      403,
      "This email or phone number can't be used to sign in here"
    );
  }
  if (user.isActive === false) {
    throw new ApiError(403, "Your account is inactive. Please contact support");
  }
};

// Checks the code a customer typed against the one sent to this email/phone.
// Throws why it can't be accepted; a correct code is NOT used up here — the
// caller deletes the returned record once whatever it unlocks has gone
// through.
export const checkSigninOtp = async (
  identifier: string,
  otp: unknown
): Promise<ISigninOtp> => {
  const pending = await SigninOtp.findOne({ identifier });
  if (!pending) {
    throw new ApiError(
      400,
      "No sign-in code requested for this email/phone. Please request a new one."
    );
  }

  if (pending.otpExpiresAt.getTime() < Date.now()) {
    throw new ApiError(400, "This OTP has expired. Please request a new one.");
  }

  if (pending.attempts >= OTP_MAX_ATTEMPTS) {
    await pending.deleteOne();
    throw new ApiError(
      429,
      "Too many incorrect attempts. Please request a new OTP."
    );
  }

  if (!(await compareOtp(String(otp), pending.otpHash))) {
    pending.attempts += 1;
    await pending.save();
    throw new ApiError(400, "Incorrect OTP.");
  }

  return pending;
};

// The customer account behind a confirmed email/phone: the existing one, or
// a new one when there is none — which is all "signing up" is here.
export const findOrCreateCustomer = async (
  identifier: string,
  channel: OtpChannel
): Promise<{ user: IUser; isNewUser: boolean }> => {
  const existing = await findUserForSignin(identifier);
  if (existing) {
    assertCanSigninAsCustomer(existing);
    return { user: existing, isNewUser: false };
  }

  const user = await User.create({
    // No name is asked for at sign-in; their first order or their profile
    // fills it in.
    firstName: PLACEHOLDER_CUSTOMER_NAME,
    email: channel === "email" ? identifier : undefined,
    phone: channel === "phone" ? identifier : undefined,
    // The schema requires a password. Nobody knows this one, so the account
    // can only be entered with a code.
    password: crypto.randomBytes(32).toString("hex"),
    role: "customer",
  });
  return { user, isNewUser: true };
};
