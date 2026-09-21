/**
 * Department API Service for SCARO ERP Frontend.
 * 
 * Interacts with Node.js/Express `/api/v1/departments` endpoints backed by MariaDB.
 */

import { api } from '../../lib/api';

export interface SafeDepartmentDto {
  id: string;
  name: string;
  description: string | null;
  manager: {
    id: string;
    full_name: string;
    email: string;
  } | null;
  is_active: boolean;
  member_count: number;
  created_at: string;
  updated_at: string;
}

export interface DepartmentListFilter {
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateDepartmentPayload {
  name: string;
  description?: string | null;
  manager_id?: string | null;
  is_active?: boolean;
}

export interface UpdateDepartmentPayload {
  name?: string;
  description?: string | null;
  manager_id?: string | null;
  is_active?: boolean;
}

export const departmentApi = {
  /**
   * Lists departments with optional filtering and pagination.
   * Calls GET /api/v1/departments
   */
  async getDepartments(filter?: DepartmentListFilter): Promise<SafeDepartmentDto[]> {
    const params: Record<string, string | number | boolean | undefined | null> = {};
    if (filter) {
      if (filter.is_active !== undefined) params.is_active = filter.is_active;
      if (filter.search) params.search = filter.search;
      if (filter.page) params.page = filter.page;
      if (filter.limit) params.limit = filter.limit;
    }

    const data = await api.get<SafeDepartmentDto[] | { departments: SafeDepartmentDto[] }>('/departments', { params });
    if (Array.isArray(data)) {
      return data;
    }
    if (data && typeof data === 'object' && 'departments' in data && Array.isArray((data as { departments: SafeDepartmentDto[] }).departments)) {
      return (data as { departments: SafeDepartmentDto[] }).departments;
    }
    return [];
  },

  /**
   * Retrieves single department by ID.
   * Calls GET /api/v1/departments/:id
   */
  async getDepartmentById(id: string): Promise<SafeDepartmentDto> {
    return api.get<SafeDepartmentDto>(`/departments/${id}`);
  },

  /**
   * Creates a new department (Management only).
   * Calls POST /api/v1/departments
   */
  async createDepartment(payload: CreateDepartmentPayload): Promise<SafeDepartmentDto> {
    return api.post<SafeDepartmentDto>('/departments', payload);
  },

  /**
   * Updates an existing department (Management only).
   * Calls PATCH /api/v1/departments/:id
   */
  async updateDepartment(id: string, payload: UpdateDepartmentPayload): Promise<SafeDepartmentDto> {
    return api.patch<SafeDepartmentDto>(`/departments/${id}`, payload);
  },
};
