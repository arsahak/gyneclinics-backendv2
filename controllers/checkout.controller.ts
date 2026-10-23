import type { Request, Response } from "express";
import { env } from "../config/env";
import { asyncHandler } from "../middleware/asyncHandler";
import { Checkout } from "../models/checkout.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { assertSlotFree, bookableDoctor, bookFromPaymentIntent, newBookingReference } from "../utils/booking";
import { getFees } from "../utils/money";
import { regionalFee, type RegionId } from "../utils/regions";
import { stripe, stripeError, stripeMode, toMinor } from "../utils/stripe";

// Paying for a consultation with Stripe:
//   1. POST /consultations/checkout  → the price (worked out here, never sent by the app)
//      and a Stripe PaymentIntent; the app shows Stripe's card form with its client secret.
//   2. The patient pays in the browser (card, Apple Pay, Google Pay…).
//   3. POST /consultations/checkout/:id/confirm → the booking is saved once Stripe
//      says the money arrived. The webhook does the same if the page was closed.

export const startCheckout = asyncHandler(async (req: Request, res: Response) => {
  const patient = req.user!;
  const b = req.body;
  const { doctor, doctorUser } = await bookableDoctor(b.doctorId);
  const regionId = b.regionId as RegionId;
  const fee = regionalFee(doctor.feeGBP, regionId, (await getFees()).regionMultipliers);
  if (fee.amount <= 0) throw new ApiError(409, "This consultation is free, so there's nothing to pay.");

  const startsAt: Date = b.mode === "instant" ? new Date() : b.startsAt;
  if (b.mode === "scheduled" && startsAt.getTime() < Date.now() - 5 * 60_000) {
    throw new ApiError(422, "That time has already passed. Please pick another slot");
  }
  if (b.mode === "scheduled") await assertSlotFree(doctor._id, startsAt);

  const reference = await newBookingReference();
  const doctorName = doctorUser.fullName || "your doctor";
  let intent;
  try {
    intent = await stripe().paymentIntents.create({
      amount: toMinor(fee.amount),
      currency: fee.currency.toLowerCase(),
      // Card, Apple Pay, Google Pay and Link: all paid without leaving the page.
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      description: `GyneClinics consultation with ${doctorName} (${reference})`,
      ...(patient.email && { receipt_email: patient.email }),
      metadata: {
        kind: "consultation",
        reference,
        patientId: String(patient._id),
        doctorId: String(doctor._id),
        mode: b.mode,
        regionId,
      },
    });
  } catch (error) {
    throw stripeError(error, "We couldn't start the payment. Please try again.");
  }

  await Checkout.create({
    paymentIntentId: intent.id,
    reference,
    patient: patient._id,
    doctor: doctor._id,
    mode: b.mode,
    concern: b.concern,
    startsAt,
    timezone: b.timezone || "Europe/London",
    regionId,
    amount: fee.amount,
    currency: fee.currency,
  });

  return ApiResponse(res, 201, "Payment ready", {
    paymentIntentId: intent.id,
    clientSecret: intent.client_secret,
    publishableKey: env.stripe.publishableKey,
    mode: stripeMode(),
    reference,
    amount: fee.amount,
    currency: fee.currency,
  });
});

/** The patient paid: save the booking (or return it, if the webhook saved it first). */
export const confirmCheckout = asyncHandler(async (req: Request, res: Response) => {
  const checkout = await Checkout.findOne({ paymentIntentId: req.params.paymentIntentId });
  if (!checkout || String(checkout.patient) !== String(req.user!._id)) throw new ApiError(404, "Payment not found");
  try {
    const { consultation, sms, created } = await bookFromPaymentIntent(checkout.paymentIntentId);
    return ApiResponse(res, created ? 201 : 200, "Consultation booked", { consultation, sms: sms ?? null });
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 202) return ApiResponse(res, 202, error.message, { status: "processing" });
    throw error instanceof ApiError ? error : stripeError(error, "We couldn't check your payment. Please try again.");
  }
});
