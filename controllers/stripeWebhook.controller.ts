import type { Request, Response } from "express";
import type Stripe from "stripe";
import { env } from "../config/env";
import { connectDB } from "../config/db";
import { Consultation } from "../models/consultation.model";
import { Doctor } from "../models/doctor.model";
import { Withdrawal } from "../models/withdrawal.model";
import { ApiError } from "../utils/ApiError";
import { bookFromPaymentIntent } from "../utils/booking";
import { syncStripeAccount } from "../utils/connect";
import { stripe } from "../utils/stripe";
import { alertStaff, moneyText } from "../utils/staffAlerts";

// POST /api/v1/stripe/webhook (raw body, signed by Stripe). In the Stripe
// dashboard, add two endpoints with this URL (see STRIPE_SETUP.md): one for
// "Your account" (STRIPE_WEBHOOK_SECRET) and one for "Connected accounts"
// (STRIPE_CONNECT_WEBHOOK_SECRET). Events:
//   payment_intent.succeeded  a patient paid: save the booking if the app didn't
//   charge.refunded           refunded straight in Stripe: mark the booking refunded
//   account.updated           a doctor's Stripe account changed: refresh its status
//   transfer.reversed         a payout was pulled back: the money returns to their balance

async function handle(event: Stripe.Event) {
  switch (event.type) {
    case "payment_intent.succeeded": {
      const intent = event.data.object;
      if (intent.metadata?.kind !== "consultation") return;
      try {
        await bookFromPaymentIntent(intent.id);
      } catch (error) {
        // Nothing to retry for (no checkout, mismatch): log it for support.
        if (error instanceof ApiError && error.statusCode < 500) console.error(`Stripe ${intent.id}: ${error.message}`);
        else throw error;
      }
      return;
    }
    case "charge.refunded": {
      const charge = event.data.object;
      const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (!intentId || !charge.refunded) return;
      const consultation = await Consultation.findOne({ "payment.stripePaymentIntentId": intentId });
      if (!consultation || consultation.status === "refunded") return;
      consultation.status = "refunded";
      consultation.refund = { at: new Date(), reason: "Refunded in Stripe", stripeRefundId: charge.refunds?.data?.[0]?.id };
      await consultation.save();
      await alertStaff({
        type: "payment_refunded",
        areas: ["payments"],
        title: `Refunded ${moneyText(consultation.payment.amount, consultation.payment.currency)} in Stripe`,
        body: `${consultation.reference} was refunded straight in the Stripe dashboard.`,
        link: "/payments",
      });
      return;
    }
    case "account.updated": {
      const account = event.data.object;
      const doctor = await Doctor.findOne({ "stripeAccount.id": account.id });
      if (doctor) await syncStripeAccount(doctor, account);
      return;
    }
    case "transfer.reversed": {
      const transfer = event.data.object;
      const w = await Withdrawal.findOne({ stripeTransferId: transfer.id });
      if (!w || w.status !== "paid") return;
      w.status = "rejected";
      w.rejectionReason = "The Stripe transfer was reversed.";
      await w.save();
      return;
    }
    default:
      return;
  }
}

export async function stripeWebhook(req: Request, res: Response) {
  const secrets = [env.stripe.webhookSecret, env.stripe.connectWebhookSecret].filter(Boolean);
  if (!secrets.length) return res.status(503).json({ success: false, message: "Stripe webhook isn't set up" });
  // Either endpoint (our account, or connected accounts) may send to this URL.
  let event: Stripe.Event | null = null;
  for (const secret of secrets) {
    try {
      event = stripe().webhooks.constructEvent(req.body as Buffer, String(req.headers["stripe-signature"] ?? ""), secret);
      break;
    } catch {
      // try the next secret
    }
  }
  if (!event) return res.status(400).json({ success: false, message: "Invalid Stripe signature" });
  try {
    await connectDB();
    await handle(event);
    return res.json({ received: true });
  } catch (error) {
    // 500 makes Stripe try again later.
    console.error(`Stripe webhook ${event.type}: ${(error as Error).message}`);
    return res.status(500).json({ success: false, message: "Webhook failed" });
  }
}
