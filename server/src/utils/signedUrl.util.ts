import crypto from "crypto";
import { config } from "../config/env.js";
import { AppError } from "../types/api.types.js";

export interface SignedUrlOptions {
  bucket: string;
  filename: string;
  expiresInMinutes?: number;
  userId?: string;
}

export interface VerifiedSignedUrlPayload {
  bucket: string;
  filename: string;
  expiresAt: number;
  userId?: string;
}

export class SignedUrlGenerator {
  /**
   * Generates a tamper-proof HMAC-SHA256 signature for a specific storage resource.
   */
  private static generateSignature(
    bucket: string,
    filename: string,
    expiresAt: number,
    userId?: string
  ): string {
    const payload = `${bucket}:${filename}:${expiresAt}:${userId || ""}`;
    return crypto
      .createHmac("sha256", config.STORAGE_SIGNING_SECRET)
      .update(payload)
      .digest("hex");
  }

  /**
   * Creates a signed download URL valid for the specified duration.
   */
  static generate(options: SignedUrlOptions): { url: string; expiresAt: number; signature: string } {
    const { bucket, filename, userId } = options;
    const expiryMinutes = options.expiresInMinutes || config.SIGNED_URL_EXPIRY_MINUTES;
    const expiresAt = Date.now() + expiryMinutes * 60 * 1000;

    const signature = this.generateSignature(bucket, filename, expiresAt, userId);

    const queryParams = new URLSearchParams({
      bucket,
      filename,
      expires: String(expiresAt),
      signature,
    });

    if (userId) {
      queryParams.set("uid", userId);
    }

    const url = `${config.STORAGE_BASE_URL}/download/signed?${queryParams.toString()}`;

    return {
      url,
      expiresAt,
      signature,
    };
  }

  /**
   * Verifies an incoming signed download request.
   */
  static verify(
    bucket: string,
    filename: string,
    expiresStr: string,
    signature: string,
    userId?: string
  ): VerifiedSignedUrlPayload {
    if (!bucket || !filename || !expiresStr || !signature) {
      throw new AppError("Malformed signed URL parameters.", 400, "INVALID_SIGNED_URL");
    }

    const expiresAt = parseInt(expiresStr, 10);
    if (isNaN(expiresAt)) {
      throw new AppError("Invalid signed URL expiration timestamp.", 400, "INVALID_TIMESTAMP");
    }

    // Check expiration (410 Gone / 403 Expired)
    if (Date.now() > expiresAt) {
      throw new AppError("This download link has expired.", 410, "SIGNED_URL_EXPIRED");
    }

    // Expected signature calculation
    const expectedSignature = this.generateSignature(bucket, filename, expiresAt, userId);

    const expectedBuffer = Buffer.from(expectedSignature, "hex");
    const providedBuffer = Buffer.from(signature, "hex");

    if (
      expectedBuffer.length !== providedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      throw new AppError("Invalid or tampered signed URL signature.", 403, "INVALID_SIGNATURE");
    }

    return {
      bucket,
      filename,
      expiresAt,
      userId,
    };
  }
}
