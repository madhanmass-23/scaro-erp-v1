import { Request, Response, NextFunction } from "express";
import { AppError } from "../types/api.types.js";
import { sendError } from "../utils/apiResponse.js";
import { config } from "../config/env.js";

function isDatabaseConnectionError(err: any): boolean {
  if (!err) return false;
  const code = typeof err === "object" && err !== null && "code" in err ? String(err.code) : "";
  const msg = typeof err === "object" && err !== null && "message" in err ? String(err.message) : "";
  return (
    code === "PROTOCOL_CONNECTION_LOST" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ER_ACCESS_DENIED_ERROR" ||
    code === "ER_CON_COUNT_ERROR" ||
    code === "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR" ||
    code === "ER_SOCKET_NOT_CONNECTED" ||
    code === "EPIPE" ||
    code === "PROTOCOL_PACKETS_OUT_OF_ORDER" ||
    msg.includes("Connection lost") ||
    msg.includes("closed the connection") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("socket has been closed") ||
    msg.includes("connect ECONNREFUSED")
  );
}

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

  // Intercept database connectivity / infrastructure errors
  if (isDatabaseConnectionError(err)) {
    const errObj = err as any;
    console.error(
      `[DATABASE_ERROR] Connectivity failure: [${errObj.code || "UNKNOWN"}] ${errObj.message || "Connection failed"}`
    );
    sendError(
      res,
      "DB_UNAVAILABLE",
      "Service temporarily unavailable. Please try again shortly.",
      503
    );
    return;
  }

  // Handle CORS policy rejection errors
  if (err instanceof Error && err.message && err.message.includes("CORS")) {
    sendError(res, "CORS_FORBIDDEN", err.message, 403);
    return;
  }

  // Handle file system ENOENT or 404 status errors
  if (err && typeof err === "object" && ("code" in err || "status" in err)) {
    const errorObj = err as any;
    if (errorObj.code === "ENOENT" || errorObj.status === 404) {
      if (_req.path.startsWith("/assets/") || /\.[a-zA-Z0-9]+$/.test(_req.path)) {
        res.status(404).type("text/plain").send("Not Found");
        return;
      }
      sendError(res, "NOT_FOUND", "Resource not found", 404);
      return;
    }
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

