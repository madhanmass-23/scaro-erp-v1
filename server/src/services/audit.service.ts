import {
  auditRepository,
  AuditRecord,
  AuditListFilter,
  AuditPaginationOptions,
} from "../repositories/audit.repository.js";
import { authorizationService } from "./authorization.service.js";
import { UserRoleInfo } from "./rbac.service.js";
import { AppError } from "../types/api.types.js";
import { isValidUuid } from "../utils/validation.util.js";

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

export class AuditService {
  private formatAuditLog(raw: AuditRecord): SafeAuditLogDto {
    let parsedOldValue = raw.old_value;
    if (typeof raw.old_value === "string") {
      try {
        parsedOldValue = JSON.parse(raw.old_value);
      } catch {
        parsedOldValue = raw.old_value;
      }
    }

    let parsedNewValue = raw.new_value;
    if (typeof raw.new_value === "string") {
      try {
        parsedNewValue = JSON.parse(raw.new_value);
      } catch {
        parsedNewValue = raw.new_value;
      }
    }

    return {
      id: raw.id,
      actor: raw.actor_id
        ? {
            id: raw.actor_id,
            full_name: raw.actor_name || null,
            email: raw.actor_email || null,
            avatar_url: raw.actor_avatar || null,
            role: raw.actor_role || null,
          }
        : null,
      action: raw.action,
      table_name: raw.table_name,
      record_id: raw.record_id,
      old_value: parsedOldValue,
      new_value: parsedNewValue,
      created_at:
        typeof raw.created_at === "object" && raw.created_at !== null && "toISOString" in raw.created_at
          ? (raw.created_at as Date).toISOString()
          : String(raw.created_at),
    };
  }

  /**
   * Lists audit logs with pagination and safe filters. Restricted to Management.
   */
  async listAuditLogs(
    filter: AuditListFilter,
    pagination: AuditPaginationOptions,
    callerAuth: UserRoleInfo
  ): Promise<{ audit_logs: SafeAuditLogDto[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const authCheck = authorizationService.canViewAuditLogs(callerAuth);
    if (!authCheck.allowed) {
      throw new AppError(authCheck.reason || "Forbidden: You do not have permission to view audit logs.", 403, "FORBIDDEN");
    }

    // Filter validation
    const cleanFilter: AuditListFilter = {};

    if (filter.actor_id) {
      if (!isValidUuid(filter.actor_id)) {
        throw new AppError("Invalid actor_id format. Expected UUID.", 400, "INVALID_UUID");
      }
      cleanFilter.actor_id = filter.actor_id.trim();
    }

    if (filter.record_id) {
      if (!isValidUuid(filter.record_id)) {
        throw new AppError("Invalid record_id format. Expected UUID.", 400, "INVALID_UUID");
      }
      cleanFilter.record_id = filter.record_id.trim();
    }

    if (filter.action && typeof filter.action === "string") {
      cleanFilter.action = filter.action.trim();
    }

    if (filter.table_name && typeof filter.table_name === "string") {
      cleanFilter.table_name = filter.table_name.trim();
    }

    if (filter.from) {
      const fromDate = new Date(filter.from);
      if (isNaN(fromDate.getTime())) {
        throw new AppError("Invalid 'from' date format.", 400, "INVALID_DATE");
      }
      cleanFilter.from = fromDate.toISOString().slice(0, 19).replace("T", " ");
    }

    if (filter.to) {
      const toDate = new Date(filter.to);
      if (isNaN(toDate.getTime())) {
        throw new AppError("Invalid 'to' date format.", 400, "INVALID_DATE");
      }
      cleanFilter.to = toDate.toISOString().slice(0, 19).replace("T", " ");
    }

    const page = Math.max(1, Math.floor(pagination.page || 1));
    const limit = Math.max(1, Math.min(100, Math.floor(pagination.limit || 20)));

    const { audit_logs, total } = await auditRepository.listAuditLogs(cleanFilter, { page, limit });
    const formatted = audit_logs.map((a) => this.formatAuditLog(a));
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      audit_logs: formatted,
      pagination: { page, limit, total, totalPages },
    };
  }

  /**
   * Retrieves a single audit log entry by ID. Restricted to Management.
   */
  async getAuditLogById(id: string, callerAuth: UserRoleInfo): Promise<SafeAuditLogDto> {
    if (!isValidUuid(id)) {
      throw new AppError("Invalid audit log ID format. Expected UUID.", 400, "INVALID_UUID");
    }

    const authCheck = authorizationService.canViewAuditLogs(callerAuth);
    if (!authCheck.allowed) {
      throw new AppError(authCheck.reason || "Forbidden: You do not have permission to view audit logs.", 403, "FORBIDDEN");
    }

    const entry = await auditRepository.findById(id);
    if (!entry) {
      throw new AppError("Audit log record not found", 404, "AUDIT_LOG_NOT_FOUND");
    }

    return this.formatAuditLog(entry);
  }
}

export const auditService = new AuditService();
