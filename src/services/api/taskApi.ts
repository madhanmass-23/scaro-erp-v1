/**
 * Tasks API Service for SCARO ERP Frontend.
 * 
 * Interacts with Node.js/Express `/api/v1/tasks` endpoints backed by MariaDB.
 */

import { api } from '../../lib/api';

export interface SafeTaskDto {
  id: string;
  project_id: string;
  project_name: string;
  title: string;
  description: string | null;
  assignee: {
    id: string | null;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
  reporter: {
    id: string;
    full_name: string;
    email: string;
  };
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  status: 'Todo' | 'In Progress' | 'Review' | 'Needs Revision' | 'Completed' | 'On Hold' | 'Cancelled';
  progress: number;
  estimated_hours: number;
  due_date: string | null;
  comment_count: number;
  attachment_count: number;
  created_at: string;
  updated_at: string;
}

export interface TaskCommentDto {
  id: string;
  task_id: string;
  author_id: string;
  author_name: string;
  author_email: string;
  author_avatar: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface TaskAttachmentDto {
  id: string;
  task_id: string;
  uploaded_by: string;
  uploader_name: string;
  uploader_email: string;
  file_name: string;
  storage_path: string;
  file_size: number;
  file_type: string | null;
  created_at: string;
}

export interface TaskListFilter {
  project_id?: string;
  status?: string;
  priority?: string;
  assignee_id?: string;
  reporter_id?: string;
  search?: string;
  scope?: 'my' | 'reported';
  page?: number;
  limit?: number;
}

export interface CreateTaskRequest {
  project_id: string;
  title: string;
  description?: string | null;
  assignee_id?: string | null;
  priority?: 'Low' | 'Medium' | 'High' | 'Urgent';
  status?: 'Todo' | 'In Progress' | 'Review' | 'Needs Revision' | 'Completed' | 'On Hold' | 'Cancelled';
  progress?: number;
  estimated_hours?: number;
  due_date?: string | null;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string | null;
  assignee_id?: string | null;
  priority?: 'Low' | 'Medium' | 'High' | 'Urgent';
  status?: 'Todo' | 'In Progress' | 'Review' | 'Needs Revision' | 'Completed' | 'On Hold' | 'Cancelled';
  progress?: number;
  estimated_hours?: number;
  due_date?: string | null;
}

export const taskApi = {
  /**
   * Lists tasks with RBAC scoping, filters, and pagination.
   * Calls GET /api/v1/tasks
   */
  async getTasks(filter?: TaskListFilter): Promise<SafeTaskDto[]> {
    const params: Record<string, string | number | boolean | undefined | null> = {};
    if (filter) {
      if (filter.project_id && filter.project_id !== 'All') params.project_id = filter.project_id;
      if (filter.status && filter.status !== 'All') params.status = filter.status;
      if (filter.priority && filter.priority !== 'All') params.priority = filter.priority;
      if (filter.assignee_id && filter.assignee_id !== 'All') params.assignee_id = filter.assignee_id;
      if (filter.reporter_id) params.reporter_id = filter.reporter_id;
      if (filter.search) params.search = filter.search;
      if (filter.scope) params.scope = filter.scope;
      if (filter.page) params.page = filter.page;
      if (filter.limit) params.limit = filter.limit;
    }

    const data = await api.get<SafeTaskDto[] | { tasks: SafeTaskDto[] }>('/tasks', { params });
    if (Array.isArray(data)) {
      return data;
    }
    if (data && typeof data === 'object' && 'tasks' in data && Array.isArray((data as { tasks: SafeTaskDto[] }).tasks)) {
      return (data as { tasks: SafeTaskDto[] }).tasks;
    }
    return [];
  },

  /**
   * Retrieves a single task by ID with IDOR protection.
   * Calls GET /api/v1/tasks/:id
   */
  async getTaskById(id: string): Promise<SafeTaskDto> {
    return api.get<SafeTaskDto>(`/tasks/${id}`);
  },

  /**
   * Creates a new task.
   * Calls POST /api/v1/tasks
   */
  async createTask(payload: CreateTaskRequest): Promise<SafeTaskDto> {
    return api.post<SafeTaskDto>('/tasks', payload);
  },

  /**
   * Updates an existing task by ID.
   * Calls PATCH /api/v1/tasks/:id
   */
  async updateTask(id: string, payload: UpdateTaskRequest): Promise<SafeTaskDto> {
    return api.patch<SafeTaskDto>(`/tasks/${id}`, payload);
  },

  /**
   * Retrieves comments on a task.
   * Calls GET /api/v1/tasks/:id/comments
   */
  async getComments(taskId: string): Promise<TaskCommentDto[]> {
    const data = await api.get<TaskCommentDto[]>(`/tasks/${taskId}/comments`);
    return Array.isArray(data) ? data : [];
  },

  /**
   * Adds a comment to a task.
   * Calls POST /api/v1/tasks/:id/comments
   */
  async addComment(taskId: string, content: string): Promise<TaskCommentDto> {
    return api.post<TaskCommentDto>(`/tasks/${taskId}/comments`, { content });
  },

  /**
   * Retrieves attachment metadata for a task.
   * Calls GET /api/v1/tasks/:id/attachments
   */
  async getAttachments(taskId: string): Promise<TaskAttachmentDto[]> {
    const data = await api.get<TaskAttachmentDto[]>(`/tasks/${taskId}/attachments`);
    return Array.isArray(data) ? data : [];
  },

  /**
   * Adds an attachment metadata record to a task.
   * Calls POST /api/v1/tasks/:id/attachments
   */
  async addAttachment(
    taskId: string,
    payload: { file_name: string; storage_path: string; file_size?: number; file_type?: string }
  ): Promise<TaskAttachmentDto> {
    return api.post<TaskAttachmentDto>(`/tasks/${taskId}/attachments`, payload);
  },

  /**
   * Deletes an attachment metadata record from a task.
   * Calls DELETE /api/v1/tasks/:id/attachments/:attachmentId
   */
  async deleteAttachment(taskId: string, attachmentId: string): Promise<{ deleted: boolean }> {
    return api.delete<{ deleted: boolean }>(`/tasks/${taskId}/attachments/${attachmentId}`);
  },
};

