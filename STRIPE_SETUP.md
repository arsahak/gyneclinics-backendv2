# Stripe setup for GyneClinics

GyneClinics uses one Stripe account (the platform, UK, GBP) for everything:

- **Patients pay** for consultations with Stripe's Payment Element (card, Apple Pay, Google Pay, Link).
- **Refunds** go back through Stripe, from the dashboard (Payments) or straight in Stripe.
- **Doctors are paid** with Stripe Connect (Express accounts). Each doctor adds a bank account or debit card on Stripe's own form, and the team sends their earnings from the dashboard (Payouts, or "Pay now" / every Friday in Fees & Commission).

Do everything below in **test mode** first, then again in **live mode**. Test and live have separate keys, webhooks and settings.

---

## 1. Turn on Connect (required for doctor payouts)

Until this is done, doctors see "Payouts through Stripe aren't switched on yet" when they press **Set up payouts**.

1. Open <https://dashboard.stripe.com/connect> and choose **Get started**.
2. Pick **Platform or marketplace** (you pay out to service providers).
3. Account type: **Express**. Answer the questions (business in the UK, providers are doctors).
4. **Settings → Connect → Onboarding / Branding**: add the GyneClinics name, icon and brand colour. Doctors see these on Stripe's form.
5. **Settings → Connect → Express dashboard**: leave it on. Doctors use it to change their bank or card ("Change bank or card in Stripe" in Earnings).
6. **Countries**: Stripe only pays out to [supported countries](https://stripe.com/docs/connect/cross-border-payouts). Doctors outside the UK sign Stripe's *recipient* agreement automatically. Doctors in unsupported countries (for example Bangladesh) can't be paid through Stripe; check before onboarding them.

## 2. Payment methods

**Settings → Payment methods** (for the platform account):

- Turn on **Cards**, **Apple Pay**, **Google Pay** and **Link**. Methods that redirect away (iDEAL, Klarna…) aren't used; the checkout asks Stripe for ones that work without leaving the page.
- **Payment method domains**: add the webapp's domain (e.g. `app.gyneclinics.com`). Apple Pay only shows on registered domains.

## 3. Webhooks (two endpoints, same URL)

**Developers → Webhooks → Add endpoint**, URL: `https://<your API host>/api/v1/stripe/webhook`

| Endpoint | Listen to | Events | Secret goes in |
|---|---|---|---|
| 1 | **Your account** | `payment_intent.succeeded`, `charge.refunded`, `transfer.reversed` | `STRIPE_WEBHOOK_SECRET` |
| 2 | **Connected accounts** | `account.updated` | `STRIPE_CONNECT_WEBHOOK_SECRET` |

What they do: save a booking if the patient closed the page after paying, mark bookings refunded in Stripe as refunded, keep doctors' Stripe status up to date, and put a reversed payout back in the doctor's balance.

Local development: `stripe listen --forward-to localhost:8000/api/v1/stripe/webhook --forward-connect-to localhost:8000/api/v1/stripe/webhook` and put the one secret it prints in `STRIPE_WEBHOOK_SECRET`.

## 4. Receipts, statement and branding

- **Settings → Customer emails**: turn on **Successful payments** and **Refunds** (patients get a Stripe receipt; the booking sends their email).
- **Settings → Public details**: statement descriptor, e.g. `GYNECLINICS`, and a support email/phone.
- **Settings → Branding**: logo and colours for receipts and Stripe pages.

## 5. Your own payouts (keep money for doctors)

Doctor payouts are Stripe **transfers from your available balance**. If Stripe sweeps your whole balance to your bank every day, there may be nothing left to pay doctors ("Your Stripe balance is too low").

- **Settings → Payouts**: set your schedule to **weekly** (after the Friday doctor payouts) or **manual**, so cleared money stays available.
- USD payments are converted to GBP in your balance (Stripe charges a conversion fee). Adding a USD bank account avoids that.
- The Payouts page in the dashboard shows your available Stripe balance.

## 6. Keys and settings in the backend `.env`

```
STRIPE_SECRET_KEY=sk_test_...            # sk_live_... in production
STRIPE_PUBLISHABLE_KEY=pk_test_...       # pk_live_...; the webapp gets it from the API
STRIPE_WEBHOOK_SECRET=whsec_...          # endpoint 1 (your account)
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...  # endpoint 2 (connected accounts)
CORS_ORIGIN=https://app.gyneclinics.com,https://admin.gyneclinics.com
```

- `CORS_ORIGIN` must include the **webapp's** address: in production, Stripe only sends doctors back to these hosts after their sign-up form.
- Never commit keys. Use a restricted key if you can, and roll any key that was ever shared.

## 7. Testing (test mode)

- Card that works: `4242 4242 4242 4242`, any future date and CVC. Declined: `4000 0000 0000 0002`.
- Test payments sit as *pending* for a while. To pay doctors in a test right away, pay with `4000 0000 0000 0077` (funds become available at once).
- Doctor sign-up in test mode: Stripe's form accepts test data (phone `000 000 0000`, SMS code `000000`, sort code `10-88-00`, account `00012345`).

## 8. Going live

1. **Activate the account**: business details, director identity, your bank account.
2. Turn on **Connect in live mode** and complete Stripe's platform review.
3. Repeat sections 2–5 in live mode (payment methods, Apple Pay domain, two webhooks, receipts, payout schedule).
4. Put the **live** keys and the two **live** webhook secrets in the production `.env`; restart the API.
5. Do one real small payment and refund, and one doctor sign-up and payout, before announcing it.
6. Terms: tell doctors that payouts are handled by Stripe under the [Stripe Connected Account Agreement](https://stripe.com/connect-account/legal).

## Not handled in the app yet

- **Disputes / chargebacks**: answer them in the Stripe dashboard. The app doesn't adjust the doctor's earnings for a dispute.
- **Running on Vercel**: live notifications (socket.io) and the Friday payout run need the long-running server (`npm start`). On Vercel, run payouts with "Pay now".
