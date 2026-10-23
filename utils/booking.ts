import mongoose from "mongoose";
import type Stripe from "stripe";
import { Checkout } from "../models/checkout.model";
import { Consultation, type IConsultation, type IConsultationPayment } from "../models/consultation.model";
import { Doctor, type IDoctor } from "../models/doctor.model";
import { User, type IUser } from "../models/user.model";
import { ApiError } from "./ApiError";
import { getFees } from "./money";
import { isAutoOn, linkFor, notify } from "./notify";
import { sendSms } from "./sms";
import { fromMinor, stripe } from "./stripe";
import { alertStaff, moneyText } from "./staffAlerts";

// Saving a booking, shared by free bookings (POST /consultations), the app
// confirming a Stripe payment, and the Stripe webhook.

/** "Thu 22 Oct, 7:30 PM" in the patient's time zone. */
export function formatStart(date: Date, timeZone: string) {
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
export const maskPhone = (phone: string) => `${phone.slice(0, -6)}•••${phone.slice(-3)}`;

export type BookingSms = { status: "sent" | "failed" | "skipped"; to: string };

/** An approved doctor (with an active account) who takes consultations, or a 404/409. */
export async function bookableDoctor(doctorId: unknown): Promise<{ doctor: IDoctor; doctorUser: IUser }> {
  const doctor = await Doctor.findOne({ _id: doctorId, verificationStatus: "approved" });
  const doctorUser = doctor && (await User.findOne({ _id: doctor.user, isActive: true }));
  if (!doctor || !doctorUser) throw new ApiError(404, "This doctor isn't available for booking");
  if (doctor.messaging?.consultation === false) throw new ApiError(409, "This doctor isn't taking consultations right now");
  return { doctor, doctorUser };
}

const BOOKED = { mode: "scheduled", status: { $in: ["confirmed", "completed"] } };

/** Start times of a doctor's upcoming scheduled bookings, so patients only see free slots. */
export async function bookedStarts(doctorId: unknown): Promise<Date[]> {
  return Consultation.find({ ...BOOKED, doctor: doctorId, startsAt: { $gte: new Date() } }).distinct("startsAt");
}

/** Refuses a scheduled slot someone else already has. */
export async function assertSlotFree(doctorId: unknown, startsAt: Date) {
  if (await Consultation.exists({ ...BOOKED, doctor: doctorId, startsAt })) {
    throw new ApiError(409, "Someone has just booked this time. Please pick another slot");
  }
}

/** "GC-" and 6 letters or digits nobody has used yet. */
export async function newBookingReference(): Promise<string> {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (;;) {
    const reference = `GC-${Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")}`;
    const taken = (await Consultation.exists({ reference })) || (await Checkout.exists({ reference }));
    if (!taken) return reference;
  }
}

interface BookingInput {
  reference: string;
  patient: IUser;
  doctor: IDoctor;
  doctorUser: IUser;
  mode: IConsultation["mode"];
  concern: string;
  startsAt: Date;
  timezone: string;
  payment: IConsultationPayment;
}

/** Saves the booking, then texts and notifies. A failed text doesn't undo the booking. */
export async function saveBooking(input: BookingInput): Promise<{ consultation: IConsultation; sms: BookingSms }> {
  const { patient, doctor, doctorUser } = input;
  const consultation = await Consultation.create({
    reference: input.reference,
    patient: patient._id,
    doctor: doctor._id,
    mode: input.mode,
    concern: input.concern,
    startsAt: input.startsAt,
    timezone: input.timezone || "Europe/London",
    payment: input.payment,
    // The rate when booked, so later changes in Fees & Commission don't rewrite it.
    commissionRate: doctor.commissionOverride?.rate ?? (await getFees()).commissionRate,
  });

  const phone = patient.phone ?? "";
  const doctorName = doctorUser.fullName || "your doctor";
  const smsOn = await isAutoOn("booking_confirmed");
  const sms = !smsOn
    ? ({ status: "skipped", reason: "Booking texts are switched off" } as const)
    : phone
      ? await sendSms(phone, confirmationText(doctorName, consultation.mode, consultation.startsAt, consultation.timezone, consultation.reference))
      : ({ status: "skipped", reason: "No phone number" } as const);
  const when = consultation.mode === "instant" ? "now" : formatStart(consultation.startsAt, consultation.timezone);
  await Promise.all([
    notify([patient._id as mongoose.Types.ObjectId], {
      autoKey: "booking_confirmed",
      title: "Booking confirmed",
      body: `Your consultation with ${doctorName} is confirmed. It starts ${when}. Ref ${consultation.reference}`,
      link: linkFor("consultations", "patient"),
    }),
    notify([doctorUser._id as mongoose.Types.ObjectId], {
      autoKey: "doctor_new_booking",
      title: "New consultation",
      body: `${patient.fullName || "A patient"} booked you for ${formatStart(consultation.startsAt, "Europe/London")} (UK time). Ref ${consultation.reference}`,
      link: linkFor("messages", "doctor"),
    }),
  ]);
  const paid = input.payment.amount > 0;
  await alertStaff({
    type: "consultation_booked",
    areas: ["consultations", "payments"],
    title: paid ? `New booking · ${moneyText(input.payment.amount, input.payment.currency)} paid` : "New free booking",
    body: `${patient.fullName || "A patient"} booked ${doctorName} · ${consultation.mode === "instant" ? "chat now" : `${formatStart(consultation.startsAt, "Europe/London")} UK`} · Ref ${consultation.reference}`,
    link: paid ? "/payments" : "/consultations",
  });
  consultation.confirmationSms = {
    status: sms.status,
    to: phone || "-",
    sid: sms.status === "sent" ? sms.sid : undefined,
    error: sms.status === "failed" ? sms.error : sms.status === "skipped" ? sms.reason : undefined,
    at: new Date(),
  };
  await consultation.save();
  return { consultation, sms: { status: sms.status, to: phone ? maskPhone(phone) : "" } };
}

/** "Visa •••• 4242", "Apple Pay · Visa •••• 4242", and which kind of method it was. */
function describeCharge(charge: Stripe.Charge | null): { method: string; details: string } {
  const pm = charge?.payment_method_details;
  if (!pm) return { method: "card", details: "Stripe" };
  if (pm.type === "card" && pm.card) {
    const brand = pm.card.brand ? pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1) : "Card";
    const card = `${brand} •••• ${pm.card.last4 ?? ""}`.trim();
    const wallet = pm.card.wallet?.type;
    if (wallet) {
      const name = wallet === "apple_pay" ? "Apple Pay" : wallet === "google_pay" ? "Google Pay" : wallet.replace(/_/g, " ");
      return { method: "wallet", details: `${name} · ${card}` };
    }
    return { method: "card", details: card };
  }
  if (pm.type === "link") return { method: "card", details: "Link" };
  return { method: "local", details: pm.type.replace(/_/g, " ") };
}

export type PaidBooking = { consultation: IConsultation; sms?: BookingSms; created: boolean };

/**
 * Turns a paid Stripe payment into its booking. Safe to call more than once
 * (the app and the webhook both do): the second call returns the same booking.
 */
export async function bookFromPaymentIntent(paymentIntentId: string): Promise<PaidBooking> {
  const existing = await Consultation.findOne({ "payment.stripePaymentIntentId": paymentIntentId });
  if (existing) return { consultation: existing, created: false };

  const checkout = await Checkout.findOne({ paymentIntentId });
  if (!checkout) throw new ApiError(404, "We couldn't find this booking. If you were charged, contact support and we'll sort it out.");

  const intent = await stripe().paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
  if (intent.status === "processing") throw new ApiError(202, "Your payment is still processing. We'll confirm your booking as soon as it clears.");
  if (intent.status !== "succeeded") throw new ApiError(402, "Your payment didn't go through. You haven't been charged.");
  if (fromMinor(intent.amount_received) !== checkout.amount || intent.currency.toUpperCase() !== checkout.currency) {
    throw new ApiError(409, "The amount paid doesn't match this booking. Please contact support.");
  }

  const [patient, doctorRow] = await Promise.all([User.findById(checkout.patient), Doctor.findById(checkout.doctor)]);
  const doctorUser = doctorRow && (await User.findById(doctorRow.user));
  if (!patient || !doctorRow || !doctorUser) throw new ApiError(404, "The patient or doctor on this booking no longer exists. Refund it in Stripe.");

  const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  const { method, details } = describeCharge(charge);
  try {
    const result = await saveBooking({
      reference: checkout.reference,
      patient,
      doctor: doctorRow,
      doctorUser,
      mode: checkout.mode,
      concern: checkout.concern,
      // An instant chat starts when it's paid for.
      startsAt: checkout.mode === "instant" ? new Date() : checkout.startsAt,
      timezone: checkout.timezone,
      payment: {
        amount: checkout.amount,
        currency: checkout.currency,
        regionId: checkout.regionId,
        method,
        details,
        reference: intent.id,
        paidAt: new Date((charge?.created ?? intent.created) * 1000),
        provider: "stripe",
        stripePaymentIntentId: intent.id,
        stripeChargeId: charge?.id,
      },
    });
    checkout.consultation = result.consultation._id as mongoose.Types.ObjectId;
    await checkout.save();
    return { ...result, created: true };
  } catch (error) {
    // The app and the webhook raced: the other one saved it first.
    if ((error as { code?: number }).code === 11000) {
      const saved = await Consultation.findOne({ "payment.stripePaymentIntentId": paymentIntentId });
      if (saved) return { consultation: saved, created: false };
    }
    throw error;
  }
}
