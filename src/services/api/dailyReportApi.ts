/**
 * Daily Reports API Service for SCARO ERP Frontend.
 * 
 * Interacts with Node.js/Express `/api/v1/daily-reports` endpoints backed by MariaDB.
 */

import { api } from '../../lib/api';

export interface SafeDailyReportTaskDto {
  id: string;
  report_id: string;
  task_id: string | null;
  task_title: string | null;
  project_id: string | null;
  project_name: string | null;
  time_spent_minutes: number | null;
  completion_percentage: number | null;
  task_status: string | null;
  custom_task_title: string | null;
}

export interface SafeDailyReportAttachmentDto {
  id: string;
  report_id: string;
  uploaded_by: string;
  uploader_name: string | null;
  file_name: string;
  storage_path: string;
  file_size: number | null;
  file_type: string | null;
  created_at: string;
}

export interface SafeDailyReportSyncDto {
  report_id: string;
  status: 'pending' | 'processing' | 'synced' | 'failed' | 'permanently_failed';
  external_row_reference: number | null;
  attempt_count: number;
  error_message: string | null;
  last_attempt_at: string | null;
  synced_at: string | null;
}

export interface SafeDailyReportDto {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  role: string;
  report_date: string;
  status: string;
  today_plan: string | null;
  tomorrow_plan: string | null;
  blockers: string | null;
  company_requirements: string | null;
  notes: string | null;
  submitted_at: string | null;
  tasks?: SafeDailyReportTaskDto[];
  attachments?: SafeDailyReportAttachmentDto[];
  sync?: SafeDailyReportSyncDto | null;
  task_count: number;
  attachment_count: number;
  created_at: string;
  updated_at: string;
}

export interface DailyReportListFilter {
  date?: string;
  from?: string;
  to?: string;
  user_id?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface CreateDailyReportRequest {
  report_date?: string;
  status?: 'Draft' | 'Submitted';
  today_plan?: string | null;
  tomorrow_plan?: string | null;
  blockers?: string | null;
  company_requirements?: string | null;
  notes?: string | null;
  tasks?: Array<{
    task_id?: string | null;
    custom_task_title?: string | null;
    time_spent_minutes?: number | null;
    completion_percentage?: number | null;
    task_status?: string | null;
  }>;
}

export interface UpdateDailyReportRequest {
  status?: 'Draft' | 'Submitted';
  today_plan?: string | null;
  tomorrow_plan?: string | null;
  blockers?: string | null;
  company_requirements?: string | null;
  notes?: string | null;
  tasks?: Array<{
    id?: string;
    task_id?: string | null;
    custom_task_title?: string | null;
    time_spent_minutes?: number | null;
    completion_percentage?: number | null;
    task_status?: string | null;
  }>;
}

export interface AddReportTaskRequest {
  task_id?: string | null;
  custom_task_title?: string | null;
  time_spent_minutes?: number | null;
  completion_percentage?: number | null;
  task_status?: string | null;
}

export interface UpdateReportTaskRequest {
  custom_task_title?: string | null;
  time_spent_minutes?: number | null;
  completion_percentage?: number | null;
  task_status?: string | null;
}

export interface AddReportAttachmentRequest {
  file_name: string;
  storage_path: string;
  file_size?: number | null;
  file_type?: string | null;
}

export const dailyReportApi = {
  /**
   * Retrieves today's daily report for the authenticated user.
   * Calls GET /api/v1/daily-reports/today
   */
  async getTodayReport(): Promise<SafeDailyReportDto | null> {
    try {
      const data = await api.get<SafeDailyReportDto>('/daily-reports/today');
      return data || null;
    } catch {
      return null;
    }
  },

  /**
   * Lists daily reports with RBAC scoping and filters.
   * Calls GET /api/v1/daily-reports
   */
  async listReports(filter?: DailyReportListFilter): Promise<SafeDailyReportDto[]> {
    const params: Record<string, string | number | boolean | undefined | null> = {};
    if (filter) {
      if (filter.date) params.date = filter.date;
      if (filter.from) params.from = filter.from;
      if (filter.to) params.to = filter.to;
      if (filter.user_id) params.user_id = filter.user_id;
      if (filter.status) params.status = filter.status;
      if (filter.page) params.page = filter.page;
      if (filter.limit) params.limit = filter.limit;
    }

    const data = await api.get<SafeDailyReportDto[] | { reports: SafeDailyReportDto[] }>('/daily-reports', { params });
    if (Array.isArray(data)) {
      return data;
    }
    if (data && typeof data === 'object' && 'reports' in data && Array.isArray((data as { reports: SafeDailyReportDto[] }).reports)) {
      return (data as { reports: SafeDailyReportDto[] }).reports;
    }
    return [];
  },

  /**
   * Retrieves a single daily report by ID with full tasks and attachments.
   * Calls GET /api/v1/daily-reports/:id
   */
  async getReportById(id: string): Promise<SafeDailyReportDto> {
    return api.get<SafeDailyReportDto>(`/daily-reports/${id}`);
  },

  /**
   * Creates a new daily report.
   * Calls POST /api/v1/daily-reports
   */
  async createReport(payload: CreateDailyReportRequest): Promise<SafeDailyReportDto> {
    return api.post<SafeDailyReportDto>('/daily-reports', payload);
  },

  /**
   * Updates an existing daily report.
   * Calls PATCH /api/v1/daily-reports/:id
   */
  async updateReport(id: string, payload: UpdateDailyReportRequest): Promise<SafeDailyReportDto> {
    return api.patch<SafeDailyReportDto>(`/daily-reports/${id}`, payload);
  },

  /**
   * Retrieves tasks linked to a report.
   * Calls GET /api/v1/daily-reports/:id/tasks
   */
  async getReportTasks(reportId: string): Promise<SafeDailyReportTaskDto[]> {
    const data = await api.get<SafeDailyReportTaskDto[]>(`/daily-reports/${reportId}/tasks`);
    return Array.isArray(data) ? data : [];
  },

  /**
   * Adds a task item to a report.
   * Calls POST /api/v1/daily-reports/:id/tasks
   */
  async addReportTask(reportId: string, payload: AddReportTaskRequest): Promise<SafeDailyReportTaskDto> {
    return api.post<SafeDailyReportTaskDto>(`/daily-reports/${reportId}/tasks`, payload);
  },

  /**
   * Updates a specific task item in a report.
   * Calls PATCH /api/v1/daily-reports/:id/tasks/:taskId
   */
  async updateReportTask(reportId: string, taskId: string, payload: UpdateReportTaskRequest): Promise<SafeDailyReportTaskDto> {
    return api.patch<SafeDailyReportTaskDto>(`/daily-reports/${reportId}/tasks/${taskId}`, payload);
  },

  /**
   * Retrieves attachment metadata for a report.
   * Calls GET /api/v1/daily-reports/:id/attachments
   */
  async getAttachments(reportId: string): Promise<SafeDailyReportAttachmentDto[]> {
    const data = await api.get<SafeDailyReportAttachmentDto[]>(`/daily-reports/${reportId}/attachments`);
    return Array.isArray(data) ? data : [];
  },

  /**
   * Adds an attachment metadata record to a report.
   * Calls POST /api/v1/daily-reports/:id/attachments
   */
  async addAttachment(reportId: string, payload: AddReportAttachmentRequest): Promise<SafeDailyReportAttachmentDto> {
    return api.post<SafeDailyReportAttachmentDto>(`/daily-reports/${reportId}/attachments`, payload);
  },

  /**
   * Deletes an attachment metadata record from a report.
   * Calls DELETE /api/v1/daily-reports/:id/attachments/:attachmentId
   */
  async deleteAttachment(reportId: string, attachmentId: string): Promise<void> {
    await api.delete(`/daily-reports/${reportId}/attachments/${attachmentId}`);
  },

  /**
   * Retrieves sync status for a report.
   * Calls GET /api/v1/daily-reports/:id/sync
   */
  async getSyncStatus(reportId: string): Promise<SafeDailyReportSyncDto | null> {
    try {
      const data = await api.get<SafeDailyReportSyncDto>(`/daily-reports/${reportId}/sync`);
      return data || null;
    } catch {
      return null;
    }
  },
};
