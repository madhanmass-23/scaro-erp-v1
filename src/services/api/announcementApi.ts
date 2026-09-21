/**
 * Announcements API Service for SCARO ERP Frontend.
 * 
 * Interacts with Node.js/Express `/api/v1/announcements` endpoints backed by MariaDB.
 */

import { api } from '../../lib/api';

export interface SafeAnnouncementDto {
  id: string;
  author: {
    id: string;
    full_name: string;
    email: string;
    avatar_url: string | null;
    role: string;
  };
  title: string;
  content: string;
  priority: string;
  audience: 'Everyone' | 'Employees' | 'Interns' | 'Department';
  department_id: string | null;
  department_name: string | null;
  published_at: string;
  created_at: string;
  updated_at: string;
}

export interface AnnouncementListFilter {
  audience?: string;
  priority?: string;
  department_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateAnnouncementPayload {
  title: string;
  content: string;
  priority?: string;
  audience?: 'Everyone' | 'Employees' | 'Interns' | 'Department';
  department_id?: string | null;
  published_at?: string;
}

export interface UpdateAnnouncementPayload {
  title?: string;
  content?: string;
  priority?: string;
  audience?: 'Everyone' | 'Employees' | 'Interns' | 'Department';
  department_id?: string | null;
  published_at?: string;
}

export const announcementApi = {
  /**
   * Lists announcements accessible by the caller (server-side audience scoped).
   * Calls GET /api/v1/announcements
   */
  async getAnnouncements(filter?: AnnouncementListFilter): Promise<SafeAnnouncementDto[]> {
    const params: Record<string, string | number | boolean | undefined | null> = {};
    if (filter) {
      if (filter.audience) params.audience = filter.audience;
      if (filter.priority) params.priority = filter.priority;
      if (filter.department_id) params.department_id = filter.department_id;
      if (filter.search) params.search = filter.search;
      if (filter.page) params.page = filter.page;
      if (filter.limit) params.limit = filter.limit;
    }

    const data = await api.get<SafeAnnouncementDto[] | { announcements: SafeAnnouncementDto[] }>('/announcements', { params });
    if (Array.isArray(data)) {
      return data;
    }
    if (data && typeof data === 'object' && 'announcements' in data && Array.isArray((data as { announcements: SafeAnnouncementDto[] }).announcements)) {
      return (data as { announcements: SafeAnnouncementDto[] }).announcements;
    }
    return [];
  },

  /**
   * Retrieves single announcement by ID with audience authorization.
   * Calls GET /api/v1/announcements/:id
   */
  async getAnnouncementById(id: string): Promise<SafeAnnouncementDto> {
    return api.get<SafeAnnouncementDto>(`/announcements/${id}`);
  },

  /**
   * Creates an announcement (Admin / Super Admin only).
   * Calls POST /api/v1/announcements
   */
  async createAnnouncement(payload: CreateAnnouncementPayload): Promise<SafeAnnouncementDto> {
    return api.post<SafeAnnouncementDto>('/announcements', payload);
  },

  /**
   * Updates an existing announcement (Admin / Super Admin / Author).
   * Calls PATCH /api/v1/announcements/:id
   */
  async updateAnnouncement(id: string, payload: UpdateAnnouncementPayload): Promise<SafeAnnouncementDto> {
    return api.patch<SafeAnnouncementDto>(`/announcements/${id}`, payload);
  },
};
