import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, AccessTokenPayload } from "../utils/jwt.js";
import { AppError } from "../types/api.types.js";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
      };
    }
  }
}

/**
 * Middleware ensuring incoming requests supply a valid Bearer access token.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(
      new AppError(
        "Authentication required. Missing or malformed Authorization header.",
        401,
        "UNAUTHENTICATED"
      )
    );
  }

  const token = authHeader.split(" ")[1]?.trim();
  if (!token) {
    return next(new AppError("Access token is missing", 401, "UNAUTHENTICATED"));
  }

  try {
    const payload: AccessTokenPayload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
    };
    next();
  } catch (err) {
    next(err);
  }
}
