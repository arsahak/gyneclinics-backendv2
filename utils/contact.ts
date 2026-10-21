import { User } from "../models/user.model";
import { ApiError } from "./ApiError";

/** Throws 409 if the phone or email already belongs to another account. */
export async function assertContactFree(phone?: string, email?: string, exceptUserId?: string) {
  const notMe = exceptUserId ? { _id: { $ne: exceptUserId } } : {};
  if (phone && (await User.exists({ phone, ...notMe }))) {
    throw new ApiError(409, "This phone number is already registered");
  }
  if (email && (await User.exists({ email: email.toLowerCase(), ...notMe }))) {
    throw new ApiError(409, "This email is already registered");
  }
}
