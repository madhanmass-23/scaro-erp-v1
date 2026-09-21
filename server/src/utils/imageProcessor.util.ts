import sharp, { Metadata } from "sharp";
import { config } from "../config/env.js";
import { AppError } from "../types/api.types.js";

export interface ProcessedImageResult {
  buffer: Buffer;
  format: "webp" | "jpeg" | "png";
  mimeType: string;
  width?: number;
  height?: number;
  size: number;
}

export class ImageProcessor {
  /**
   * Checks if a mime type is an image supported by the image pipeline.
   */
  static isImage(mimeType: string): boolean {
    if (!mimeType) return false;
    const lower = mimeType.toLowerCase();
    return (
      lower === "image/jpeg" ||
      lower === "image/jpg" ||
      lower === "image/png" ||
      lower === "image/webp"
    );
  }

  /**
   * Processes and sanitizes user avatars:
   * - Strips dangerous EXIF, location tags, comments
   * - Resizes to max dimension while preserving aspect ratio
   * - Re-encodes as optimized WebP
   */
  static async processAvatar(
    inputBuffer: Buffer,
    maxDimension: number = config.IMAGE_MAX_DIMENSION
  ): Promise<ProcessedImageResult> {
    try {
      const pipeline = sharp(inputBuffer, { failOn: "none" })
        .rotate() // Automatically rotate based on EXIF orientation
        .resize(maxDimension, maxDimension, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 85, effort: 4 });

      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

      return {
        buffer: data,
        format: "webp",
        mimeType: "image/webp",
        width: info.width,
        height: info.height,
        size: info.size,
      };
    } catch (err: any) {
      console.error("[IMAGE_PROCESSOR] Avatar processing failed:", err);
      throw new AppError("Failed to process image file.", 422, "IMAGE_PROCESSING_FAILED");
    }
  }

  /**
   * Generates a square or constrained thumbnail image.
   */
  static async generateThumbnail(
    inputBuffer: Buffer,
    size: number = 200
  ): Promise<ProcessedImageResult> {
    try {
      const pipeline = sharp(inputBuffer, { failOn: "none" })
        .rotate()
        .resize(size, size, {
          fit: "cover",
          position: sharp.strategy.attention,
        })
        .webp({ quality: 80, effort: 4 });

      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

      return {
        buffer: data,
        format: "webp",
        mimeType: "image/webp",
        width: info.width,
        height: info.height,
        size: info.size,
      };
    } catch (err: any) {
      console.error("[IMAGE_PROCESSOR] Thumbnail generation failed:", err);
      throw new AppError("Failed to generate image thumbnail.", 422, "THUMBNAIL_FAILED");
    }
  }

  /**
   * Inspects image metadata (dimensions, format, channels).
   */
  static async getMetadata(buffer: Buffer): Promise<Metadata> {
    try {
      return await sharp(buffer).metadata();
    } catch (err: any) {
      throw new AppError("Invalid or corrupted image metadata.", 400, "INVALID_IMAGE");
    }
  }
}
