import type { Request, Response } from "express";
import { env } from "../config/env";
import { asyncHandler } from "../middleware/asyncHandler";
import { Consultation } from "../models/consultation.model";
import { Doctor } from "../models/doctor.model";
import type { IUser } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { consultationTimes } from "../utils/consultationStage";
import { openRoom, videoToken } from "../utils/video";

// Video calls:
//   - the camera and microphone check: a private room for one person;
//   - a consultation call: one room per consultation, only for its patient
//     and doctor, from shortly before the start until the session ends.

/** Length of the camera and microphone check (Twilio's shortest limit). */
export const TEST_CALL_MINUTES = 10;
/** Each person can stay this long per join; they can join again after. */
export const CONSULTATION_CALL_MINUTES = 60;
/** A scheduled consultation's call opens this long before it starts. */
export const CALL_OPENS_EARLY_MINUTES = 10;

/** "role|name|id": the app shows the name and role of the other person. */
function identityOf(user: IUser) {
  const name = (user.fullName || (user.role === "doctor" ? "Doctor" : "Patient")).replace(/\|/g, " ").slice(0, 60);
  return `${user.role}|${name}|${user.id}`;
}

/** Joins your own private room, to check your camera and microphone. */
export const joinTestCall = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const roomName = `${env.twilio.roomPrefix}-check-${user.id}`;
  await openRoom(roomName, { maxMinutes: TEST_CALL_MINUTES, maxParticipants: 1 });
  const identity = identityOf(user);
  return ApiResponse(res, 200, "Ready to check your camera and microphone", {
    token: videoToken(identity, roomName, TEST_CALL_MINUTES + 5),
    roomName,
    identity,
    maxMinutes: TEST_CALL_MINUTES,
  });
});

/** Joins the video call of one consultation (its patient or its doctor only). */
export const joinConsultationCall = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const reference = String(req.params.reference).trim().toUpperCase();
  const consultation = await Consultation.findOne({ reference });
  if (!consultation) throw new ApiError(404, "Consultation not found");

  // Only the people on the booking. Anyone else gets the same 404.
  let allowed = false;
  if (user.role === "patient") allowed = String(consultation.patient) === String(user._id);
  if (user.role === "doctor") {
    const doctor = await Doctor.findOne({ user: user._id }).select("_id");
    allowed = !!doctor && String(consultation.doctor) === String(doctor._id);
  }
  if (!allowed) throw new ApiError(404, "Consultation not found");

  if (consultation.status === "refunded" || consultation.status === "cancelled") {
    throw new ApiError(409, "This consultation was cancelled, so its video call is closed");
  }
  if (consultation.status === "completed") {
    throw new ApiError(409, "The doctor has closed this consultation. You can still message during the follow-up");
  }
  const now = Date.now();
  const opensAt = consultation.startsAt.getTime() - CALL_OPENS_EARLY_MINUTES * 60_000;
  if (now < opensAt) {
    throw new ApiError(409, `The video call opens ${CALL_OPENS_EARLY_MINUTES} minutes before the consultation starts`);
  }
  if (now >= consultationTimes(consultation.startsAt).sessionEndsAt.getTime()) {
    throw new ApiError(409, "This consultation's session has ended. You can still message during the follow-up");
  }

  const roomName = `${env.twilio.roomPrefix}-consult-${consultation.reference}`;
  await openRoom(roomName, { maxMinutes: CONSULTATION_CALL_MINUTES, maxParticipants: 2 });
  const identity = identityOf(user);
  return ApiResponse(res, 200, "Ready to join the consultation call", {
    token: videoToken(identity, roomName, CONSULTATION_CALL_MINUTES + 5),
    roomName,
    identity,
    maxMinutes: CONSULTATION_CALL_MINUTES,
  });
});
