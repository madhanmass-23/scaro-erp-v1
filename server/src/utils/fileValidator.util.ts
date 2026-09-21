import path from "path";
import crypto from "crypto";
import { AppError } from "../types/api.types.js";
import { StorageBucket } from "../storage/drivers/storage.driver.interface.js";

export interface BucketValidationRules {
  maxSize: number; // in bytes
  allowedExtensions: string[];
  allowedMimes: string[];
}

export const BUCKET_RULES: Record<StorageBucket, BucketValidationRules> = {
  avatars: {
    maxSize: 5 * 1024 * 1024, // 5 MB
    allowedExtensions: ["jpg", "jpeg", "png", "webp"],
    allowedMimes: ["image/jpeg", "image/png", "image/webp"],
  },
  "task-attachments": {
    maxSize: 20 * 1024 * 1024, // 20 MB
    allowedExtensions: [
      "jpg",
      "jpeg",
      "png",
      "webp",
      "pdf",
      "doc",
      "docx",
      "xls",
      "xlsx",
      "csv",
      "ppt",
      "pptx",
      "txt",
      "zip",
    ],
    allowedMimes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
      "application/zip",
      "application/x-zip-compressed",
      "application/octet-stream", // commonly sent by browsers for zip/binary
    ],
  },
  "daily-evidence": {
    maxSize: 15 * 1024 * 1024, // 15 MB
    allowedExtensions: [
      "jpg",
      "jpeg",
      "png",
      "webp",
      "pdf",
      "doc",
      "docx",
      "xls",
      "xlsx",
      "csv",
      "txt",
      "zip",
    ],
    allowedMimes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "text/plain",
      "application/zip",
      "application/x-zip-compressed",
      "application/octet-stream",
    ],
  },
  temp: {
    maxSize: 20 * 1024 * 1024,
    allowedExtensions: ["jpg", "jpeg", "png", "webp", "pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "zip"],
    allowedMimes: ["*/*"],
  },
  thumbnails: {
    maxSize: 2 * 1024 * 1024,
    allowedExtensions: ["webp", "jpg", "png"],
    allowedMimes: ["image/webp", "image/jpeg", "image/png"],
  },
};

export const DANGEROUS_EXTENSIONS = new Set([
  "exe",
  "dll",
  "bat",
  "cmd",
  "js",
  "mjs",
  "cjs",
  "ts",
  "ps1",
  "sh",
  "bash",
  "apk",
  "iso",
  "com",
  "vbs",
  "scr",
  "jar",
  "msi",
  "bin",
  "elf",
  "pif",
  "hta",
  "cpl",
  "ins",
  "isp",
  "reg",
  "wsf",
  "wsh",
  "php",
  "py",
  "rb",
  "pl",
  "cgi",
]);

/**
 * Validates magic byte signatures from the file buffer to prevent MIME spoofing.
 */
export function verifyBufferMagicBytes(buffer: Buffer, declaredExt: string): boolean {
  if (!buffer || buffer.length === 0) {
    return false;
  }

  const ext = declaredExt.toLowerCase().replace(".", "");

  // Check for dangerous binary executable headers first
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    // Windows PE / EXE / DLL header "MZ"
    return false;
  }
  if (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    // Linux ELF binary header "\x7fELF"
    return false;
  }

  switch (ext) {
    case "jpg":
    case "jpeg":
      // JPEG: FF D8 FF
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

    case "png":
      // PNG: 89 50 4E 47 0D 0A 1A 0A
      return (
        buffer.length >= 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
      );

    case "webp":
      // WebP: RIFF ... WEBP
      if (buffer.length < 12) return false;
      const isRiff = buffer.toString("ascii", 0, 4) === "RIFF";
      const isWebp = buffer.toString("ascii", 8, 12) === "WEBP";
      return isRiff && isWebp;

    case "pdf":
      // PDF: %PDF-
      if (buffer.length < 4) return false;
      return buffer.toString("ascii", 0, 4) === "%PDF";

    case "zip":
    case "docx":
    case "xlsx":
    case "pptx":
      // ZIP archive header: PK\x03\x04 or PK\x05\x06
      if (buffer.length < 4) return false;
      return (
        (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) ||
        (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x05 && buffer[3] === 0x06)
      );

    case "doc":
    case "xls":
    case "ppt":
      // MS Compound Binary File format: D0 CF 11 E0 A1 B1 1A E1
      if (buffer.length >= 8) {
        if (
          buffer[0] === 0xd0 &&
          buffer[1] === 0xcf &&
          buffer[2] === 0x11 &&
          buffer[3] === 0xe0 &&
          buffer[4] === 0xa1 &&
          buffer[5] === 0xb1 &&
          buffer[6] === 0x1a &&
          buffer[7] === 0xe1
        ) {
          return true;
        }
      }
      return true;

    case "txt":
    case "csv":
      // Verify text has no control null bytes
      const sampleSize = Math.min(buffer.length, 1024);
      for (let i = 0; i < sampleSize; i++) {
        if (buffer[i] === 0) {
          return false; // Null byte found in text file
        }
      }
      return true;

    default:
      return true;
  }
}

/**
 * Validates an upload against bucket rules, extension allow-lists, and binary headers.
 */
export function validateUploadedFile(params: {
  bucket: StorageBucket;
  originalName: string;
  mimeType: string;
  size: number;
  buffer?: Buffer;
}): { sanitizedFilename: string; ext: string } {
  const { bucket, originalName, mimeType, size, buffer } = params;

  const rules = BUCKET_RULES[bucket];
  if (!rules) {
    throw new AppError(`Unknown storage bucket '${bucket}'.`, 400, "INVALID_BUCKET");
  }

  // 1. File size check
  if (size <= 0) {
    throw new AppError("Uploaded file is empty.", 400, "EMPTY_FILE");
  }
  if (size > rules.maxSize) {
    const maxMb = Math.round(rules.maxSize / (1024 * 1024));
    throw new AppError(
      `File size exceeds maximum allowed limit of ${maxMb}MB for bucket '${bucket}'.`,
      413,
      "FILE_TOO_LARGE"
    );
  }

  // 2. Filename and extension extraction
  const rawExt = path.extname(originalName || "").toLowerCase().replace(".", "");
  if (!rawExt) {
    throw new AppError("Uploaded file lacks a valid file extension.", 400, "MISSING_EXTENSION");
  }

  // 3. Dangerous extension rejection
  if (DANGEROUS_EXTENSIONS.has(rawExt)) {
    throw new AppError(
      `File type '.${rawExt}' is strictly forbidden for security reasons.`,
      415,
      "FORBIDDEN_FILE_TYPE"
    );
  }

  // 4. Bucket allowed extensions
  if (!rules.allowedExtensions.includes(rawExt)) {
    throw new AppError(
      `File extension '.${rawExt}' is not permitted in bucket '${bucket}'. Allowed: ${rules.allowedExtensions.join(", ")}`,
      415,
      "UNSUPPORTED_MEDIA_TYPE"
    );
  }

  // 5. Bucket allowed MIME types
  if (!rules.allowedMimes.includes("*/*")) {
    const isMimeAllowed = rules.allowedMimes.some(
      (m) => m.toLowerCase() === mimeType.toLowerCase() || m.startsWith(mimeType.split("/")[0] + "/*")
    );
    if (!isMimeAllowed) {
      throw new AppError(
        `MIME type '${mimeType}' is not permitted for bucket '${bucket}'.`,
        415,
        "INVALID_MIME_TYPE"
      );
    }
  }

  // 6. Magic byte header verification if buffer available
  if (buffer && buffer.length > 0) {
    const isHeaderValid = verifyBufferMagicBytes(buffer, rawExt);
    if (!isHeaderValid) {
      throw new AppError(
        `File content does not match declared extension '.${rawExt}' (MIME spoofing detected).`,
        400,
        "MIME_SPOOFING_DETECTED"
      );
    }
  }

  // 7. Generate clean UUID filename
  const uuid = crypto.randomUUID();
  const sanitizedFilename = `${uuid}.${rawExt}`;

  return { sanitizedFilename, ext: rawExt };
}
