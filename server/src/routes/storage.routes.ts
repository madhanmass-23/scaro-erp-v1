import { Router } from "express";
import { storageController } from "../controllers/storage.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { uploadSingle } from "../middleware/upload.middleware.js";
import {
  storageUploadRateLimiter,
  storageDownloadRateLimiter,
} from "../middleware/storageRateLimiter.js";

const router = Router();

// Signed download route (HMAC verified; allows authenticated or token-signed direct downloads)
router.get(
  "/download/signed",
  storageDownloadRateLimiter,
  storageController.downloadSigned.bind(storageController)
);

// Authenticated upload route
router.post(
  "/upload",
  storageUploadRateLimiter,
  authenticate,
  uploadSingle("file"),
  storageController.upload.bind(storageController)
);

// Authenticated signed URL generator
router.get(
  "/signed-url/:bucket/:filename",
  authenticate,
  storageController.getSignedUrl.bind(storageController)
);

// Authenticated file download / stream
router.get(
  "/file/:bucket/:filename",
  storageDownloadRateLimiter,
  authenticate,
  storageController.getFile.bind(storageController)
);

// Authenticated file metadata
router.get(
  "/meta/:bucket/:filename",
  authenticate,
  storageController.getMetadata.bind(storageController)
);

// Authenticated file deletion
router.delete(
  "/file/:bucket/:filename",
  authenticate,
  storageController.deleteFile.bind(storageController)
);

export default router;
