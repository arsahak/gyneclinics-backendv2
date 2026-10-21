import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { Consultation } from "../models/consultation.model";
import { Doctor } from "../models/doctor.model";
import { User } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { sendSms } from "../utils/sms";

/** "Thu 22 Oct, 7:30 PM" in the patient's time zone. */
function formatStart(date: Date, timeZone: string) {
  const day = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short" }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", minute: "2-digit", hour12: true })
    .format(date)
    .toUpperCase();
  return `${day}, ${time}`;
}

/** Short, with no health details: SMS isn't private. */
function confirmationText(doctorName: string, mode: string, startsAt: Date, timeZone: string, reference: string) {
  const when = mode === "instant" ? "Your chat is open now" : `It starts ${formatStart(startsAt, timeZone)}`;
  return `GyneClinics: Your consultation with ${doctorName} is confirmed. ${when}. Ref ${reference}`;
}

/** "+44 77•• •••123" */
const maskPhone = (phone: string) => `${phone.slice(0, -6)}•••${phone.slice(-3)}`;

/**
 * The patient's payment went through: save the booking and text them a
 * confirmation. A failed text doesn't undo the booking.
 */
export const createConsultation = asyncHandler(async (req: Request, res: Response) => {
  const patient = req.user!;
  const b = req.body;

  const doctor = await Doctor.findOne({ _id: b.doctorId, verificationStatus: "approved" });
  const doctorUser = doctor && (await User.findOne({ _id: doctor.user, isActive: true }));
  if (!doctor || !doctorUser) throw new ApiError(404, "This doctor isn't available for booking");
  if (doctor.messaging?.consultation === false) throw new ApiError(409, "This doctor isn't taking consultations right now");

  const startsAt: Date = b.mode === "instant" ? new Date() : b.startsAt;
  if (b.mode === "scheduled" && startsAt.getTime() < Date.now() - 5 * 60_000) {
    throw new ApiError(422, "That time has already passed. Please pick another slot");
  }

  let consultation;
  try {
    consultation = await Consultation.create({
      reference: b.reference,
      patient: patient._id,
      doctor: doctor._id,
      mode: b.mode,
      concern: b.concern,
      startsAt,
      timezone: b.timezone || "Europe/London",
      payment: b.payment,
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new ApiError(409, "This booking was already saved");
    throw error;
  }

  const phone = patient.phone ?? "";
  const text = confirmationText(
    doctorUser.fullName || "your doctor",
    consultation.mode,
    consultation.startsAt,
    consultation.timezone,
    consultation.reference
  );
  const sms = phone ? await sendSms(phone, text) : ({ status: "skipped", reason: "No phone number" } as const);
  consultation.confirmationSms = {
    status: sms.status,
    to: phone || "-",
    sid: sms.status === "sent" ? sms.sid : undefined,
    error: sms.status === "failed" ? sms.error : sms.status === "skipped" ? sms.reason : undefined,
    at: new Date(),
  };
  await consultation.save();

  return ApiResponse(res, 201, "Consultation booked", {
    consultation,
    sms: { status: sms.status, to: phone ? maskPhone(phone) : "" },
  });
});
