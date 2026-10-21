import { Doctor, type IDoctor } from "../models/doctor.model";
import { Patient, type IPatient } from "../models/patient.model";
import type { IUser } from "../models/user.model";

/** Where the app should send the user next. Mirrors the webapp's onboarding order. */
export type NextStep =
  | "onboarding"
  | "consent"
  | "verification_pending"
  | "verification_rejected"
  | "home";

export type Profile = IPatient | IDoctor | null;

export const loadProfile = async (user: IUser): Promise<Profile> => {
  if (user.role === "patient") return Patient.findOne({ user: user._id });
  if (user.role === "doctor") return Doctor.findOne({ user: user._id });
  return null;
};

export const nextStepFor = (user: IUser, profile: Profile): NextStep => {
  if (user.role !== "patient" && user.role !== "doctor") return "home";
  if (!profile) return "onboarding";
  if (!user.consentAt) return "consent";
  if (user.role === "doctor") {
    const status = (profile as IDoctor).verificationStatus;
    if (status === "pending") return "verification_pending";
    if (status === "rejected") return "verification_rejected";
  }
  return "home";
};

/** User, their role profile and next step: the shape /auth/me returns. */
export const sessionFor = async (user: IUser, profile?: Profile) => {
  const resolved = profile === undefined ? await loadProfile(user) : profile;
  return { user, profile: resolved, nextStep: nextStepFor(user, resolved) };
};
