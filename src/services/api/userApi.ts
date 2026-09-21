/**
 * Users API Service for SCARO ERP Frontend.
 * 
 * Interacts with Node.js/Express `/api/v1/users` endpoints backed by MariaDB.
 */

import { api } from '../../lib/api';

export interface SafeUserProfile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  department_id: string | null;
  department: string | null;
  designation: string | null;
  joining_date: string | null;
  employment_status: string;
  is_active: boolean;
  linkedin: string | null;
  github: string | null;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface UserListFilter {
  role?: string;
  department_id?: string;
  employment_status?: string;
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface UpdateSelfProfilePayload {
  full_name?: string;
  phone?: string | null;
  avatar_url?: string | null;
  linkedin?: string | null;
  github?: string | null;
}

export interface UpdateUserProfilePayload extends UpdateSelfProfilePayload {
  designation?: string | null;
  department_id?: string | null;
  joining_date?: string | null;
  employment_status?: string;
  is_active?: boolean;
  role_id?: string;
}

export const userApi = {
  /**
   * Retrieves current authenticated user's profile.
   * Calls GET /api/v1/users/me
   */
  async getMyProfile(): Promise<SafeUserProfile> {
    return api.get<SafeUserProfile>('/users/me');
  },

  /**
   * Updates current authenticated user's self-service profile fields.
   * Calls PATCH /api/v1/users/me
   */
  async updateMyProfile(payload: UpdateSelfProfilePayload): Promise<SafeUserProfile> {
    return api.patch<SafeUserProfile>('/users/me', payload);
  },

  /**
   * Lists workforce users with optional filtering.
   * Calls GET /api/v1/users
   */
  async getUsers(filter?: UserListFilter): Promise<SafeUserProfile[]> {
    const params: Record<string, string | number | boolean | undefined | null> = {};
    if (filter) {
      if (filter.role) params.role = filter.role;
      if (filter.department_id) params.department_id = filter.department_id;
      if (filter.employment_status) params.employment_status = filter.employment_status;
      if (filter.is_active !== undefined) params.is_active = filter.is_active;
      if (filter.search) params.search = filter.search;
      if (filter.page) params.page = filter.page;
      if (filter.limit) params.limit = filter.limit;
    }

    const data = await api.get<SafeUserProfile[] | { users: SafeUserProfile[] }>('/users', { params });
    if (Array.isArray(data)) {
      return data;
    }
    if (data && typeof data === 'object' && 'users' in data && Array.isArray((data as { users: SafeUserProfile[] }).users)) {
      return (data as { users: SafeUserProfile[] }).users;
    }
    return [];
  },

  /**
   * Retrieves a specific user profile by ID with IDOR protection.
   * Calls GET /api/v1/users/:id
   */
  async getUserById(id: string): Promise<SafeUserProfile> {
    return api.get<SafeUserProfile>(`/users/${id}`);
  },

  /**
   * Updates a user profile by ID (Management permission: users.manage).
   * Calls PATCH /api/v1/users/:id
   */
  async updateUserById(id: string, payload: UpdateUserProfilePayload): Promise<SafeUserProfile> {
    return api.patch<SafeUserProfile>(`/users/${id}`, payload);
  },
};
