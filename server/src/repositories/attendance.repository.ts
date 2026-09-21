import { query, queryOne, execute } from "../utils/database.util.js";
import crypto from "crypto";

export interface AttendanceSessionRecord {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  role?: string;
  session_date: string;
  clock_in_time: Date | string;
  clock_out_time: Date | string | null;
  status: "Present" | "Absent" | "Half Day";
  duration_minutes?: number | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface ManagementAttendanceRecord {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  role: string;
  session_date: string;
  clock_in_time: Date | string;
  clock_out_time: Date | string | null;
  status: "Present" | "Absent" | "Half Day";
  duration_minutes: number | null;
  report_id: string | null;
  report_status: string | null;
  notes: string | null;
  tomorrow_plan: string | null;
  blockers: string | null;
}

export interface AttendanceHistoryFilter {
  from?: string;
  to?: string;
  status?: string;
}

export interface ManagementAttendanceFilter {
  date?: string;
  from?: string;
  to?: string;
  user_id?: string;
  role?: string;
  status?: string;
}

export interface AttendancePaginationOptions {
  page: number;
  limit: number;
}

export class AttendanceRepository {
  /**
   * Finds the currently active (unclosed) session for a user.
   */
  async findActiveSession(userId: string): Promise<AttendanceSessionRecord | null> {
    const sql = `
      SELECT 
        id, user_id, DATE_FORMAT(session_date, '%Y-%m-%d') AS session_date, clock_in_time, clock_out_time, status,
        TIMESTAMPDIFF(MINUTE, clock_in_time, CURRENT_TIMESTAMP(6)) AS duration_minutes,
        created_at, updated_at
      FROM attendance_sessions
      WHERE user_id = ? AND clock_out_time IS NULL
      ORDER BY clock_in_time DESC
      LIMIT 1
    `;
    return queryOne<AttendanceSessionRecord>(sql, [userId]);
  }

  /**
   * Finds an attendance session by ID.
   */
  async findById(id: string): Promise<AttendanceSessionRecord | null> {
    const sql = `
      SELECT 
        id, user_id, DATE_FORMAT(session_date, '%Y-%m-%d') AS session_date, clock_in_time, clock_out_time, status,
        CASE 
          WHEN clock_out_time IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, clock_in_time, clock_out_time)
          ELSE TIMESTAMPDIFF(MINUTE, clock_in_time, CURRENT_TIMESTAMP(6))
        END AS duration_minutes,
        created_at, updated_at
      FROM attendance_sessions
      WHERE id = ?
      LIMIT 1
    `;
    return queryOne<AttendanceSessionRecord>(sql, [id]);
  }

  /**
   * Starts a new attendance session.
   */
  async createSession(userId: string, sessionDate: string, status = "Present"): Promise<AttendanceSessionRecord> {
    const sessionId = crypto.randomUUID();
    const sql = `
      INSERT INTO attendance_sessions (
        id, user_id, session_date, clock_in_time, clock_out_time, status, created_at, updated_at
      ) VALUES (?, ?, ?, CURRENT_TIMESTAMP(6), NULL, ?, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6))
    `;
    await execute(sql, [sessionId, userId, sessionDate, status]);

    const created = await this.findById(sessionId);
    if (!created) {
      throw new Error("Failed to retrieve created attendance session");
    }
    return created;
  }

  /**
   * Closes an active attendance session.
   */
  async closeSession(sessionId: string): Promise<AttendanceSessionRecord | null> {
    const sql = `
      UPDATE attendance_sessions
      SET clock_out_time = CURRENT_TIMESTAMP(6), updated_at = CURRENT_TIMESTAMP(6)
      WHERE id = ? AND clock_out_time IS NULL
    `;
    await execute(sql, [sessionId]);
    return this.findById(sessionId);
  }

  /**
   * Retrieves user's attendance history with pagination and date filters.
   */
  async getUserHistory(
    userId: string,
    filter: AttendanceHistoryFilter,
    pagination: AttendancePaginationOptions
  ): Promise<{ sessions: AttendanceSessionRecord[]; total: number }> {
    const conditions: string[] = ["user_id = ?"];
    const params: (string | number)[] = [userId];

    if (filter.from) {
      conditions.push("session_date >= ?");
      params.push(filter.from);
    }
    if (filter.to) {
      conditions.push("session_date <= ?");
      params.push(filter.to);
    }
    if (filter.status) {
      conditions.push("status = ?");
      params.push(filter.status);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    // 1. Total count
    const countSql = `SELECT COUNT(*) AS total FROM attendance_sessions ${whereClause}`;
    const countRow = await queryOne<{ total: number }>(countSql, params);
    const total = countRow ? Number(countRow.total) : 0;

    // 2. Paginated rows
    const page = Math.max(1, pagination.page);
    const limit = Math.max(1, Math.min(100, pagination.limit));
    const offset = (page - 1) * limit;

    const dataSql = `
      SELECT 
        id, user_id, DATE_FORMAT(session_date, '%Y-%m-%d') AS session_date, clock_in_time, clock_out_time, status,
        CASE 
          WHEN clock_out_time IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, clock_in_time, clock_out_time)
          ELSE TIMESTAMPDIFF(MINUTE, clock_in_time, CURRENT_TIMESTAMP(6))
        END AS duration_minutes,
        created_at, updated_at
      FROM attendance_sessions
      ${whereClause}
      ORDER BY session_date DESC, clock_in_time DESC
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...params, limit, offset];
    const sessions = await query<AttendanceSessionRecord>(dataSql, dataParams);

    return { sessions, total };
  }

  /**
   * Retrieves workforce management attendance with joined profile and daily report details.
   */
  async getManagementAttendance(
    filter: ManagementAttendanceFilter,
    pagination: AttendancePaginationOptions
  ): Promise<{ records: ManagementAttendanceRecord[]; total: number }> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filter.date) {
      conditions.push("a.session_date = ?");
      params.push(filter.date);
    }
    if (filter.from) {
      conditions.push("a.session_date >= ?");
      params.push(filter.from);
    }
    if (filter.to) {
      conditions.push("a.session_date <= ?");
      params.push(filter.to);
    }
    if (filter.user_id) {
      conditions.push("a.user_id = ?");
      params.push(filter.user_id);
    }
    if (filter.role) {
      conditions.push("r.name = ?");
      params.push(filter.role);
    }
    if (filter.status) {
      conditions.push("a.status = ?");
      params.push(filter.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // 1. Total count
    const countSql = `
      SELECT COUNT(*) AS total
      FROM attendance_sessions a
      JOIN profiles p ON a.user_id = p.id
      LEFT JOIN user_roles ur ON p.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      ${whereClause}
    `;
    const countRow = await queryOne<{ total: number }>(countSql, params);
    const total = countRow ? Number(countRow.total) : 0;

    // 2. Paginated rows
    const page = Math.max(1, pagination.page);
    const limit = Math.max(1, Math.min(100, pagination.limit));
    const offset = (page - 1) * limit;

    const dataSql = `
      SELECT 
        a.id,
        a.user_id,
        p.full_name AS user_name,
        p.email AS user_email,
        COALESCE(r.name, 'Employee') AS role,
        DATE_FORMAT(a.session_date, '%Y-%m-%d') AS session_date,
        a.clock_in_time,
        a.clock_out_time,
        a.status,
        CASE 
          WHEN a.clock_out_time IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, a.clock_in_time, a.clock_out_time)
          ELSE TIMESTAMPDIFF(MINUTE, a.clock_in_time, CURRENT_TIMESTAMP(6))
        END AS duration_minutes,
        dr.id AS report_id,
        dr.status AS report_status,
        dr.notes,
        dr.tomorrow_plan,
        dr.blockers
      FROM attendance_sessions a
      JOIN profiles p ON a.user_id = p.id
      LEFT JOIN user_roles ur ON p.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      LEFT JOIN daily_reports dr ON a.user_id = dr.user_id AND a.session_date = dr.report_date
      ${whereClause}
      ORDER BY a.session_date DESC, a.clock_in_time DESC
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...params, limit, offset];
    const records = await query<ManagementAttendanceRecord>(dataSql, dataParams);

    return { records, total };
  }
}

export const attendanceRepository = new AttendanceRepository();
