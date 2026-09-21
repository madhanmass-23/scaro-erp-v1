import { query, queryOne, execute } from "../utils/database.util.js";
import crypto from "crypto";

export interface AuditLogEntry {
  id?: string;
  actor_id?: string | null;
  action: string;
  table_name: string;
  record_id: string;
  old_value?: any;
  new_value?: any;
}

export interface AuditRecord {
  id: string;
  actor_id: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
  actor_avatar?: string | null;
  actor_role?: string | null;
  action: string;
  table_name: string;
  record_id: string;
  old_value: any;
  new_value: any;
  created_at: Date | string;
}

export interface AuditListFilter {
  actor_id?: string;
  action?: string;
  table_name?: string;
  record_id?: string;
  from?: string;
  to?: string;
}

export interface AuditPaginationOptions {
  page: number;
  limit: number;
}

export class AuditRepository {
  /**
   * Records an audit log entry for a mutation (Append-Only).
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      const id = entry.id || crypto.randomUUID();
      const oldValueJson = entry.old_value !== undefined ? JSON.stringify(entry.old_value) : null;
      const newValueJson = entry.new_value !== undefined ? JSON.stringify(entry.new_value) : null;

      const sql = `
        INSERT INTO audit_logs (id, actor_id, action, table_name, record_id, old_value, new_value, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6))
      `;

      await execute(sql, [
        id,
        entry.actor_id || null,
        entry.action,
        entry.table_name,
        entry.record_id,
        oldValueJson,
        newValueJson,
      ]);
    } catch (err) {
      console.error("[AUDIT] Failed to record audit log:", err);
      // Non-blocking: audit log failure should not crash business operations unless explicitly required
    }
  }

  /**
   * Finds a single audit log entry by ID with actor metadata.
   */
  async findById(id: string): Promise<AuditRecord | null> {
    const sql = `
      SELECT 
        a.id,
        a.actor_id,
        p.full_name AS actor_name,
        p.email AS actor_email,
        p.avatar_url AS actor_avatar,
        COALESCE(r.name, 'Unknown') AS actor_role,
        a.action,
        a.table_name,
        a.record_id,
        a.old_value,
        a.new_value,
        a.created_at
      FROM audit_logs a
      LEFT JOIN profiles p ON a.actor_id = p.id
      LEFT JOIN user_roles ur ON p.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE a.id = ?
      LIMIT 1
    `;
    return queryOne<AuditRecord>(sql, [id]);
  }

  /**
   * Lists audit logs with safe filter allow-list and pagination.
   */
  async listAuditLogs(
    filter: AuditListFilter,
    pagination: AuditPaginationOptions
  ): Promise<{ audit_logs: AuditRecord[]; total: number }> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filter.actor_id) {
      conditions.push("a.actor_id = ?");
      params.push(filter.actor_id);
    }
    if (filter.action) {
      conditions.push("a.action = ?");
      params.push(filter.action);
    }
    if (filter.table_name) {
      conditions.push("a.table_name = ?");
      params.push(filter.table_name);
    }
    if (filter.record_id) {
      conditions.push("a.record_id = ?");
      params.push(filter.record_id);
    }
    if (filter.from) {
      conditions.push("a.created_at >= ?");
      params.push(filter.from);
    }
    if (filter.to) {
      conditions.push("a.created_at <= ?");
      params.push(filter.to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countSql = `SELECT COUNT(*) AS total FROM audit_logs a ${whereClause}`;
    const countRow = await queryOne<{ total: number }>(countSql, params);
    const total = countRow ? Number(countRow.total) : 0;

    const page = Math.max(1, pagination.page);
    const limit = Math.max(1, Math.min(100, pagination.limit));
    const offset = (page - 1) * limit;

    const dataSql = `
      SELECT 
        a.id,
        a.actor_id,
        p.full_name AS actor_name,
        p.email AS actor_email,
        p.avatar_url AS actor_avatar,
        COALESCE(r.name, 'Unknown') AS actor_role,
        a.action,
        a.table_name,
        a.record_id,
        a.old_value,
        a.new_value,
        a.created_at
      FROM audit_logs a
      LEFT JOIN profiles p ON a.actor_id = p.id
      LEFT JOIN user_roles ur ON p.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...params, limit, offset];
    const audit_logs = await query<AuditRecord>(dataSql, dataParams);

    return { audit_logs, total };
  }
}

export const auditRepository = new AuditRepository();
