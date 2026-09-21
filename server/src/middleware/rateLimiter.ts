import rateLimit from "express-rate-limit";
import { Request, Response } from "express";
import { sendError } from "../utils/apiResponse.js";
import { config } from "../config/env.js";

/**
 * Rate limiter for sensitive authentication endpoints (e.g. login).
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: config.NODE_ENV === "test" ? 1000 : 30, // 30 login attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    sendError(
      res,
      "RATE_LIMIT_EXCEEDED",
      "Too many login attempts from this IP address. Please try again after 15 minutes.",
      429
    );
  },
});
