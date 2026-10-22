import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { connectDB } from "./config/db";
import { swaggerHtml, swaggerSpec } from "./config/swagger";
import routes from "./routes";
import { stripeWebhook } from "./controllers/stripeWebhook.controller";
import { notFound } from "./middleware/notFound";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

// API docs. Registered before helmet so its CSP doesn't block the CDN assets.
app.get(["/", "/docs", "/api/docs"], (_req, res) =>
  res.redirect(302, "/api-docs")
);
app.get(["/api-docs", "/api-docs/"], (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.type("html").send(swaggerHtml);
});
app.get("/api-docs.json", (_req, res) => res.json(swaggerSpec));

app.use(helmet());
app.use(
  cors({
    origin: env.isProduction ? env.clientUrls : true,
    credentials: true,
  })
);
// Stripe signs the raw body, so its webhook is read before the JSON parser.
app.post("/api/v1/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhook);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (!env.isProduction) {
  app.use(morgan("dev"));
}

// On Vercel each cold start needs its own DB connection; connectDB() reuses
// an open one, so this is cheap on a long-running server.
app.use("/api/v1", async (_req, _res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    next(error);
  }
});
app.use("/api/v1", routes);

app.use(notFound);
app.use(errorHandler);

export default app;
