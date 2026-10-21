import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { UserRole } from "../models/user.model";

/** Login token, sent as `Authorization: Bearer <token>`. */
export interface TokenPayload {
  id: string;
  role: UserRole;
}

export const generateToken = (payload: TokenPayload): string =>
  jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as jwt.SignOptions);

// Proves a phone number was verified by OTP, so /auth/register can create the
// account. It has `type: "signup"` and no user id, so `protect` never accepts
// it as a login token.
export interface SignupTokenPayload {
  type: "signup";
  phone: string;
}

export const generateSignupToken = (phone: string): string =>
  jwt.sign({ type: "signup", phone } satisfies SignupTokenPayload, env.jwtSecret, {
    expiresIn: env.signupTokenExpiresIn,
  } as jwt.SignOptions);

/** Returns the verified phone, or null if the token is invalid or expired. */
export const verifySignupToken = (token: string): string | null => {
  try {
    const payload = jwt.verify(token, env.jwtSecret) as Partial<SignupTokenPayload>;
    return payload.type === "signup" && payload.phone ? payload.phone : null;
  } catch {
    return null;
  }
};
