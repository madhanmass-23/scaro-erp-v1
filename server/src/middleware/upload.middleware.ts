import multer from "multer";
import { Request, Response, NextFunction } from "express";
import { config } from "../config/env.js";
import { AppError } from "../types/api.types.js";

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: config.MAX_UPLOAD_SIZE_MB * 1024 * 1024, // Upper bound in bytes
    files: 1, // Single file upload per request
  },
});

/**
 * Middleware handling multipart single file uploads with error transformation.
 */
export function uploadSingle(fieldName: string = "file") {
  const multerHandler = upload.single(fieldName);

  return (req: Request, res: Response, next: NextFunction) => {
    multerHandler(req, res, (err: any) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(
            new AppError(
              `Uploaded file exceeds maximum limit of ${config.MAX_UPLOAD_SIZE_MB}MB.`,
              413,
              "FILE_TOO_LARGE"
            )
          );
        }
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return next(
            new AppError(
              `Unexpected field '${err.field}'. File must be uploaded using field name '${fieldName}'.`,
              400,
              "INVALID_UPLOAD_FIELD"
            )
          );
        }
        return next(new AppError(`Upload error: ${err.message}`, 400, "UPLOAD_ERROR"));
      } else if (err) {
        return next(new AppError(`Upload failed: ${err.message}`, 500, "UPLOAD_ERROR"));
      }

      next();
    });
  };
}
