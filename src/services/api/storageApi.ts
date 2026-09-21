/**
 * Centralized Storage API Service for SCARO ERP Frontend.
 * 
 * Interacts with Node.js/Express `/api/v1/storage` endpoints.
 */

import { api } from '../../lib/api';

export interface StorageUploadResponse {
  bucket: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
  createdAt: string;
}

export interface SignedUrlResponse {
  url: string;
  expiresAt: number;
}

export interface StorageFileMetadata {
  bucket: string;
  filename: string;
  size: number;
  mimeType: string;
  createdAt: string;
  updatedAt: string;
}

export const storageApi = {
  /**
   * Uploads a file to a target bucket via multipart/form-data.
   * Calls POST /api/v1/storage/upload
   */
  async uploadFile(
    bucket: 'avatars' | 'task-attachments' | 'daily-evidence' | 'temp',
    file: File | Blob,
    options?: {
      entityId?: string;
      generateThumbnail?: boolean;
      fileName?: string;
    }
  ): Promise<StorageUploadResponse> {
    const formData = new FormData();
    const resolvedName = options?.fileName || (file instanceof File ? file.name : 'upload.bin');
    formData.append('file', file, resolvedName);
    formData.append('bucket', bucket);

    if (options?.entityId) {
      formData.append('entity_id', options.entityId);
    }
    if (options?.generateThumbnail) {
      formData.append('generate_thumbnail', 'true');
    }

    return api.post<StorageUploadResponse>('/storage/upload', formData);
  },

  /**
   * Uploads a profile picture to the 'avatars' storage bucket.
   */
  async uploadAvatar(file: File, userId?: string): Promise<StorageUploadResponse> {
    return this.uploadFile('avatars', file, {
      entityId: userId,
      generateThumbnail: true,
      fileName: file.name,
    });
  },

  /**
   * Generates a temporary HMAC-SHA256 signed download URL.
   * Calls GET /api/v1/storage/signed-url/:bucket/:filename
   */
  async getSignedUrl(
    bucket: 'avatars' | 'task-attachments' | 'daily-evidence',
    filename: string,
    expiresInMinutes?: number
  ): Promise<SignedUrlResponse> {
    const params: Record<string, string | number> = {};
    if (expiresInMinutes) params.expires_in = expiresInMinutes;
    return api.get<SignedUrlResponse>(`/storage/signed-url/${bucket}/${filename}`, { params });
  },

  /**
   * Deletes a file from storage.
   * Calls DELETE /api/v1/storage/file/:bucket/:filename
   */
  async deleteFile(
    bucket: 'avatars' | 'task-attachments' | 'daily-evidence',
    filename: string
  ): Promise<{ deleted: boolean }> {
    return api.delete<{ deleted: boolean }>(`/storage/file/${bucket}/${filename}`);
  },

  /**
   * Retrieves file metadata.
   * Calls GET /api/v1/storage/meta/:bucket/:filename
   */
  async getMetadata(
    bucket: 'avatars' | 'task-attachments' | 'daily-evidence',
    filename: string
  ): Promise<StorageFileMetadata> {
    return api.get<StorageFileMetadata>(`/storage/meta/${bucket}/${filename}`);
  },

  /**
   * Normalizes a storage URL into an absolute browser-loadable URL.
   * Handles relative backend paths, absolute URLs, and external storage URLs.
   */
  resolveUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    const trimmed = url.trim();
    if (!trimmed) return null;

    if (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('data:') ||
      trimmed.startsWith('blob:')
    ) {
      return trimmed;
    }

    try {
      const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/+$/, '');
      const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
      if (apiBase.startsWith('http://') || apiBase.startsWith('https://')) {
        const serverOrigin = new URL(apiBase).origin;
        return `${serverOrigin}${cleanPath}`;
      }
      return cleanPath;
    } catch {
      return trimmed;
    }
  },
};
