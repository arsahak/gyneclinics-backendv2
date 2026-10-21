import dotenv from "dotenv";

dotenv.config();

const port = Number(process.env.PORT) || 5000;
const deploymentHost =
  process.env.API_PUBLIC_URL ||
  process.env.VERCEL_PROJECT_PRODUCTION_URL ||
  process.env.VERCEL_URL;
const publicUrl = deploymentHost
  ? deploymentHost.startsWith("http")
    ? deploymentHost.replace(/\/$/, "")
    : `https://${deploymentHost.replace(/\/$/, "")}`
  : `http://localhost:${port}`;

const clientUrl =
  process.env.CLIENT_URL || process.env.CORS_ORIGIN || "http://localhost:3000";

// DigitalOcean Spaces vars are optional: uploads return a clear error until
// they are set, but the server can still start without them.
const requiredVars = ["MONGO_URI", "JWT_SECRET"] as const;

for (const key of requiredVars) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const env = {
  port,
  nodeEnv: process.env.NODE_ENV || "development",
  mongoUri: process.env.MONGO_URI as string,
  // MONGO_URI has no database path segment, so the db name is passed to
  // mongoose.connect() separately via this.
  dbName: process.env.DB_NAME || "gyneclinicsdb",
  clientUrl,
  clientUrls: clientUrl
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean),
  isProduction:
    process.env.NODE_ENV === "production" || process.env.VERCEL === "1",
  publicUrl,
  jwtSecret: process.env.JWT_SECRET as string,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  spaces: {
    key: process.env.DO_SPACES_KEY || "",
    secret: process.env.DO_SPACES_SECRET || "",
    // e.g. "nyc3.digitaloceanspaces.com" — no protocol, no bucket prefix.
    endpoint: process.env.DO_SPACES_ENDPOINT || "",
    region: process.env.DO_SPACES_REGION || "",
    bucket: process.env.DO_SPACES_BUCKET || "",
    // Optional CDN endpoint for faster public delivery; falls back to the
    // bucket's direct Spaces URL when unset.
    cdnEndpoint: process.env.DO_SPACES_CDN_ENDPOINT || "",
    // All uploads live under this root prefix within the shared bucket, so
    // this project's files stay namespaced from other apps using the bucket.
    // Set via DO_SPACES_FOLDER_NAME; surrounding slashes are stripped.
    rootFolder: (process.env.DO_SPACES_FOLDER_NAME || "gyneclinics").replace(
      /^\/+|\/+$/g,
      "",
    ),
  },
  // Image storage used when DigitalOcean Spaces isn't configured.
  cloudinary: {
    cloudName: process.env.CLOUDINARY_NAME?.trim() || "",
    apiKey: process.env.CLOUDINARY_API_KEY?.trim() || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET?.trim() || "",
    folder: process.env.CLOUDINARY_FOLDER?.trim() || "gyneclinics",
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY || "",
    fromEmail: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID?.trim() || "",
    authToken: process.env.TWILIO_AUTH_TOKEN?.trim() || "",
    // Optional scoped API key; used instead of the auth token when set.
    apiKeySid: process.env.TWILIO_API_KEY_SID?.trim() || "",
    apiKeySecret: process.env.TWILIO_API_KEY_SECRET?.trim() || "",
    // Video room names start with this, so rooms from different setups don't mix.
    roomPrefix: process.env.TWILIO_ROOM_PREFIX?.trim() || "gyneclinics",
    // Sends our SMS (sign-in codes, booking confirmations). Without it, SMS are only logged.
    messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() || "",
  },
  // Dev-only: this fixed code is also accepted at sign-in (real codes are still
  // sent). Never used in production, even if set.
  otpBypassCode:
    process.env.NODE_ENV === "production" || process.env.VERCEL === "1"
      ? ""
      : process.env.OTP_BYPASS_CODE?.trim() || "",
  // Test phone numbers (comma-separated, with country code) that sign in with
  // OTP_TEST_CODE instead of an SMS. Works in production too, for these numbers only.
  otpTestNumbers: (process.env.OTP_TEST_NUMBERS ?? "")
    .split(",")
    .map((n) => n.replace(/[\s().-]/g, ""))
    .filter((n) => /^\+\d{8,15}$/.test(n)),
  otpTestCode: process.env.OTP_TEST_CODE?.trim() || "123456",
  // Lifetime of the token that links a verified phone to /auth/register.
  signupTokenExpiresIn: "15m",
  bulkSms: {
    apiKey: process.env.BULKSMS_API_KEY || "",
    senderId: process.env.BULKSMS_SENDER_ID || "",
  },
};
