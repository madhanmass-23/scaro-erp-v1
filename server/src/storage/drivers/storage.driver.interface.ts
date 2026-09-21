export type StorageBucket =
  | "avatars"
  | "task-attachments"
  | "daily-evidence"
  | "temp"
  | "thumbnails";

export interface StorageFileMetadata {
  bucket: string;
  filename: string;
  size: number;
  mimeType: string;
  createdAt: Date;
  updatedAt: Date;
  etag?: string;
  customMetadata?: Record<string, any>;
}

export interface IStorageDriver {
  readonly name: string;

  /**
   * Initializes the storage driver and ensures required buckets/directories exist.
   */
  init(): Promise<void>;

  /**
   * Writes a file buffer to storage.
   */
  save(
    bucket: string,
    filename: string,
    buffer: Buffer,
    mimeType?: string,
    customMetadata?: Record<string, any>
  ): Promise<StorageFileMetadata>;

  /**
   * Reads an entire file buffer from storage.
   */
  read(bucket: string, filename: string): Promise<Buffer>;

  /**
   * Returns a readable stream for the file.
   */
  createReadStream(bucket: string, filename: string): NodeJS.ReadableStream;

  /**
   * Deletes a file from storage. Returns true if removed, false if not found.
   */
  delete(bucket: string, filename: string): Promise<boolean>;

  /**
   * Checks if a file exists in the specified bucket.
   */
  exists(bucket: string, filename: string): Promise<boolean>;

  /**
   * Retrieves metadata for a file in the bucket.
   */
  getMetadata(bucket: string, filename: string): Promise<StorageFileMetadata | null>;

  /**
   * Gets absolute path on local disk if supported by driver (never exposed to client).
   */
  getAbsolutePath?(bucket: string, filename: string): string;
}
