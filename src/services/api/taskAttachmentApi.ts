/**
 * Task Attachment API Service for SCARO ERP Frontend.
 * 
 * Handles binary file uploads, metadata persistence, signed URL generation,
 * and deletion for task attachments via Node.js backend.
 */

import { storageApi } from './storageApi';
import { taskApi, type TaskAttachmentDto } from './taskApi';
import type { TaskAttachment } from '../../types/task';

export const taskAttachmentApi = {
  /**
   * Retrieves all attachments for a task.
   */
  async getAttachments(taskId: string): Promise<TaskAttachment[]> {
    const rawAttachments = await taskApi.getAttachments(taskId);
    return rawAttachments.map((a: TaskAttachmentDto) => ({
      id: a.id,
      task_id: a.task_id,
      uploaded_by: a.uploaded_by,
      file_name: a.file_name,
      storage_path: a.storage_path,
      file_size: a.file_size,
      file_type: a.file_type,
      created_at: a.created_at,
      uploader: {
        id: a.uploaded_by,
        full_name: a.uploader_name,
      },
    }));
  },

  /**
   * Uploads a task attachment binary and records its metadata.
   */
  async uploadAttachment(taskId: string, file: File): Promise<TaskAttachment> {
    // 1. Upload binary file to Node.js backend storage under 'task-attachments' bucket
    const uploadResult = await storageApi.uploadFile('task-attachments', file, {
      entityId: taskId,
      fileName: file.name,
    });

    // 2. Persist attachment metadata record in MariaDB via tasks API
    const meta = await taskApi.addAttachment(taskId, {
      file_name: file.name,
      storage_path: uploadResult.filename,
      file_size: file.size,
      file_type: file.type || uploadResult.mimeType || 'application/octet-stream',
    });

    return {
      id: meta.id,
      task_id: meta.task_id,
      uploaded_by: meta.uploaded_by,
      file_name: meta.file_name,
      storage_path: meta.storage_path,
      file_size: meta.file_size,
      file_type: meta.file_type,
      created_at: meta.created_at,
      uploader: {
        id: meta.uploaded_by,
        full_name: meta.uploader_name,
      },
    };
  },

  /**
   * Generates a temporary HMAC-SHA256 signed download URL for an attachment.
   */
  async getAttachmentSignedUrl(storagePath: string, expiresInMinutes: number = 30): Promise<string> {
    // Clean filename from possible folder path
    const filename = storagePath.includes('/') ? storagePath.split('/').pop() || storagePath : storagePath;
    
    // If it's already an absolute URL (legacy or external), return directly
    if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
      return storagePath;
    }

    const { url } = await storageApi.getSignedUrl('task-attachments', filename, expiresInMinutes);
    return storageApi.resolveUrl(url) || url;
  },

  /**
   * Deletes an attachment metadata record and unlinks its physical file.
   */
  async deleteAttachment(taskId: string, attachmentId: string, storagePath?: string): Promise<void> {
    // 1. Delete database metadata record
    await taskApi.deleteAttachment(taskId, attachmentId);

    // 2. Delete physical storage asset if filename/path provided
    if (storagePath) {
      const filename = storagePath.includes('/') ? storagePath.split('/').pop() || storagePath : storagePath;
      await storageApi.deleteFile('task-attachments', filename).catch((err) => {
        console.warn('[STORAGE] Physical attachment cleanup warning:', err);
      });
    }
  },
};
