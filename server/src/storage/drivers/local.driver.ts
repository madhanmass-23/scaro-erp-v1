import fs from "fs";
import path from "path";
import crypto from "crypto";
import { IStorageDriver, StorageFileMetadata } from "./storage.driver.interface.js";
import { AppError } from "../../types/api.types.js";

export class LocalStorageDriver implements IStorageDriver {
  readonly name = "local";
  private rootDir: string;
  private readonly requiredBuckets = [
    "avatars",
    "task-attachments",
    "daily-evidence",
    "temp",
    "thumbnails",
    "logs",
  ];

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
  }

  /**
   * Initializes directory structure on the local filesystem.
   */
  async init(): Promise<void> {
    try {
      if (!fs.existsSync(this.rootDir)) {
        await fs.promises.mkdir(this.rootDir, { recursive: true });
      }

      for (const bucket of this.requiredBuckets) {
        const bucketPath = path.join(this.rootDir, bucket);
        if (!fs.existsSync(bucketPath)) {
          await fs.promises.mkdir(bucketPath, { recursive: true });
        }
      }
    } catch (err: any) {
      console.error("[STORAGE_DRIVER] Failed to initialize local storage directories:", err);
      throw new AppError(
        `Failed to initialize local storage root at ${this.rootDir}`,
        500,
        "STORAGE_INIT_FAILED"
      );
    }
  }

  /**
   * Resolves and securely validates a file path within a bucket, preventing path traversal.
   */
  private resolveSecurePath(bucket: string, filename: string): string {
    if (!bucket || typeof bucket !== "string") {
      throw new AppError("Invalid storage bucket name.", 400, "INVALID_BUCKET");
    }

    if (!filename || typeof filename !== "string") {
      throw new AppError("Invalid filename.", 400, "INVALID_FILENAME");
    }

    // Reject null bytes and control characters
    if (filename.includes("\0") || bucket.includes("\0")) {
      throw new AppError("Malformed storage path with null bytes.", 400, "INVALID_PATH");
    }

    // Reject path traversal indicators in filename and bucket
    if (
      filename.includes("..") ||
      bucket.includes("..") ||
      filename.includes("/") ||
      filename.includes("\\") ||
      bucket.includes("/") ||
      bucket.includes("\\") ||
      path.isAbsolute(filename) ||
      path.isAbsolute(bucket)
    ) {
      throw new AppError("Access denied: Path traversal detected.", 403, "PATH_TRAVERSAL_DETECTED");
    }

    // Clean bucket and filename
    const cleanBucket = bucket.trim().toLowerCase();
    const cleanFilename = filename.trim();

    if (!cleanBucket || !cleanFilename) {
      throw new AppError("Invalid storage path components.", 400, "INVALID_PATH");
    }

    const bucketDir = path.resolve(this.rootDir, cleanBucket);
    const resolvedPath = path.resolve(bucketDir, cleanFilename);

    // Ensure the resolved target path is strictly inside the bucket directory
    const expectedPrefix = bucketDir + path.sep;
    if (resolvedPath !== bucketDir && !resolvedPath.startsWith(expectedPrefix)) {
      throw new AppError("Access denied: Path traversal detected.", 403, "PATH_TRAVERSAL_DETECTED");
    }

    return resolvedPath;
  }

  /**
   * Saves a file buffer to the bucket.
   */
  async save(
    bucket: string,
    filename: string,
    buffer: Buffer,
    mimeType?: string,
    customMetadata?: Record<string, any>
  ): Promise<StorageFileMetadata> {
    const filePath = this.resolveSecurePath(bucket, filename);
    const bucketDir = path.dirname(filePath);

    if (!fs.existsSync(bucketDir)) {
      await fs.promises.mkdir(bucketDir, { recursive: true });
    }

    // Atomic write via temp file
    const tempFile = path.join(
      this.rootDir,
      "temp",
      `tmp_${crypto.randomUUID()}_${path.basename(filename)}`
    );

    try {
      await fs.promises.writeFile(tempFile, buffer);
      await fs.promises.rename(tempFile, filePath);
    } catch (err: any) {
      if (fs.existsSync(tempFile)) {
        await fs.promises.unlink(tempFile).catch(() => {});
      }
      console.error("[STORAGE_DRIVER] Write error:", err);
      throw new AppError("Failed to write file to storage.", 500, "STORAGE_WRITE_ERROR");
    }

    const stat = await fs.promises.stat(filePath);
    const hash = crypto.createHash("md5").update(buffer).digest("hex");

    return {
      bucket,
      filename,
      size: stat.size,
      mimeType: mimeType || "application/octet-stream",
      createdAt: stat.birthtime,
      updatedAt: stat.mtime,
      etag: hash,
      customMetadata,
    };
  }

  /**
   * Reads a file buffer from storage.
   */
  async read(bucket: string, filename: string): Promise<Buffer> {
    const filePath = this.resolveSecurePath(bucket, filename);
    try {
      return await fs.promises.readFile(filePath);
    } catch (err: any) {
      if (err.code === "ENOENT") {
        throw new AppError("File not found in storage.", 404, "FILE_NOT_FOUND");
      }
      throw new AppError("Failed to read file from storage.", 500, "STORAGE_READ_ERROR");
    }
  }

  /**
   * Returns a readable stream for high performance file transfers.
   */
  createReadStream(bucket: string, filename: string): NodeJS.ReadableStream {
    const filePath = this.resolveSecurePath(bucket, filename);
    if (!fs.existsSync(filePath)) {
      throw new AppError("File not found in storage.", 404, "FILE_NOT_FOUND");
    }
    return fs.createReadStream(filePath);
  }

  /**
   * Deletes a file from storage.
   */
  async delete(bucket: string, filename: string): Promise<boolean> {
    const filePath = this.resolveSecurePath(bucket, filename);
    try {
      await fs.promises.unlink(filePath);
      return true;
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return false;
      }
      console.error("[STORAGE_DRIVER] Delete error:", err);
      throw new AppError("Failed to delete file from storage.", 500, "STORAGE_DELETE_ERROR");
    }
  }

  /**
   * Checks if a file exists.
   */
  async exists(bucket: string, filename: string): Promise<boolean> {
    try {
      const filePath = this.resolveSecurePath(bucket, filename);
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Retrieves metadata for a file.
   */
  async getMetadata(bucket: string, filename: string): Promise<StorageFileMetadata | null> {
    try {
      const filePath = this.resolveSecurePath(bucket, filename);
      const stat = await fs.promises.stat(filePath);
      return {
        bucket,
        filename,
        size: stat.size,
        mimeType: "application/octet-stream",
        createdAt: stat.birthtime,
        updatedAt: stat.mtime,
      };
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return null;
      }
      throw new AppError("Failed to retrieve file metadata.", 500, "STORAGE_METADATA_ERROR");
    }
  }

  /**
   * Internal absolute path on disk (never exposed in API outputs).
   */
  getAbsolutePath(bucket: string, filename: string): string {
    return this.resolveSecurePath(bucket, filename);
  }
}
