import { query, queryOne, execute } from "../utils/database.util.js";
import crypto from "crypto";

export interface LeaveRequestRecord {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  user_avatar?: string | null;
  role?: string;
  type: "Leave" | "Permission" | "Work From Home";
  start_date: string;
  end_date: string;
  reason: string;
  status: "Pending" | "Approved" | "Rejected" | "Cancelled";
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewer_name?: string | null;
  reviewer_email?: string | null;
  reviewed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface LeaveListFilter {
  status?: string;
  type?: string;
  from?: string;
  to?: string;
  user_id?: string;
}

export interface LeavePaginationOptions {
  page: number;
  limit: number;
}

export class LeaveRepository {
  /**
   * Finds a leave request by ID with joined requester and reviewer info.
   */
  async findById(id: string): Promise<LeaveRequestRecord | null> {
    const sql = `
      SELECT 
        lr.id,
        lr.user_id,
        p.full_name AS user_name,
        p.email AS user_email,
        p.avatar_url AS user_avatar,
        COALESCE(r.name, 'Employee') AS role,
        lr.type,
        DATE_FORMAT(lr.start_date, '%Y-%m-%d') AS start_date,
        DATE_FORMAT(lr.end_date, '%Y-%m-%d') AS end_date,
        lr.reason,
        lr.status,
        lr.rejection_reason,
        lr.reviewed_by,
        rev.full_name AS reviewer_name,
        rev.email AS reviewer_email,
        lr.reviewed_at,
        lr.created_at,
        lr.updated_at
      FROM leave_requests lr
      JOIN profiles p ON lr.user_id = p.id
      LEFT JOIN user_roles ur ON p.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      LEFT JOIN profiles rev ON lr.reviewed_by = rev.id
      WHERE lr.id = ?
      LIMIT 1
    `;
    return queryOne<LeaveRequestRecord>(sql, [id]);
  }

  /**
   * Lists leave requests with pagination and optional user scoping.
   */
  async listLeaveRequests(
    filter: LeaveListFilter,
    pagination: LeavePaginationOptions,
    scopedUserId?: string | null
  ): Promise<{ requests: LeaveRequestRecord[]; total: number }> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (scopedUserId) {
      conditions.push("lr.user_id = ?");
      params.push(scopedUserId);
    } else if (filter.user_id) {
      conditions.push("lr.user_id = ?");
      params.push(filter.user_id);
    }

    if (filter.status) {
      conditions.push("lr.status = ?");
      params.push(filter.status);
    }
    if (filter.type) {
      conditions.push("lr.type = ?");
      params.push(filter.type);
    }
    if (filter.from) {
      conditions.push("lr.end_date >= ?");
      params.push(filter.from);
    }
    if (filter.to) {
      conditions.push("lr.start_date <= ?");
      params.push(filter.to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // 1. Total count
    const countSql = `SELECT COUNT(*) AS total FROM leave_requests lr ${whereClause}`;
    const countRow = await queryOne<{ total: number }>(countSql, params);
    const total = countRow ? Number(countRow.total) : 0;

    // 2. Paginated rows
    const page = Math.max(1, pagination.page);
    const limit = Math.max(1, Math.min(100, pagination.limit));
    const offset = (page - 1) * limit;

    const dataSql = `
      SELECT 
        lr.id,
        lr.user_id,
        p.full_name AS user_name,
        p.email AS user_email,
        p.avatar_url AS user_avatar,
        COALESCE(r.name, 'Employee') AS role,
        lr.type,
        DATE_FORMAT(lr.start_date, '%Y-%m-%d') AS start_date,
        DATE_FORMAT(lr.end_date, '%Y-%m-%d') AS end_date,
        lr.reason,
        lr.status,
        lr.rejection_reason,
        lr.reviewed_by,
        rev.full_name AS reviewer_name,
        rev.email AS reviewer_email,
        lr.reviewed_at,
        lr.created_at,
        lr.updated_at
      FROM leave_requests lr
      JOIN profiles p ON lr.user_id = p.id
      LEFT JOIN user_roles ur ON p.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      LEFT JOIN profiles rev ON lr.reviewed_by = rev.id
      ${whereClause}
      ORDER BY lr.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...params, limit, offset];
    const requests = await query<LeaveRequestRecord>(dataSql, dataParams);

    return { requests, total };
  }

  /**
   * Creates a new leave request.
   */
  async createLeaveRequest(data: {
    id?: string;
    user_id: string;
    type: "Leave" | "Permission" | "Work From Home";
    start_date: string;
    end_date: string;
    reason: string;
    status?: "Pending" | "Approved" | "Rejected" | "Cancelled";
  }): Promise<LeaveRequestRecord> {
    const leaveId = data.id || crypto.randomUUID();
    const status = data.status || "Pending";

    const sql = `
      INSERT INTO leave_requests (
        id, user_id, type, start_date, end_date, reason, status,
        rejection_reason, reviewed_by, reviewed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6))
    `;

    await execute(sql, [
      leaveId,
      data.user_id,
      data.type,
      data.start_date,
      data.end_date,
      data.reason,
      status,
    ]);

    const created = await this.findById(leaveId);
    if (!created) {
      throw new Error("Failed to retrieve created leave request");
    }
    return created;
  }

  /**
   * Updates leave request fields.
   */
  async updateLeaveRequest(id: string, fields: Record<string, any>): Promise<LeaveRequestRecord | null> {
    const keys = Object.keys(fields);
    if (keys.length === 0) {
      return this.findById(id);
    }

    const setClauses: string[] = [];
    const params: any[] = [];

    for (const key of keys) {
      setClauses.push(`\`${key}\` = ?`);
      params.push(fields[key]);
    }

    setClauses.push("`updated_at` = CURRENT_TIMESTAMP(6)");
    params.push(id);

    const updateSql = `UPDATE leave_requests SET ${setClauses.join(", ")} WHERE id = ?`;
    await execute(updateSql, params);

    return this.findById(id);
  }
}

export const leaveRepository = new LeaveRepository();
