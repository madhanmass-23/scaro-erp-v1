import { Request, Response, NextFunction } from "express";
import { sendError } from "../utils/apiResponse.js";

export function notFoundHandler(req: Request, res: Response, _next: NextFunction): void {
  sendError(res, "NOT_FOUND", `Route '${req.method} ${req.originalUrl}' not found`, 404);
}
