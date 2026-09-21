import { Request, Response, NextFunction } from "express";
import { storageService } from "../services/storage.service.js";
import { StorageBucket } from "../storage/drivers/storage.driver.interface.js";
import { rbacService } from "../services/rbac.service.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { AppError } from "../types/api.types.js";

export class StorageController {
  /**
   * POST /api/v1/storage/upload
   * Authenticated file upload handler.
   */
  async upload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.id) {
        throw new AppError("Authentication required.", 401, "UNAUTHENTICATED");
      }

      if (!req.file) {
        throw new AppError("No file uploaded. Please supply a file in the multipart body.", 400, "MISSING_FILE");
      }

      const bucket = (req.body.bucket || "temp").toLowerCase() as StorageBucket;
      const entityId = req.body.entity_id ? String(req.body.entity_id).trim() : undefined;
      const generateThumbnail = req.body.generate_thumbnail === "true" || req.body.generate_thumbnail === true;

      const auth = await rbacService.getUserRoleAndPermissions(req.user.id);

      const result = await storageService.uploadFile(
        {
          bucket,
          fileBuffer: req.file.buffer,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          entityId,
          generateThumbnail,
        },
        auth
      );

      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/storage/file/:bucket/:filename
   * Authenticated file download / stream.
   */
  async getFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.id) {
        throw new AppError("Authentication required.", 401, "UNAUTHENTICATED");
      }

      const bucket = String(req.params.bucket || "");
      const filename = String(req.params.filename || "");
      const auth = await rbacService.getUserRoleAndPermissions(req.user.id);

      const { stream, metadata } = await storageService.getFileStream(
        bucket as StorageBucket,
        filename,
        auth
      );

      res.setHeader("Content-Type", metadata.mimeType || "application/octet-stream");
      res.setHeader("Content-Length", String(metadata.size));
      res.setHeader("Cache-Control", "private, max-age=3600");

      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/storage/signed-url/:bucket/:filename
   * Generates a temporary HMAC signed download URL.
   */
  async getSignedUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.id) {
        throw new AppError("Authentication required.", 401, "UNAUTHENTICATED");
      }

      const bucket = String(req.params.bucket || "");
      const filename = String(req.params.filename || "");
      const expiresIn = req.query.expires_in ? parseInt(String(req.query.expires_in), 10) : undefined;
      const auth = await rbacService.getUserRoleAndPermissions(req.user.id);

      const result = await storageService.getSignedUrl(
        {
          bucket,
          filename,
          expiresInMinutes: expiresIn,
        },
        auth
      );

      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/storage/download/signed
   * Public/Direct download via HMAC signed URL with expiration validation.
   */
  async downloadSigned(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const bucket = String(req.query.bucket || "");
      const filename = String(req.query.filename || "");
      const expires = String(req.query.expires || "");
      const signature = String(req.query.signature || "");
      const uid = req.query.uid ? String(req.query.uid) : undefined;

      const { stream, metadata } = await storageService.downloadSignedFile({
        bucket,
        filename,
        expires,
        signature,
        uid,
      });

      res.setHeader("Content-Type", metadata.mimeType || "application/octet-stream");
      res.setHeader("Content-Length", String(metadata.size));
      res.setHeader("Cache-Control", "private, max-age=1800");

      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/v1/storage/file/:bucket/:filename
   * Authenticated file deletion with RBAC & ownership check.
   */
  async deleteFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.id) {
        throw new AppError("Authentication required.", 401, "UNAUTHENTICATED");
      }

      const bucket = String(req.params.bucket || "");
      const filename = String(req.params.filename || "");
      const auth = await rbacService.getUserRoleAndPermissions(req.user.id);

      await storageService.deleteFile(bucket as StorageBucket, filename, auth);

      sendSuccess(res, { deleted: true }, 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/storage/meta/:bucket/:filename
   * Retrieves metadata for a file.
   */
  async getMetadata(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.id) {
        throw new AppError("Authentication required.", 401, "UNAUTHENTICATED");
      }

      const bucket = String(req.params.bucket || "");
      const filename = String(req.params.filename || "");
      const auth = await rbacService.getUserRoleAndPermissions(req.user.id);

      const metadata = await storageService.getMetadata(bucket as StorageBucket, filename, auth);

      sendSuccess(res, metadata);
    } catch (err) {
      next(err);
    }
  }
}

export const storageController = new StorageController();
