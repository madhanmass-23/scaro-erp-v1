import { Request, Response, NextFunction } from "express";
import { sendError } from "../utils/apiResponse.js";

export function notFoundHandler(req: Request, res: Response, _next: NextFunction): void {
  // If requesting a static asset (e.g. .css, .js, .png, .ico, /assets/*), return 404 text instead of JSON
  if (req.path.startsWith("/assets/") || /\.[a-zA-Z0-9]+$/.test(req.path)) {
    res.status(404).type("text/plain").send("Not Found");
    return;
  }
  sendError(res, "NOT_FOUND", `Route '${req.method} ${req.originalUrl}' not found`, 404);
}

