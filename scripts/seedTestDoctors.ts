import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Doctor, type ITimeRange, type Specialization } from "../models/doctor.model";
import { User } from "../models/user.model";

// 10 approved test doctors (5 UK, 5 Africa) for trying the apps.
// Add their phones to OTP_TEST_NUMBERS so they sign in with OTP_TEST_CODE
// (no SMS is sent).
//
//   npm run seed:test-doctors          create or refresh them
//   npm run seed:test-doctors:remove   delete them (and their chats, reviews…)

type Seed = {
  phone: string;
  fullName: string;
  email: string;
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
  timezone: string;
  languages: string[];
  about: string;
  feeGBP: number;
  isOnline: boolean;
  freeMessages: boolean;
  recommended: boolean;
  rating: number;
  reviewCount: number;
  consultationCount: number;
  /** Working hours, Monday to Sunday. */
  hours: (ITimeRange[] | null)[];
};

const day = (start: string, end: string): ITimeRange[] => [{ start, end }];
const split = (a: string, b: string, c: string, d: string): ITimeRange[] => [
  { start: a, end: b },
  { start: c, end: d },
];
const weekdays = (range: ITimeRange[]) => [range, range, range, range, range, null, null];

export const TEST_DOCTORS: Seed[] = [
  // ── United Kingdom ──────────────────────────────────────────────────────────
  {
    phone: "+447400000101",
    fullName: "Dr. Eleanor Hughes",
    email: "eleanor.hughes@test.gyneclinics.com",
    title: "Consultant Gynaecologist",
    specialization: "General Gynaecology",
    focusAreas: ["PCOS", "Endometriosis", "Heavy periods"],
    qualifications: ["MBBS", "MRCOG"],
    experienceYears: 16,
    registrationNumber: "TEST-GMC-101",
    registrationBody: "General Medical Council (UK)",
    clinic: "Marylebone Women's Clinic",
    city: "London",
    country: "GB",
    timezone: "Europe/London",
    languages: ["English", "French"],
    about:
      "Consultant gynaecologist with 16 years in NHS and private practice. I help women with painful or irregular periods, PCOS and endometriosis, and take time to explain every option.",
    feeGBP: 55,
    isOnline: true,
    freeMessages: false,
    recommended: true,
    rating: 4.9,
    reviewCount: 214,
    consultationCount: 1860,
    hours: weekdays(split("09:00", "13:00", "14:00", "18:00")),
  },
  {
    phone: "+447400000102",
    fullName: "Dr. Priya Shah",
    email: "priya.shah@test.gyneclinics.com",
    title: "Fertility Specialist",
    specialization: "Reproductive Medicine",
    focusAreas: ["Fertility", "IVF guidance", "Recurrent miscarriage"],
    qualifications: ["MBBS", "MRCOG", "MSc Reproductive Medicine"],
    experienceYears: 12,
    registrationNumber: "TEST-GMC-102",
    registrationBody: "General Medical Council (UK)",
    clinic: "Northern Fertility Centre",
    city: "Manchester",
    country: "GB",
    timezone: "Europe/London",
    languages: ["English", "Hindi", "Gujarati"],
    about:
      "I support couples and individuals on their fertility journey, from first investigations to IVF decisions, with clear plans and honest expectations.",
    feeGBP: 60,
    isOnline: false,
    freeMessages: false,
    recommended: true,
    rating: 4.8,
    reviewCount: 156,
    consultationCount: 1120,
    hours: [day("10:00", "18:00"), day("10:00", "18:00"), null, day("10:00", "18:00"), day("10:00", "16:00"), day("09:00", "12:00"), null],
  },
  {
    phone: "+447400000103",
    fullName: "Dr. Hannah Clarke",
    email: "hannah.clarke@test.gyneclinics.com",
    title: "Menopause Specialist",
    specialization: "Menopause & HRT",
    focusAreas: ["Perimenopause", "HRT", "Sleep and mood"],
    qualifications: ["MBChB", "MRCOG", "BMS Menopause Specialist"],
    experienceYears: 20,
    registrationNumber: "TEST-GMC-103",
    registrationBody: "General Medical Council (UK)",
    clinic: "Midlands Menopause Clinic",
    city: "Birmingham",
    country: "GB",
    timezone: "Europe/London",
    languages: ["English"],
    about:
      "Menopause should not be endured in silence. I help women understand their symptoms and choose the right HRT or non-hormonal treatment for them.",
    feeGBP: 50,
    isOnline: true,
    freeMessages: true,
    recommended: false,
    rating: 4.9,
    reviewCount: 302,
    consultationCount: 2640,
    hours: weekdays(day("08:30", "16:30")),
  },
  {
    phone: "+447400000104",
    fullName: "Dr. Sophie Bennett",
    email: "sophie.bennett@test.gyneclinics.com",
    title: "Consultant Urogynaecologist",
    specialization: "Urogynaecology & Pelvic Health",
    focusAreas: ["Bladder leakage", "Prolapse", "Postnatal recovery"],
    qualifications: ["MBBS", "MRCOG", "Subspecialty in Urogynaecology"],
    experienceYears: 14,
    registrationNumber: "TEST-GMC-104",
    registrationBody: "General Medical Council (UK)",
    clinic: "Yorkshire Pelvic Health",
    city: "Leeds",
    country: "GB",
    timezone: "Europe/London",
    languages: ["English"],
    about:
      "I treat bladder and pelvic floor problems that many women think they just have to live with. Most improve a lot with the right plan.",
    feeGBP: 45,
    isOnline: false,
    freeMessages: false,
    recommended: false,
    rating: 4.7,
    reviewCount: 98,
    consultationCount: 740,
    hours: [day("09:00", "17:00"), day("09:00", "17:00"), day("09:00", "17:00"), null, day("09:00", "17:00"), null, null],
  },
  {
    phone: "+447400000105",
    fullName: "Dr. Fiona MacLeod",
    email: "fiona.macleod@test.gyneclinics.com",
    title: "Consultant Obstetrician",
    specialization: "Pregnancy Care",
    focusAreas: ["Pregnancy planning", "Antenatal care", "High-risk pregnancy"],
    qualifications: ["MBChB", "FRCOG"],
    experienceYears: 22,
    registrationNumber: "TEST-GMC-105",
    registrationBody: "General Medical Council (UK)",
    clinic: "Edinburgh Maternity Practice",
    city: "Edinburgh",
    country: "GB",
    timezone: "Europe/London",
    languages: ["English", "Gaelic"],
    about:
      "From planning a pregnancy to the weeks after birth, I give calm, evidence-based advice and help you feel ready for each stage.",
    feeGBP: 40,
    isOnline: true,
    freeMessages: true,
    recommended: false,
    rating: 4.8,
    reviewCount: 187,
    consultationCount: 1530,
    hours: weekdays(day("09:00", "17:00")),
  },

  // ── Africa ──────────────────────────────────────────────────────────────────
  {
    phone: "+2348030000101",
    fullName: "Dr. Adaeze Okafor",
    email: "adaeze.okafor@test.gyneclinics.com",
    title: "Consultant Obstetrician & Gynaecologist",
    specialization: "General Gynaecology",
    focusAreas: ["Fibroids", "Irregular periods", "Infections"],
    qualifications: ["MBBS", "FWACS"],
    experienceYears: 15,
    registrationNumber: "TEST-MDCN-201",
    registrationBody: "Medical and Dental Council of Nigeria",
    clinic: "Lekki Women's Health Centre",
    city: "Lagos",
    country: "NG",
    timezone: "Africa/Lagos",
    languages: ["English", "Igbo", "Yoruba"],
    about:
      "I care for women with fibroids, period problems and infections, and believe every woman deserves clear answers and respectful care.",
    feeGBP: 30,
    isOnline: true,
    freeMessages: true,
    recommended: true,
    rating: 4.8,
    reviewCount: 143,
    consultationCount: 980,
    hours: [day("09:00", "17:00"), day("09:00", "17:00"), day("09:00", "17:00"), day("09:00", "17:00"), day("09:00", "15:00"), day("10:00", "14:00"), null],
  },
  {
    phone: "+254700000101",
    fullName: "Dr. Wanjiru Kamau",
    email: "wanjiru.kamau@test.gyneclinics.com",
    title: "Adolescent & Women's Health Doctor",
    specialization: "Adolescent Gynaecology",
    focusAreas: ["First periods", "Painful periods", "Contraception advice"],
    qualifications: ["MBChB", "MMed Obstetrics & Gynaecology"],
    experienceYears: 9,
    registrationNumber: "TEST-KMPDC-202",
    registrationBody: "Kenya Medical Practitioners and Dentists Council",
    clinic: "Westlands Women's Clinic",
    city: "Nairobi",
    country: "KE",
    timezone: "Africa/Nairobi",
    languages: ["English", "Swahili", "Kikuyu"],
    about:
      "I help teenagers and young women with periods, contraception and body changes, in a friendly, judgement-free way.",
    feeGBP: 25,
    isOnline: false,
    freeMessages: true,
    recommended: false,
    rating: 4.7,
    reviewCount: 76,
    consultationCount: 520,
    hours: weekdays(day("08:00", "16:00")),
  },
  {
    phone: "+27820000101",
    fullName: "Dr. Thandiwe Nkosi",
    email: "thandiwe.nkosi@test.gyneclinics.com",
    title: "Gynaecologist, Intimate Health",
    specialization: "Intimate Wellness",
    focusAreas: ["Vaginal health", "Painful sex", "Recurrent thrush"],
    qualifications: ["MBChB", "FCOG (SA)"],
    experienceYears: 11,
    registrationNumber: "TEST-HPCSA-203",
    registrationBody: "Health Professions Council of South Africa",
    clinic: "Sandton Intimate Health Practice",
    city: "Johannesburg",
    country: "ZA",
    timezone: "Africa/Johannesburg",
    languages: ["English", "Zulu", "Afrikaans"],
    about:
      "I treat intimate health concerns that are often hard to talk about. Nothing is too small or too embarrassing to ask.",
    feeGBP: 35,
    isOnline: true,
    freeMessages: false,
    recommended: false,
    rating: 4.9,
    reviewCount: 121,
    consultationCount: 860,
    hours: weekdays(split("08:00", "12:00", "13:00", "17:00")),
  },
  {
    phone: "+233240000101",
    fullName: "Dr. Abena Mensah",
    email: "abena.mensah@test.gyneclinics.com",
    title: "Fertility & Reproductive Health Specialist",
    specialization: "Reproductive Medicine",
    focusAreas: ["Fertility checks", "PCOS", "Ovulation problems"],
    qualifications: ["MBChB", "FGCS (O&G)"],
    experienceYears: 13,
    registrationNumber: "TEST-MDC-204",
    registrationBody: "Medical and Dental Council, Ghana",
    clinic: "Accra Reproductive Health Clinic",
    city: "Accra",
    country: "GH",
    timezone: "Africa/Accra",
    languages: ["English", "Twi"],
    about:
      "I help women understand their cycles and fertility, and build a practical plan when pregnancy is taking longer than expected.",
    feeGBP: 28,
    isOnline: false,
    freeMessages: false,
    recommended: false,
    rating: 4.6,
    reviewCount: 64,
    consultationCount: 410,
    hours: [day("09:00", "17:00"), null, day("09:00", "17:00"), day("09:00", "17:00"), day("09:00", "17:00"), day("09:00", "13:00"), null],
  },
  {
    phone: "+256770000101",
    fullName: "Dr. Grace Namukasa",
    email: "grace.namukasa@test.gyneclinics.com",
    title: "Obstetrician & Gynaecologist",
    specialization: "Pregnancy Care",
    focusAreas: ["Antenatal care", "Pregnancy nutrition", "After birth care"],
    qualifications: ["MBChB", "MMed Obstetrics & Gynaecology"],
    experienceYears: 10,
    registrationNumber: "TEST-UMDPC-205",
    registrationBody: "Uganda Medical and Dental Practitioners Council",
    clinic: "Kololo Mother & Women's Clinic",
    city: "Kampala",
    country: "UG",
    timezone: "Africa/Kampala",
    languages: ["English", "Luganda"],
    about:
      "I look after women through pregnancy and the months after birth, with practical advice that fits real life.",
    feeGBP: 25,
    isOnline: true,
    freeMessages: true,
    recommended: false,
    rating: 4.8,
    reviewCount: 89,
    consultationCount: 630,
    hours: weekdays(day("08:30", "16:30")),
  },
];

const PHONES = TEST_DOCTORS.map((d) => d.phone);

async function seed() {
  const now = new Date();
  for (const d of TEST_DOCTORS) {
    let user = await User.findOne({ phone: d.phone });
    if (user && user.role !== "doctor") {
      console.warn(`skip ${d.phone}: already a ${user.role} account`);
      continue;
    }
    if (!user) user = new User({ phone: d.phone, role: "doctor" });
    user.set({
      fullName: d.fullName,
      email: d.email,
      phoneVerified: true,
      country: d.country,
      address: { city: d.city, country: d.country },
      consentAt: user.consentAt ?? now,
      isActive: true,
    });
    await user.save();

    const profile = {
      user: user._id,
      title: d.title,
      specialization: d.specialization,
      focusAreas: d.focusAreas,
      qualifications: d.qualifications,
      experienceYears: d.experienceYears,
      registrationNumber: d.registrationNumber,
      registrationBody: d.registrationBody,
      clinic: d.clinic,
      city: d.city,
      country: d.country,
      languages: d.languages,
      about: d.about,
      feeGBP: d.feeGBP,
      schedule: {
        weekly: d.hours.map((h) => h ?? []),
        slotMinutes: 30,
        bookingWindowDays: 14,
        minNoticeHours: 1,
        instantChat: true,
        timeOff: [],
        timezone: d.timezone,
      },
      messaging: { free: d.freeMessages, consultation: true },
      isOnline: d.isOnline,
      verificationStatus: "approved" as const,
      verifiedAt: now,
      recommended: d.recommended,
      autoApproveUpdates: true,
      rating: d.rating,
      reviewCount: d.reviewCount,
      consultationCount: d.consultationCount,
    };
    const existing = await Doctor.findOne({ user: user._id });
    if (existing) {
      existing.set(profile);
      await existing.save();
    } else {
      await Doctor.create(profile);
    }
    console.log(`${existing ? "updated" : "created"}  ${d.phone}  ${d.fullName} (${d.city})`);
  }
  console.log(`\nAdd to OTP_TEST_NUMBERS:\n${PHONES.join(", ")}`);
}

async function remove() {
  const users = await User.find({ phone: { $in: PHONES }, role: "doctor" });
  // deleteOne on the document also removes the profile, chats and reviews.
  for (const user of users) {
    await user.deleteOne();
    console.log(`removed  ${user.phone}  ${user.fullName}`);
  }
  if (!users.length) console.log("No test doctors found.");
}

const run = async () => {
  await connectDB();
  if (process.argv.includes("--remove")) await remove();
  else await seed();
  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error("Test doctor seed failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
