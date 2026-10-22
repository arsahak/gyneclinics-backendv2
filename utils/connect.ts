import type Stripe from "stripe";
import { env } from "../config/env";
import type { IDoctor, IStripeAccount } from "../models/doctor.model";
import type { IUser } from "../models/user.model";
import { ApiError } from "./ApiError";
import { stripe, stripeError } from "./stripe";

// Doctors get paid through Stripe Connect. Each doctor has an Express account:
// Stripe's own sign-up form collects their identity and bank account or debit
// card, and Stripe pays out to it. We only transfer their share to the account.

let platformCountry: string | null = null;

/** The country of our own Stripe account (GB). */
async function getPlatformCountry(): Promise<string> {
  if (!platformCountry) platformCountry = (await stripe().accounts.retrieveCurrent()).country ?? "GB";
  return platformCountry;
}

/** "Barclays •••• 6789" / "Visa debit •••• 4242" */
function destinationOf(external: Stripe.BankAccount | Stripe.Card | undefined): IStripeAccount["destination"] {
  if (!external) return undefined;
  if (external.object === "bank_account") {
    return { type: "bank_account", label: `${external.bank_name || "Bank account"} •••• ${external.last4}`, last4: external.last4, currency: external.currency };
  }
  const brand = external.brand || "Card";
  return { type: "card", label: `${brand}${external.funding === "debit" ? " debit" : ""} •••• ${external.last4}`, last4: external.last4, currency: external.currency ?? undefined };
}

/** Reads the account from Stripe and stores its status on the doctor. */
export async function syncStripeAccount(doctor: IDoctor, account?: Stripe.Account): Promise<IStripeAccount | undefined> {
  const id = account?.id ?? doctor.stripeAccount?.id;
  if (!id) return undefined;
  const a = account ?? (await stripe().accounts.retrieve(id));
  const externals = await stripe().accounts.listExternalAccounts(id, { limit: 10 });
  const preferred = externals.data.find((x) => x.default_for_currency) ?? externals.data[0];
  doctor.stripeAccount = {
    id,
    detailsSubmitted: Boolean(a.details_submitted),
    payoutsEnabled: Boolean(a.payouts_enabled),
    transfersActive: a.capabilities?.transfers === "active",
    requirementsDue: [...(a.requirements?.currently_due ?? []), ...(a.requirements?.past_due ?? [])].filter((v, i, all) => all.indexOf(v) === i),
    disabledReason: a.requirements?.disabled_reason ?? undefined,
    destination: destinationOf(preferred as Stripe.BankAccount | Stripe.Card | undefined),
    country: a.country ?? undefined,
    updatedAt: new Date(),
  };
  await doctor.save();
  return doctor.stripeAccount;
}

/** Like syncStripeAccount, but keeps the stored copy if Stripe can't be reached. */
export async function freshStripeAccount(doctor: IDoctor): Promise<IStripeAccount | undefined> {
  if (!doctor.stripeAccount?.id) return undefined;
  try {
    return await syncStripeAccount(doctor);
  } catch (error) {
    console.error(`Stripe account ${doctor.stripeAccount.id}: ${(error as Error).message}`);
    return doctor.stripeAccount;
  }
}

/** Ready to be paid: Stripe has their details and can send money to them. */
export const canBePaid = (a?: IStripeAccount | null) => Boolean(a?.transfersActive && a.payoutsEnabled);

/** What doctors and staff see (no Stripe ids). */
export function connectSummary(a?: IStripeAccount | null) {
  if (!a) return { status: "not_connected" as const, destination: null, requirementsDue: 0 };
  const status = canBePaid(a) ? ("ready" as const) : a.detailsSubmitted ? ("review" as const) : ("incomplete" as const);
  return { status, destination: a.destination?.label ?? null, requirementsDue: a.requirementsDue.length, disabledReason: a.disabledReason ?? null, updatedAt: a.updatedAt };
}

/** The doctor's Express account, made on first use. */
export async function ensureStripeAccount(doctor: IDoctor, user: IUser): Promise<string> {
  if (doctor.stripeAccount?.id) return doctor.stripeAccount.id;
  const home = await getPlatformCountry();
  const country = /^[A-Z]{2}$/.test(doctor.country ?? "") ? doctor.country : home;
  let account: Stripe.Account;
  try {
    account = await stripe().accounts.create({
      type: "express",
      country,
      email: user.email || undefined,
      business_type: "individual",
      capabilities: { transfers: { requested: true } },
      // Doctors outside the UK sign Stripe's recipient agreement (payouts only).
      ...(country !== home && { tos_acceptance: { service_agreement: "recipient" } }),
      business_profile: {
        mcc: "8011",
        product_description: "Online gynaecology consultations through GyneClinics",
      },
      metadata: { doctorId: String(doctor._id), userId: String(user._id) },
    });
  } catch (error) {
    throw stripeError(error, "We couldn't set up your Stripe account. Please try again.");
  }
  await syncStripeAccount(doctor, account);
  return account.id;
}

/**
 * Where Stripe sends the doctor back to. Must be one of our own sites in
 * production; any http(s) address while developing.
 */
export function safeReturnUrl(raw: unknown): string {
  let url: URL;
  try {
    url = new URL(String(raw));
  } catch {
    throw new ApiError(422, "Invalid return address");
  }
  if (!/^https?:$/.test(url.protocol)) throw new ApiError(422, "Invalid return address");
  if (env.isProduction) {
    const allowed = env.clientUrls.map((u) => {
      try {
        return new URL(u).host;
      } catch {
        return "";
      }
    });
    if (!allowed.includes(url.host)) throw new ApiError(422, "Invalid return address");
  }
  url.search = "";
  url.hash = "";
  return url.toString();
}
