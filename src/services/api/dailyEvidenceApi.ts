/**
 * Daily Evidence API Service for SCARO ERP Frontend.
 * 
 * Handles binary file uploads, metadata persistence, signed URL generation,
 * and deletion for daily report evidence attachments via Node.js backend.
 */

import { storageApi } from './storageApi';
import { dailyReportApi, type SafeDailyReportAttachmentDto } from './dailyReportApi';

export const dailyEvidenceApi = {
  /**
   * Retrieves all evidence attachments for a daily report.
   */
  async getAttachments(reportId: string): Promise<SafeDailyReportAttachmentDto[]> {
    return dailyReportApi.getAttachments(reportId);
  },

  /**
   * Uploads an evidence file to a daily report.
   * 
   * 1. Performs binary multipart upload via storageApi to 'daily-evidence' bucket.
   * 2. Persists attachment metadata record in MariaDB via dailyReportApi.
   * 3. Returns the persisted attachment DTO.
   */
  async uploadEvidence(reportId: string, file: File): Promise<SafeDailyReportAttachmentDto> {
    // 1. Upload binary file to Node.js backend storage under 'daily-evidence' bucket
    const uploadResult = await storageApi.uploadFile('daily-evidence', file, {
      entityId: reportId,
    });

    const storagePath = uploadResult.filename;

    try {
      // 2. Persist metadata record in MariaDB daily_report_attachments table
      const meta = await dailyReportApi.addAttachment(reportId, {
        file_name: file.name,
        storage_path: storagePath,
        file_size: file.size,
        file_type: file.type || 'application/octet-stream',
      });

      return meta;
    } catch (metaErr) {
      // Rollback physical file if metadata creation fails
      await storageApi.deleteFile('daily-evidence', storagePath).catch((delErr) => {
        console.warn('Failed to cleanup orphan evidence file after metadata failure:', delErr);
      });
      throw metaErr;
    }
  },

  /**
   * Retrieves a secure HMAC-signed temporary download/preview URL for an evidence file.
   */
  async getEvidenceSignedUrl(storagePath: string, expiresInMinutes: number = 30): Promise<string> {
    // If storagePath is a full path (e.g. legacy or nested), extract filename
    const filename = storagePath.includes('/') ? storagePath.split('/').pop() || storagePath : storagePath;
    const { url } = await storageApi.getSignedUrl('daily-evidence', filename, expiresInMinutes);
    return storageApi.resolveUrl(url) || url;
  },

  /**
   * Deletes an evidence attachment metadata record and its associated physical file.
   */
  async deleteEvidence(reportId: string, attachmentId: string, storagePath?: string): Promise<void> {
    // 1. Delete metadata from MariaDB
    await dailyReportApi.deleteAttachment(reportId, attachmentId);

    // 2. Delete physical file from storage if storagePath provided
    if (storagePath) {
      const filename = storagePath.includes('/') ? storagePath.split('/').pop() || storagePath : storagePath;
      await storageApi.deleteFile('daily-evidence', filename).catch((err) => {
        console.warn('Physical evidence file cleanup warning:', err);
      });
    }
  },
};
