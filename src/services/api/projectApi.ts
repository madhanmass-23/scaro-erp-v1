/**
 * Projects API Service for SCARO ERP Frontend.
 * 
 * Interacts with Node.js/Express `/api/v1/projects` endpoints backed by MariaDB.
 */

import { api } from '../../lib/api';

export interface SafeProjectDto {
  id: string;
  name: string;
  description: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  owner: {
    id: string | null;
    full_name: string | null;
    email: string | null;
  } | null;
  creator: {
    id: string;
    full_name: string | null;
    email: string | null;
  };
  member_count: number;
  task_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectMemberDto {
  project_id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  created_at: string;
}

export interface ProjectListFilter {
  status?: string;
  owner_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateProjectRequest {
  name: string;
  description?: string | null;
  status?: string;
  start_date?: string | null;
  end_date?: string | null;
  owner_id?: string | null;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string | null;
  status?: string;
  start_date?: string | null;
  end_date?: string | null;
  owner_id?: string | null;
}

export const projectApi = {
  /**
   * Lists projects with optional filtering and pagination.
   * Calls GET /api/v1/projects
   */
  async getProjects(filter?: ProjectListFilter): Promise<SafeProjectDto[]> {
    const params: Record<string, string | number | boolean | undefined | null> = {};
    if (filter) {
      if (filter.status && filter.status !== 'All') params.status = filter.status;
      if (filter.owner_id) params.owner_id = filter.owner_id;
      if (filter.search) params.search = filter.search;
      if (filter.page) params.page = filter.page;
      if (filter.limit) params.limit = filter.limit;
    }

    const data = await api.get<SafeProjectDto[] | { projects: SafeProjectDto[] }>('/projects', { params });
    if (Array.isArray(data)) {
      return data;
    }
    if (data && typeof data === 'object' && 'projects' in data && Array.isArray((data as { projects: SafeProjectDto[] }).projects)) {
      return (data as { projects: SafeProjectDto[] }).projects;
    }
    return [];
  },

  /**
   * Retrieves a single project by ID with IDOR protection.
   * Calls GET /api/v1/projects/:id
   */
  async getProjectById(id: string): Promise<SafeProjectDto> {
    return api.get<SafeProjectDto>(`/projects/${id}`);
  },

  /**
   * Creates a new project (Admin/Super Admin permission: projects.manage).
   * Calls POST /api/v1/projects
   */
  async createProject(payload: CreateProjectRequest): Promise<SafeProjectDto> {
    return api.post<SafeProjectDto>('/projects', payload);
  },

  /**
   * Updates an existing project by ID.
   * Calls PATCH /api/v1/projects/:id
   */
  async updateProject(id: string, payload: UpdateProjectRequest): Promise<SafeProjectDto> {
    return api.patch<SafeProjectDto>(`/projects/${id}`, payload);
  },

  /**
   * Lists members belonging to a project.
   * Calls GET /api/v1/projects/:id/members
   */
  async getMembers(projectId: string): Promise<ProjectMemberDto[]> {
    const data = await api.get<ProjectMemberDto[]>(`/projects/${projectId}/members`);
    return Array.isArray(data) ? data : [];
  },

  /**
   * Adds a user to a project's roster.
   * Calls POST /api/v1/projects/:id/members
   */
  async addMember(projectId: string, userId: string): Promise<ProjectMemberDto[]> {
    return api.post<ProjectMemberDto[]>(`/projects/${projectId}/members`, { user_id: userId });
  },

  /**
   * Removes a user from a project's roster.
   * Calls DELETE /api/v1/projects/:id/members/:userId
   */
  async removeMember(projectId: string, userId: string): Promise<{ message: string }> {
    return api.delete<{ message: string }>(`/projects/${projectId}/members/${userId}`);
  },
};
