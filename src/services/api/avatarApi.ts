import { storageApi, type StorageUploadResponse } from './storageApi';

export const avatarApi = {
  /**
   * Uploads an avatar image.
   */
  async uploadAvatar(file: File, userId?: string): Promise<StorageUploadResponse> {
    return storageApi.uploadAvatar(file, userId);
  },

  /**
   * Resolves an avatar URL for browser display.
   */
  resolveAvatarUrl(url: string | null | undefined): string | null {
    return storageApi.resolveUrl(url);
  },

  /**
   * Deletes an avatar.
   */
  async deleteAvatar(filename: string): Promise<{ deleted: boolean }> {
    return storageApi.deleteFile('avatars', filename);
  },
};
