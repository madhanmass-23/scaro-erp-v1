import path from "path";
import { storageDriver } from "../storage/drivers/driver.factory.js";
import { StorageBucket, StorageFileMetadata } from "../storage/drivers/storage.driver.interface.js";
import { validateUploadedFile } from "../utils/fileValidator.util.js";
import { ImageProcessor } from "../utils/imageProcessor.util.js";
import { SignedUrlGenerator, SignedUrlOptions } from "../utils/signedUrl.util.js";
import { storageAuthService } from "./storageAuth.service.js";
import { UserRoleInfo } from "./rbac.service.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { AppError } from "../types/api.types.js";
import { config } from "../config/env.js";

export interface UploadFileOptions {
  bucket: StorageBucket;
  fileBuffer: Buffer;
  originalName: string;
  mimeType: string;
  entityId?: string; // e.g. target userId, taskId, reportId
  generateThumbnail?: boolean;
}

export interface UploadResult {
  bucket: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
  createdAt: string;
}

export class StorageService {
  /**
   * Initializes storage driver and creates directories.
   */
  async init(): Promise<void> {
    await storageDriver.init();
  }

  /**
   * Uploads and stores a file with validation, image processing, and security checks.
   */
  async uploadFile(options: UploadFileOptions, callerAuth: UserRoleInfo): Promise<UploadResult> {
    const { bucket, fileBuffer, originalName, mimeType, entityId, generateThumbnail } = options;

    // 1. Ownership and RBAC upload check
    const authCheck = await storageAuthService.canUpload(bucket, entityId, callerAuth);
    if (!authCheck.allowed) {
      throw new AppError(authCheck.reason || "Forbidden: You cannot upload to this resource.", 403, "FORBIDDEN");
    }

    // 2. Validate file (size, extension, MIME, magic bytes)
    const { sanitizedFilename } = validateUploadedFile({
      bucket,
      originalName,
      mimeType,
      size: fileBuffer.length,
      buffer: fileBuffer,
    });

    let bufferToSave = fileBuffer;
    let finalMime = mimeType;
    let finalFilename = sanitizedFilename;
    let thumbnailUrl: string | undefined;

    // 3. Image Processing & Avatar sanitization
    if (bucket === "avatars" && ImageProcessor.isImage(mimeType)) {
      const processed = await ImageProcessor.processAvatar(fileBuffer);
      bufferToSave = processed.buffer;
      finalMime = processed.mimeType;
      // Use .webp extension for processed avatars
      const ext = path.extname(sanitizedFilename);
      finalFilename = sanitizedFilename.replace(ext, ".webp");
    }

    // 4. Save main file using active driver
    const savedMeta = await storageDriver.save(bucket, finalFilename, bufferToSave, finalMime, {
      originalName,
      uploadedBy: callerAuth.userId,
      entityId,
    });

    // 5. Generate Thumbnail if requested or for images
    if ((generateThumbnail || bucket === "avatars") && ImageProcessor.isImage(finalMime)) {
      try {
        const thumb = await ImageProcessor.generateThumbnail(bufferToSave, 200);
        const thumbFilename = `thumb_${finalFilename}`;
        await storageDriver.save("thumbnails", thumbFilename, thumb.buffer, thumb.mimeType);
        thumbnailUrl = `${config.STORAGE_BASE_URL}/file/thumbnails/${thumbFilename}`;
      } catch (err) {
        console.warn("[STORAGE] Thumbnail generation warning:", err);
      }
    }

    // 6. Audit Logging
    await auditRepository.log({
      actor_id: callerAuth.userId,
      action: "FILE_UPLOAD",
      table_name: "storage",
      record_id: finalFilename,
      new_value: {
        bucket,
        filename: finalFilename,
        originalName,
        size: savedMeta.size,
        mimeType: finalMime,
      },
    });

    const fileUrl = `${config.STORAGE_BASE_URL}/file/${bucket}/${finalFilename}`;

    return {
      bucket,
      filename: finalFilename,
      originalName,
      mimeType: finalMime,
      size: savedMeta.size,
      url: fileUrl,
      thumbnailUrl,
      createdAt: savedMeta.createdAt.toISOString(),
    };
  }

  /**
   * Retrieves a readable file stream with authorization verification.
   */
  async getFileStream(
    bucket: StorageBucket,
    filename: string,
    callerAuth: UserRoleInfo
  ): Promise<{ stream: NodeJS.ReadableStream; metadata: StorageFileMetadata }> {
    const authCheck = await storageAuthService.canDownload(bucket, filename, callerAuth);
    if (!authCheck.allowed) {
      throw new AppError(authCheck.reason || "Forbidden: You cannot access this file.", 403, "FORBIDDEN");
    }

    const metadata = await storageDriver.getMetadata(bucket, filename);
    if (!metadata) {
      throw new AppError("File not found in storage.", 404, "FILE_NOT_FOUND");
    }

    const stream = storageDriver.createReadStream(bucket, filename);

    // Audit Logging
    await auditRepository.log({
      actor_id: callerAuth.userId,
      action: "FILE_DOWNLOAD",
      table_name: "storage",
      record_id: filename,
      new_value: { bucket, filename },
    });

    return { stream, metadata };
  }

  /**
   * Generates a temporary signed download URL for secure client access.
   */
  async getSignedUrl(
    options: SignedUrlOptions,
    callerAuth: UserRoleInfo
  ): Promise<{ url: string; expiresAt: number }> {
    const { bucket, filename } = options;

    const authCheck = await storageAuthService.canDownload(bucket as StorageBucket, filename, callerAuth);
    if (!authCheck.allowed) {
      throw new AppError(authCheck.reason || "Forbidden: You cannot access this file.", 403, "FORBIDDEN");
    }

    const exists = await storageDriver.exists(bucket, filename);
    if (!exists) {
      throw new AppError("File not found in storage.", 404, "FILE_NOT_FOUND");
    }

    const result = SignedUrlGenerator.generate({
      ...options,
      userId: callerAuth.userId,
    });

    return { url: result.url, expiresAt: result.expiresAt };
  }

  /**
   * Validates a signed URL download and returns the file stream.
   */
  async downloadSignedFile(params: {
    bucket: string;
    filename: string;
    expires: string;
    signature: string;
    uid?: string;
  }): Promise<{ stream: NodeJS.ReadableStream; metadata: StorageFileMetadata }> {
    const { bucket, filename, expires, signature, uid } = params;

    // Verify HMAC signature and expiration
    SignedUrlGenerator.verify(bucket, filename, expires, signature, uid);

    const metadata = await storageDriver.getMetadata(bucket, filename);
    if (!metadata) {
      throw new AppError("File not found in storage.", 404, "FILE_NOT_FOUND");
    }

    const stream = storageDriver.createReadStream(bucket, filename);

    // Audit log
    await auditRepository.log({
      actor_id: uid || null,
      action: "FILE_DOWNLOAD",
      table_name: "storage",
      record_id: filename,
      new_value: { bucket, filename, method: "SIGNED_URL" },
    });

    return { stream, metadata };
  }

  /**
   * Deletes a file with ownership and RBAC enforcement.
   */
  async deleteFile(
    bucket: StorageBucket,
    filename: string,
    callerAuth: UserRoleInfo
  ): Promise<boolean> {
    const authCheck = await storageAuthService.canDelete(bucket, filename, callerAuth);
    if (!authCheck.allowed) {
      throw new AppError(authCheck.reason || "Forbidden: You cannot delete this file.", 403, "FORBIDDEN");
    }

    const exists = await storageDriver.exists(bucket, filename);
    if (!exists) {
      throw new AppError("File not found in storage.", 404, "FILE_NOT_FOUND");
    }

    const deleted = await storageDriver.delete(bucket, filename);

    // Also attempt deleting thumbnail if exists
    if (bucket === "avatars") {
      await storageDriver.delete("thumbnails", `thumb_${filename}`).catch(() => {});
    }

    // Audit Logging
    await auditRepository.log({
      actor_id: callerAuth.userId,
      action: "FILE_DELETE",
      table_name: "storage",
      record_id: filename,
      new_value: { bucket, filename },
    });

    return deleted;
  }

  /**
   * Retrieves file metadata.
   */
  async getMetadata(
    bucket: StorageBucket,
    filename: string,
    callerAuth: UserRoleInfo
  ): Promise<StorageFileMetadata> {
    const authCheck = await storageAuthService.canDownload(bucket, filename, callerAuth);
    if (!authCheck.allowed) {
      throw new AppError(authCheck.reason || "Forbidden: You cannot access this file.", 403, "FORBIDDEN");
    }

    const meta = await storageDriver.getMetadata(bucket, filename);
    if (!meta) {
      throw new AppError("File not found in storage.", 404, "FILE_NOT_FOUND");
    }

    return meta;
  }
}

export const storageService = new StorageService();
