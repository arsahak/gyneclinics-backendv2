import { body, type ValidationChain } from "express-validator";

/** International format with country code, e.g. +447700900123. */
export const E164_REGEX = /^\+[1-9]\d{7,14}$/;

// Accepts "+44 7700 900123", "+44 (7700) 900-123" etc. and stores "+447700900123".
const phoneRule = () =>
  body("phone")
    .customSanitizer((value) => String(value ?? "").replace(/[\s().-]/g, ""))
    .matches(E164_REGEX)
    .withMessage("Enter your mobile number with the country code, e.g. +447700900123");

export const sendOtpRules: ValidationChain[] = [phoneRule()];

export const verifyOtpRules: ValidationChain[] = [
  phoneRule(),
  body("code")
    .trim()
    .matches(/^\d{4,10}$/)
    .withMessage("Enter the code from the SMS"),
];

export const registerRules: ValidationChain[] = [
  body("signupToken").notEmpty().withMessage("Signup token is required"),
  body("role")
    .isIn(["patient", "doctor"])
    .withMessage("Role must be patient or doctor"),
  // Optional: patients and doctors enter their name in onboarding.
  body("fullName")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Full name must be 2–100 characters"),
];

export const staffLoginRules: ValidationChain[] = [
  body("email").trim().isEmail().withMessage("Please enter a valid email address"),
  body("password").notEmpty().withMessage("Password is required"),
];
