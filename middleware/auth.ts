import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { User, type UserRole } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "./asyncHandler";
import type { TokenPayload } from "../utils/generateToken";

export const protect = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw new ApiError(401, "Not authenticated");
    }

    const token = header.split(" ")[1];

    let payload: TokenPayload;
    try {
      payload = jwt.verify(token, env.jwtSecret) as TokenPayload;
    } catch {
      throw new ApiError(401, "Invalid or expired token");
    }

    // Only login tokens carry a user id; signup and realtime tokens don't.
    if (!payload.id || "type" in payload) {
      throw new ApiError(401, "Invalid or expired token");
    }

    const user = await User.findById(payload.id);
    if (!user) {
      throw new ApiError(401, "User no longer exists");
    }
    if (!user.isActive) {
      throw new ApiError(403, "Your account is inactive");
    }

    req.user = user;
    next();
  }
);

export const authorize =
  (...roles: UserRole[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(
        new ApiError(403, "You do not have permission to perform this action")
      );
    }
    next();
  };
