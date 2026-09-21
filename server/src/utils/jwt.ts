import jwt from "jsonwebtoken";
import crypto from "crypto";
import { config } from "../config/env.js";
import { AppError } from "../types/api.types.js";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  jti: string;
  iat?: number;
  exp?: number;
}

/**
 * Signs a short-lived JSON Web Token for API authentication.
 */
export function signAccessToken(userId: string, email: string): string {
  const jti = crypto.randomUUID();
  const payload: AccessTokenPayload = {
    sub: userId,
    email,
    jti,
  };

  return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    expiresIn: config.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

/**
 * Verifies and decodes an access token using pinned HS256 algorithm.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET, {
      algorithms: ["HS256"],
    }) as AccessTokenPayload;

    if (!decoded.sub || !decoded.jti) {
      throw new AppError("Invalid token claims", 401, "INVALID_TOKEN");
    }

    return decoded;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError("Access token has expired", 401, "TOKEN_EXPIRED");
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new AppError("Invalid access token", 401, "INVALID_TOKEN");
    }
    if (err instanceof AppError) throw err;
    throw new AppError("Token verification failed", 401, "INVALID_TOKEN");
  }
}

/**
 * Computes SHA-256 hash of an opaque string token.
 */
export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Generates a cryptographically secure random opaque token (64 hex chars) and its SHA-256 hash.
 */
export function generateOpaqueToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  return { rawToken, tokenHash };
}
