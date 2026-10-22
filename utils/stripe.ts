import Stripe from "stripe";
import { env } from "../config/env";
import { ApiError } from "./ApiError";

// One Stripe client for the whole API. Patients pay the platform account; each
// doctor has a Stripe Connect (Express) account that we transfer their share to.

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!env.stripe.secretKey) throw new ApiError(503, "Payments aren't set up yet. Please try again later.");
  client ??= new Stripe(env.stripe.secretKey);
  return client;
}

export const stripeMode = (): "test" | "live" => (/^(sk|rk)_live_/.test(env.stripe.secretKey) ? "live" : "test");

/** A link to an object in the Stripe dashboard, e.g. stripeUrl("payments/pi_123"). */
export const stripeUrl = (path: string) => `https://dashboard.stripe.com/${stripeMode() === "test" ? "test/" : ""}${path}`;

/** GBP and USD use pence/cents. */
export const toMinor = (amount: number) => Math.round(amount * 100);
export const fromMinor = (amount: number) => Math.round(amount) / 100;

/** A Stripe error as a message people can act on. */
export function stripeError(error: unknown, fallback: string): ApiError {
  if (error instanceof ApiError) return error;
  const e = error as { type?: string; code?: string; message?: string; statusCode?: number };
  if (/signed up for Connect/i.test(e?.message ?? "")) {
    console.error("Stripe Connect isn't enabled on this Stripe account: turn it on at https://dashboard.stripe.com/connect");
    return new ApiError(503, "Payouts through Stripe aren't switched on yet. Please try again later.");
  }
  if (e?.code === "balance_insufficient") {
    return new ApiError(409, "Your Stripe balance is too low to send this. Wait for payments to become available in Stripe, then try again.");
  }
  if (e?.type?.startsWith("Stripe")) return new ApiError(e.statusCode && e.statusCode < 500 ? 422 : 502, e.message || fallback);
  return new ApiError(502, fallback);
}
