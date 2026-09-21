/**
 * Audit Log API Service for SCARO ERP Frontend.
 * 
 * Interacts with Node.js/Express `/api/v1/audit-logs` endpoints backed by MariaDB.
 */

import { api } from '../../lib/api';

export interface SafeAuditLogDto {
  id: string;
  actor: {
    id: string | null;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
    role: string | null;
  } | null;
  action: string;
  table_name: string;
  record_id: string;
  old_value: any;
  new_value: any;
  created_at: string;
}

export interface AuditLogListFilter {
  action?: string;
  table_name?: string;
  actor_id?: string;
  record_id?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export const auditLogApi = {
  /**
   * Lists audit logs with optional filtering and pagination (Management only).
   * Calls GET /api/v1/audit-logs
   */
  async getAuditLogs(filter?: AuditLogListFilter): Promise<SafeAuditLogDto[]> {
    const params: Record<string, string | number | boolean | undefined | null> = {};
    if (filter) {
      if (filter.action && filter.action !== 'ALL') params.action = filter.action;
      if (filter.table_name) params.table_name = filter.table_name;
      if (filter.actor_id) params.actor_id = filter.actor_id;
      if (filter.record_id) params.record_id = filter.record_id;
      if (filter.from) params.from = filter.from;
      if (filter.to) params.to = filter.to;
      if (filter.page) params.page = filter.page;
      if (filter.limit) params.limit = filter.limit;
    }

    const data = await api.get<SafeAuditLogDto[] | { audit_logs: SafeAuditLogDto[] }>('/audit-logs', { params });
    if (Array.isArray(data)) {
      return data;
    }
    if (data && typeof data === 'object' && 'audit_logs' in data && Array.isArray((data as { audit_logs: SafeAuditLogDto[] }).audit_logs)) {
      return (data as { audit_logs: SafeAuditLogDto[] }).audit_logs;
    }
    return [];
  },

  /**
   * Retrieves single audit log by ID (Management only).
   * Calls GET /api/v1/audit-logs/:id
   */
  async getAuditLogById(id: string): Promise<SafeAuditLogDto> {
    return api.get<SafeAuditLogDto>(`/audit-logs/${id}`);
  },
};
