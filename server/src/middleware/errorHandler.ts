import { Request, Response, NextFunction } from "express";
import { AppError } from "../types/api.types.js";
import { sendError } from "../utils/apiResponse.js";
import { config } from "../config/env.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    sendError(res, err.code, err.message, err.statusCode, err.details);
    return;
  }

  // Handle express/body-parser JSON parse errors
  if (err instanceof SyntaxError && "status" in err && err.status === 400 && "body" in err) {
    sendError(res, "INVALID_JSON", "Malformed JSON payload in request body", 400);
    return;
  }

  // Generic/unexpected errors
  const isProd = config.NODE_ENV === "production";
  const errorMessage = isProd
    ? "An unexpected internal server error occurred"
    : err instanceof Error
    ? err.message
    : "Unknown error";

  // Log error safely without dumping sensitive credentials
  console.error("[ERROR_HANDLER]", err instanceof Error ? err.stack : err);

  sendError(res, "INTERNAL_SERVER_ERROR", errorMessage, 500);
}
