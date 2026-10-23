import { deleteStoredFile } from "../utils/storage";
import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";

// One User per account. Role-specific data lives in its own model:
//   patient → Patient (models/patient.model.ts)
//   doctor  → Doctor  (models/doctor.model.ts)
// Customers (shop buyers) and staff only need what's on User.
export const USER_ROLES = [
  "patient",
  "doctor",
  "customer",
  "moderator",
  "admin",
  "superadmin",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Dashboard staff. They sign in with email + password. */
export const STAFF_ROLES = ["moderator", "admin", "superadmin"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** App users. They sign in with a phone OTP, so a password is optional. */
export const APP_ROLES = ["patient", "doctor", "customer"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const isStaffRole = (role: string): role is StaffRole =>
  (STAFF_ROLES as readonly string[]).includes(role);

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_REGEX = /^[+]?[0-9]{7,15}$/;

export interface IAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postCode?: string;
  /** ISO 3166-1 alpha-2, e.g. "GB", "BD". */
  country?: string;
}

export interface IUser extends Document {
  fullName: string;
  phone?: string;
  email?: string;
  phoneVerified: boolean;
  emailVerified: boolean;
  password?: string;
  role: UserRole;
  avatar?: string;
  // DigitalOcean Spaces key for `avatar`, kept only to delete the old file.
  avatarKey?: string;
  address?: IAddress;
  /** ISO country code of the user, used for regional pricing. */
  country?: string;
  /** When the user accepted the terms and data consent. */
  consentAt?: Date;
  isActive: boolean;
  /** Why staff blocked the account (isActive = false), and when. */
  suspensionReason?: string;
  suspendedAt?: Date;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const addressSchema = new Schema<IAddress>(
  {
    line1: { type: String, trim: true, default: "" },
    line2: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    postCode: { type: String, trim: true, default: "" },
    country: { type: String, trim: true, uppercase: true, default: "" },
  },
  { _id: false }
);

/**
 * @swagger
 * components:
 *   schemas:
 *     Address:
 *       type: object
 *       properties:
 *         line1:
 *           type: string
 *           example: 12 Harley Street
 *         line2:
 *           type: string
 *         city:
 *           type: string
 *           example: London
 *         state:
 *           type: string
 *         postCode:
 *           type: string
 *           example: W1G 9PF
 *         country:
 *           type: string
 *           example: GB
 *     User:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: 656f1c2e8f1b2c0012a34567
 *         fullName:
 *           type: string
 *           example: Ayesha Khan
 *         phone:
 *           type: string
 *           example: "+447700900123"
 *         email:
 *           type: string
 *           example: ayesha@example.com
 *         phoneVerified:
 *           type: boolean
 *         emailVerified:
 *           type: boolean
 *         role:
 *           type: string
 *           enum: [patient, doctor, customer, moderator, admin, superadmin]
 *           example: patient
 *         avatar:
 *           type: string
 *           example: https://example.com/avatars/ayesha.jpg
 *         address:
 *           $ref: '#/components/schemas/Address'
 *         country:
 *           type: string
 *           example: GB
 *         consentAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         isActive:
 *           type: boolean
 *           description: false when staff have blocked the account
 *         suspensionReason:
 *           type: string
 *           nullable: true
 *         suspendedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         lastLoginAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */
const userSchema = new Schema<IUser>(
  {
    // Patients and doctors give their name in onboarding, after the account
    // is created from their verified phone; everyone else needs it up front.
    fullName: {
      type: String,
      required: [
        function (this: IUser) {
          return this.role !== "patient" && this.role !== "doctor";
        },
        "Full name is required",
      ],
      trim: true,
      default: "",
      maxlength: [100, "Full name must be at most 100 characters"],
    },
    phone: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      match: [PHONE_REGEX, "Please enter a valid phone number"],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
      match: [EMAIL_REGEX, "Please enter a valid email address"],
    },
    phoneVerified: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    password: {
      type: String,
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    role: {
      type: String,
      enum: USER_ROLES,
      required: true,
      default: "patient",
    },
    avatar: { type: String, trim: true, default: "" },
    avatarKey: { type: String, trim: true, default: "" },
    address: { type: addressSchema, default: undefined },
    country: { type: String, trim: true, uppercase: true, default: "" },
    consentAt: { type: Date },
    isActive: { type: Boolean, default: true },
    suspensionReason: { type: String, trim: true, maxlength: 500 },
    suspendedAt: { type: Date },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.index({ role: 1, createdAt: -1 });

userSchema.pre("validate", function (next) {
  if (!this.email && !this.phone) {
    this.invalidate("email", "Either email or phone is required");
  }
  // Staff sign in to the dashboard with email + password.
  if (isStaffRole(this.role)) {
    if (!this.email) this.invalidate("email", "Email is required for staff accounts");
    if (this.isNew && !this.password) {
      this.invalidate("password", "Password is required for staff accounts");
    }
  }
  next();
});

// Skip re-hashing when the value is already a bcrypt hash.
const BCRYPT_HASH_REGEX = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  if (BCRYPT_HASH_REGEX.test(this.password)) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Remove the role profile and uploaded photos along with the account. Models
// are looked up by name to avoid a circular import between them.
userSchema.post("deleteOne", { document: true, query: false }, async function () {
  const profileModel = { patient: "Patient", doctor: "Doctor" }[this.role as string];
  let pendingPhotoKey: string | undefined;
  let profileId: mongoose.Types.ObjectId | undefined;
  if (profileModel && mongoose.models[profileModel]) {
    const profile = await mongoose.models[profileModel].findOneAndDelete({ user: this._id }).lean<{
      _id: mongoose.Types.ObjectId;
      pendingUpdate?: { avatarKey?: string };
    }>();
    pendingPhotoKey = profile?.pendingUpdate?.avatarKey;
    profileId = profile?._id;
  }
  // Their notifications go too.
  await mongoose.connection.collection("notifications").deleteMany({ user: this._id });
  // Their chats go too (messages and safety flags included).
  const chatOwner = this.role === "patient" ? { patient: this._id } : this.role === "doctor" && profileId ? { doctor: profileId } : null;
  if (chatOwner) {
    const chatIds = await mongoose.connection.collection("chats").distinct("_id", chatOwner);
    if (chatIds.length) {
      await Promise.all([
        mongoose.connection.collection("chatmessages").deleteMany({ chat: { $in: chatIds } }),
        mongoose.connection.collection("chatflags").deleteMany({ chat: { $in: chatIds } }),
        mongoose.connection.collection("chats").deleteMany({ _id: { $in: chatIds } }),
      ]);
    }
  }
  // Reviews go too: a patient's own reviews (their doctors' ratings are
  // recalculated), or all reviews of a deleted doctor.
  const reviews = mongoose.connection.collection("reviews");
  if (this.role === "doctor" && profileId) await reviews.deleteMany({ doctor: profileId });
  if (this.role === "patient") {
    const doctorIds = await reviews.distinct("doctor", { patient: this._id });
    await reviews.deleteMany({ patient: this._id });
    for (const doctorId of doctorIds) {
      const [row] = await reviews
        .aggregate<{ avg: number; n: number }>([
          { $match: { doctor: doctorId, status: "published" } },
          { $group: { _id: null, avg: { $avg: "$rating" }, n: { $sum: 1 } } },
        ])
        .toArray();
      await mongoose.connection
        .collection("doctors")
        .updateOne({ _id: doctorId }, { $set: { rating: row ? Math.round(row.avg * 10) / 10 : 0, reviewCount: row?.n ?? 0 } });
    }
  }
  // A patient's community stories go with the account. Uses the collection
  // directly, so it works even where the Story model isn't loaded (scripts).
  let storyImageKeys: string[] = [];
  if (this.role === "patient") {
    const stories = mongoose.connection.collection("stories");
    const own = await stories.find({ patient: this._id }, { projection: { imageKey: 1 } }).toArray();
    storyImageKeys = own.map((s) => s.imageKey as string | undefined).filter((k): k is string => Boolean(k));
    await stories.deleteMany({ patient: this._id });
    // Their health logs (periods, weight, baby growth) go too.
    await Promise.all(
      ["periodlogs", "weightlogs", "babygrowthlogs"].map((name) => mongoose.connection.collection(name).deleteMany({ patient: this._id })),
    );
  }
  await Promise.all([deleteStoredFile(this.avatarKey), deleteStoredFile(pendingPhotoKey), ...storyImageKeys.map((k) => deleteStoredFile(k))]);
});

userSchema.methods.comparePassword = function (candidate: string): Promise<boolean> {
  // Needs the document to be loaded with .select("+password").
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(candidate, this.password);
};

userSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => {
    const { password, avatarKey, __v, ...rest } = ret as typeof ret & {
      password?: string;
      avatarKey?: string;
      __v?: number;
    };
    return rest;
  },
});

export const User = mongoose.model<IUser>("User", userSchema);
