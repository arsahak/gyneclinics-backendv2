import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { User } from "../models/user.model";
import type { TokenPayload } from "../utils/generateToken";
import { asyncHandler } from "./asyncHandler";

export const optionalAuth = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return next();

    try {
      const payload = jwt.verify(header.slice(7), env.jwtSecret) as TokenPayload;
      const user =
        payload.id && !("type" in payload) ? await User.findById(payload.id) : null;
      if (user && user.isActive) {
        req.user = user;
      }
    } catch {
      // Public visitor messaging remains available when an optional token is invalid.
    }
    next();
  }
);
