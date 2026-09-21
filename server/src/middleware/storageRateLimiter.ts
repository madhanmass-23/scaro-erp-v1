import rateLimit from "express-rate-limit";
import { Request, Response } from "express";
import { sendError } from "../utils/apiResponse.js";
import { config } from "../config/env.js";

/**
 * Rate limiter for file upload endpoints (10 uploads/minute).
 */
export const storageUploadRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: config.NODE_ENV === "test" ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    sendError(
      res,
      "RATE_LIMIT_EXCEEDED",
      "Upload rate limit exceeded. Maximum 10 uploads per minute allowed.",
      429
    );
  },
});

/**
 * Rate limiter for file download endpoints (100 downloads/minute).
 */
export const storageDownloadRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: config.NODE_ENV === "test" ? 5000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    sendError(
      res,
      "RATE_LIMIT_EXCEEDED",
      "Download rate limit exceeded. Maximum 100 downloads per minute allowed.",
      429
    );
  },
});
