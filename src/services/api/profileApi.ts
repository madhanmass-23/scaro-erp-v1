/**
 * Profile API Service for SCARO ERP Frontend.
 * 
 * Provides domain-specific operations for personal and workforce profile management.
 */

import { userApi, type SafeUserProfile, type UpdateSelfProfilePayload } from './userApi';

export const profileApi = {
  /**
   * Retrieves the current user's profile.
   */
  async getMyProfile(): Promise<SafeUserProfile> {
    return userApi.getMyProfile();
  },

  /**
   * Updates self-service fields on the current user's profile.
   */
  async updateMyProfile(payload: UpdateSelfProfilePayload): Promise<SafeUserProfile> {
    return userApi.updateMyProfile(payload);
  },

  /**
   * Retrieves a user profile by ID.
   */
  async getProfileById(userId: string): Promise<SafeUserProfile> {
    return userApi.getUserById(userId);
  },
};

export type { SafeUserProfile, UpdateSelfProfilePayload };
