import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/ApiError";

interface RateLimitOptions {
  /** Length of the counting window, in milliseconds. */
  windowMs: number;
  /** Requests one client may make per window. */
  max: number;
  message: string;
  /** Set false to let every request through (e.g. outside production). */
  enabled?: boolean;
}

/**
 * Small in-memory limiter for public write endpoints (e.g. the contact form).
 * Counts are kept per process, so on a multi-instance or serverless deploy it
 * is best-effort protection against casual spam rather than a hard guarantee.
 */
export const rateLimit = ({
  windowMs,
  max,
  message,
  enabled = true,
}: RateLimitOptions) => {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, _res: Response, next: NextFunction) => {
    if (!enabled) return next();

    const now = Date.now();
    // The storefront calls the API from its own server and passes the
    // visitor's address along, so prefer that over the server's own IP.
    const forwarded = String(req.headers["x-forwarded-for"] || "")
      .split(",")[0]
      .trim();
    const key = forwarded || req.ip || "unknown";

    // Drop expired entries now and then so the map can't grow without bound.
    if (hits.size > 5000) {
      for (const [entryKey, entry] of hits) {
        if (entry.resetAt <= now) hits.delete(entryKey);
      }
    }

    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (entry.count >= max) return next(new ApiError(429, message));

    entry.count += 1;
    next();
  };
};
