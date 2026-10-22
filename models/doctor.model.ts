import mongoose, { Schema, Document } from "mongoose";

// Professional profile for a user with role "doctor". Name, phone and email
// stay on User. A doctor is hidden from patients until an admin approves them.
export const VERIFICATION_STATUSES = ["pending", "approved", "rejected"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const SPECIALIZATIONS = [
  "General Gynaecology",
  "Reproductive Medicine",
  "Urogynaecology & Pelvic Health",
  "Menopause & HRT",
  "Pregnancy Care",
  "Adolescent Gynaecology",
  "Intimate Wellness",
] as const;
export type Specialization = (typeof SPECIALIZATIONS)[number];

export const SLOT_LENGTHS = [15, 20, 30, 45, 60] as const;
export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export interface ITimeRange {
  start: string; // "HH:mm"
  end: string; // "HH:mm"
}

export interface ISchedule {
  /** 7 entries, Monday = 0 … Sunday = 6. An empty day means off. */
  weekly: ITimeRange[][];
  slotMinutes: number;
  bookingWindowDays: number;
  minNoticeHours: number;
  /** Accept "Chat now" requests while online. */
  instantChat: boolean;
  /** Days off, as yyyy-MM-dd. */
  timeOff: string[];
  /** IANA time zone the weekly hours are in, e.g. "Europe/London". */
  timezone: string;
}

/** How patients can reach the doctor. At least one is on. */
export interface IMessaging {
  /** Patients can message without paying. */
  free: boolean;
  /** Patients can book a paid chat consultation (feeGBP). */
  consultation: boolean;
}

export interface IDoctorDocument {
  name: string;
  url: string;
  key: string;
  uploadedAt: Date;
}

/**
 * Profile changes waiting for an admin, for an approved doctor whose updates
 * aren't auto-approved. Patients keep seeing the live profile until then.
 */
export interface IPendingUpdate {
  /** Changed fields (fullName and profile fields), with their new values. */
  fields: Record<string, unknown>;
  /** New photo URL, or "" to remove the photo. Absent = photo unchanged. */
  avatar?: string;
  /** Storage key of the new photo (internal). */
  avatarKey?: string;
  submittedAt: Date;
}

export interface IUpdateRejection {
  reason?: string;
  at: Date;
}

export interface IDoctor extends Document {
  user: mongoose.Types.ObjectId;
  title: string;
  specialization: Specialization;
  focusAreas: string[];
  qualifications: string[];
  experienceYears: number;
  registrationNumber: string;
  registrationBody: string;
  clinic: string;
  city: string;
  country: string;
  languages: string[];
  about: string;
  /** Base fee in GBP (the Europe & UK price). Other regions apply a multiplier. 0 = free. */
  feeGBP: number;
  documents: IDoctorDocument[];
  schedule: ISchedule;
  messaging: IMessaging;
  /** A special commission for this doctor (0–0.5), set in Fees & Commission. */
  commissionOverride?: { rate: number; note?: string; updatedAt: Date };
  /** Where withdrawals are sent (Stripe Connect). Never in JSON. */
  stripeAccount?: IStripeAccount;
  isOnline: boolean;
  verificationStatus: VerificationStatus;
  verifiedBy?: mongoose.Types.ObjectId;
  verifiedAt?: Date;
  rejectionReason?: string;
  /** Pinned near the top of the patient's doctor list. */
  recommended: boolean;
  /**
   * Profile edits go live without review. Registration number, registration
   * body and qualifications are always reviewed.
   */
  autoApproveUpdates: boolean;
  pendingUpdate?: IPendingUpdate | null;
  /** Why the last update was turned down; cleared on the next update. */
  updateRejection?: IUpdateRejection | null;
  // Denormalised stats, updated when reviews and consultations change.
  rating: number;
  reviewCount: number;
  consultationCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

const timeRangeSchema = new Schema<ITimeRange>(
  {
    start: { type: String, required: true, match: TIME_REGEX },
    end: { type: String, required: true, match: TIME_REGEX },
  },
  { _id: false }
);

// Mon–Fri 09:00–17:00, weekends off.
const defaultWeekly = (): ITimeRange[][] =>
  Array.from({ length: 7 }, (_, day) => (day < 5 ? [{ start: "09:00", end: "17:00" }] : []));

const scheduleSchema = new Schema<ISchedule>(
  {
    weekly: {
      type: [[timeRangeSchema]],
      default: defaultWeekly,
      validate: {
        validator: (weekly: ITimeRange[][]) =>
          weekly.length === 7 &&
          weekly.every((day) => {
            const sorted = [...day].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
            return sorted.every(
              (r, i) =>
                toMinutes(r.end) > toMinutes(r.start) &&
                (i === 0 || toMinutes(r.start) >= toMinutes(sorted[i - 1].end))
            );
          }),
        message: "Schedule needs 7 days, and each day's time ranges must not overlap",
      },
    },
    slotMinutes: { type: Number, enum: SLOT_LENGTHS, default: 30 },
    bookingWindowDays: { type: Number, min: 1, max: 60, default: 7 },
    minNoticeHours: { type: Number, min: 0, max: 72, default: 1 },
    instantChat: { type: Boolean, default: true },
    timeOff: {
      type: [{ type: String, match: DATE_REGEX }],
      default: [],
    },
    timezone: { type: String, trim: true, default: "Europe/London" },
  },
  { _id: false }
);

/**
 * The doctor's Stripe Connect (Express) account, where their earnings are sent.
 * Stripe holds the bank or card details; this is a copy of its status, refreshed
 * whenever the doctor opens Earnings and from the account.updated webhook.
 */
export interface IStripeAccount {
  id: string;
  /** The doctor finished Stripe's sign-up form. */
  detailsSubmitted: boolean;
  /** Stripe can pay out to their bank or card. */
  payoutsEnabled: boolean;
  /** We can transfer money to the account. */
  transfersActive: boolean;
  /** What Stripe still needs from the doctor, e.g. "individual.verification.document". */
  requirementsDue: string[];
  disabledReason?: string;
  /** Where Stripe pays them, e.g. "Barclays •••• 6789" or "Visa debit •••• 4242". */
  destination?: { type: "bank_account" | "card"; label: string; last4: string; currency?: string };
  country?: string;
  updatedAt: Date;
}

const stripeAccountSchema = new Schema<IStripeAccount>(
  {
    id: { type: String, required: true },
    detailsSubmitted: { type: Boolean, default: false },
    payoutsEnabled: { type: Boolean, default: false },
    transfersActive: { type: Boolean, default: false },
    requirementsDue: { type: [String], default: [] },
    disabledReason: String,
    destination: {
      type: new Schema({ type: { type: String, enum: ["bank_account", "card"] }, label: String, last4: String, currency: String }, { _id: false }),
    },
    country: String,
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const messagingSchema = new Schema<IMessaging>(
  {
    free: { type: Boolean, default: false },
    consultation: { type: Boolean, default: true },
  },
  { _id: false }
);
messagingSchema.pre("validate", function (next) {
  if (!this.free && !this.consultation) {
    this.invalidate("consultation", "Turn on free messages or consultations, so patients can reach you");
  }
  next();
});

const documentSchema = new Schema<IDoctorDocument>(
  {
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

/**
 * @swagger
 * components:
 *   schemas:
 *     DoctorSchedule:
 *       type: object
 *       properties:
 *         weekly:
 *           type: array
 *           description: 7 days, Monday first. Each day is a list of time ranges; empty means off.
 *           items:
 *             type: array
 *             items:
 *               type: object
 *               properties:
 *                 start:
 *                   type: string
 *                   example: "09:00"
 *                 end:
 *                   type: string
 *                   example: "17:00"
 *         slotMinutes:
 *           type: number
 *           enum: [15, 20, 30, 45, 60]
 *         bookingWindowDays:
 *           type: number
 *           example: 7
 *         minNoticeHours:
 *           type: number
 *           example: 1
 *         instantChat:
 *           type: boolean
 *         timeOff:
 *           type: array
 *           items:
 *             type: string
 *             example: "2026-12-25"
 *         timezone:
 *           type: string
 *           example: Europe/London
 *     Doctor:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         user:
 *           type: string
 *           description: Id of the User account (role "doctor")
 *         title:
 *           type: string
 *           example: Consultant Gynaecologist
 *         specialization:
 *           type: string
 *           enum: [General Gynaecology, Reproductive Medicine, Urogynaecology & Pelvic Health, Menopause & HRT, Pregnancy Care, Adolescent Gynaecology, Intimate Wellness]
 *         focusAreas:
 *           type: array
 *           items:
 *             type: string
 *           example: [PCOS, Endometriosis]
 *         qualifications:
 *           type: array
 *           items:
 *             type: string
 *           example: [MBBS, MRCOG]
 *         experienceYears:
 *           type: number
 *           example: 18
 *         registrationNumber:
 *           type: string
 *           example: GMC 7104412
 *         registrationBody:
 *           type: string
 *           example: General Medical Council (UK)
 *         clinic:
 *           type: string
 *           example: GyneClinics Harley Street
 *         city:
 *           type: string
 *           example: London
 *         country:
 *           type: string
 *           example: GB
 *         languages:
 *           type: array
 *           items:
 *             type: string
 *           example: [English, French]
 *         about:
 *           type: string
 *         feeGBP:
 *           type: number
 *           example: 45
 *         documents:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               _id:
 *                 type: string
 *               name:
 *                 type: string
 *               url:
 *                 type: string
 *               uploadedAt:
 *                 type: string
 *                 format: date-time
 *         schedule:
 *           $ref: '#/components/schemas/DoctorSchedule'
 *         messaging:
 *           type: object
 *           description: How patients can reach the doctor. At least one is on.
 *           properties:
 *             free:
 *               type: boolean
 *               description: Patients can message without paying
 *             consultation:
 *               type: boolean
 *               description: Patients can book a paid chat consultation
 *         isOnline:
 *           type: boolean
 *         verificationStatus:
 *           type: string
 *           enum: [pending, approved, rejected]
 *         verifiedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         rejectionReason:
 *           type: string
 *           nullable: true
 *         recommended:
 *           type: boolean
 *         autoApproveUpdates:
 *           type: boolean
 *           description: Profile edits go live without review (registration fields are always reviewed)
 *         pendingUpdate:
 *           type: object
 *           nullable: true
 *           description: Profile changes waiting for an admin
 *           properties:
 *             fields:
 *               type: object
 *               additionalProperties: true
 *             avatar:
 *               type: string
 *               description: New photo URL, or "" to remove the photo
 *             submittedAt:
 *               type: string
 *               format: date-time
 *         updateRejection:
 *           type: object
 *           nullable: true
 *           properties:
 *             reason:
 *               type: string
 *             at:
 *               type: string
 *               format: date-time
 *         rating:
 *           type: number
 *           example: 4.9
 *         reviewCount:
 *           type: number
 *           example: 312
 *         consultationCount:
 *           type: number
 *           example: 4200
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */
const doctorSchema = new Schema<IDoctor>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    title: { type: String, required: [true, "Title is required"], trim: true },
    specialization: {
      type: String,
      enum: SPECIALIZATIONS,
      default: "General Gynaecology",
    },
    focusAreas: { type: [String], default: [] },
    qualifications: {
      type: [String],
      validate: {
        validator: (values: string[]) => values.length > 0,
        message: "At least one qualification is required",
      },
    },
    experienceYears: { type: Number, required: true, min: 0, max: 70 },
    registrationNumber: {
      type: String,
      required: [true, "Registration number is required"],
      trim: true,
    },
    registrationBody: { type: String, required: true, trim: true },
    clinic: { type: String, trim: true, default: "" },
    city: { type: String, required: [true, "City is required"], trim: true },
    country: { type: String, trim: true, uppercase: true, default: "" },
    languages: { type: [String], default: ["English"] },
    about: { type: String, trim: true, maxlength: 2000, default: "" },
    feeGBP: { type: Number, required: true, min: 0, default: 40 },
    documents: { type: [documentSchema], default: [] },
    schedule: { type: scheduleSchema, default: () => ({}) },
    messaging: { type: messagingSchema, default: () => ({}) },
    stripeAccount: { type: stripeAccountSchema },
    commissionOverride: {
      type: new Schema(
        {
          rate: { type: Number, required: true, min: 0, max: 0.5 },
          note: { type: String, trim: true, maxlength: 200 },
          updatedAt: { type: Date, default: Date.now },
        },
        { _id: false }
      ),
    },
    isOnline: { type: Boolean, default: false },
    verificationStatus: {
      type: String,
      enum: VERIFICATION_STATUSES,
      default: "pending",
    },
    verifiedBy: { type: Schema.Types.ObjectId, ref: "User" },
    verifiedAt: { type: Date },
    rejectionReason: { type: String, trim: true },
    recommended: { type: Boolean, default: false },
    autoApproveUpdates: { type: Boolean, default: false },
    pendingUpdate: { type: Schema.Types.Mixed, default: undefined },
    updateRejection: { type: Schema.Types.Mixed, default: undefined },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    reviewCount: { type: Number, min: 0, default: 0 },
    consultationCount: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true }
);

// Patient doctor list: approved doctors, filtered by specialization.
doctorSchema.index({ verificationStatus: 1, specialization: 1, rating: -1 });
doctorSchema.index({ registrationNumber: 1, registrationBody: 1 }, { unique: true });
doctorSchema.index({ "stripeAccount.id": 1 }, { sparse: true });
// Admin list: doctors with an update to review.
doctorSchema.index({ "pendingUpdate.submittedAt": -1 }, { sparse: true });

doctorSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { __v, documents, pendingUpdate, stripeAccount: _stripeAccount, commissionOverride: _commission, ...rest } = ret as typeof ret & {
      __v?: number;
      stripeAccount?: unknown;
      commissionOverride?: unknown;
    };
    // Storage keys are internal; clients only need the URL.
    const { avatarKey: _avatarKey, ...pending } = (pendingUpdate ?? {}) as Partial<IPendingUpdate>;
    return {
      ...rest,
      documents: (documents ?? []).map(({ key: _key, ...doc }: IDoctorDocument) => doc),
      pendingUpdate: pendingUpdate ? { fields: {}, ...pending } : null,
    };
  },
});

export const Doctor = mongoose.model<IDoctor>("Doctor", doctorSchema);
