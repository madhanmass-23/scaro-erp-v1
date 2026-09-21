import { query, queryOne, execute } from "../utils/database.util.js";
import crypto from "crypto";

export interface DailyReportRecord {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  role?: string;
  report_date: string;
  status: string;
  tomorrow_plan: string | null;
  blockers: string | null;
  company_requirements: string | null;
  notes: string | null;
  submitted_at: Date | string | null;
  task_count?: number;
  attachment_count?: number;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface DailyReportTaskRecord {
  id: string;
  report_id: string;
  task_id: string | null;
  task_title?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  time_spent_minutes: number | null;
  completion_percentage: number | null;
  task_status: string | null;
  custom_task_title: string | null;
}

export interface DailyReportAttachmentRecord {
  id: string;
  report_id: string;
  uploaded_by: string;
  uploader_name?: string;
  file_name: string;
  storage_path: string;
  file_size: number | null;
  file_type: string | null;
  created_at: Date | string;
}

export interface DailyReportSyncRecord {
  report_id: string;
  status: "pending" | "processing" | "synced" | "failed" | "permanently_failed";
  external_row_reference: number | null;
  attempt_count: number;
  error_message: string | null;
  last_attempt_at: Date | string | null;
  synced_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface DailyReportListFilter {
  date?: string;
  from?: string;
  to?: string;
  user_id?: string;
  status?: string;
}

export interface DailyReportPaginationOptions {
  page: number;
  limit: number;
}

export class DailyReportRepository {
  /**
   * Finds a daily report by User ID and Date (YYYY-MM-DD).
   */
  async findByUserAndDate(userId: string, date: string): Promise<DailyReportRecord | null> {
    const sql = `
      SELECT 
        dr.id, dr.user_id, p.full_name AS user_name, p.email AS user_email,
        COALESCE(r.name, 'Employee') AS role,
        DATE_FORMAT(dr.report_date, '%Y-%m-%d') AS report_date, dr.status, dr.tomorrow_plan, dr.blockers,
        dr.company_requirements, dr.notes, dr.submitted_at,
        (SELECT COUNT(*) FROM daily_report_tasks drt WHERE drt.report_id = dr.id) AS task_count,
        (SELECT COUNT(*) FROM daily_report_attachments dra WHERE dra.report_id = dr.id) AS attachment_count,
        dr.created_at, dr.updated_at
      FROM daily_reports dr
      JOIN profiles p ON dr.user_id = p.id
      LEFT JOIN user_roles ur ON p.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE dr.user_id = ? AND dr.report_date = ?
      LIMIT 1
    `;
    return queryOne<DailyReportRecord>(sql, [userId, date]);
  }

  /**
   * Finds a daily report by ID.
   */
  async findById(id: string): Promise<DailyReportRecord | null> {
    const sql = `
      SELECT 
        dr.id, dr.user_id, p.full_name AS user_name, p.email AS user_email,
        COALESCE(r.name, 'Employee') AS role,
        DATE_FORMAT(dr.report_date, '%Y-%m-%d') AS report_date, dr.status, dr.tomorrow_plan, dr.blockers,
        dr.company_requirements, dr.notes, dr.submitted_at,
        (SELECT COUNT(*) FROM daily_report_tasks drt WHERE drt.report_id = dr.id) AS task_count,
        (SELECT COUNT(*) FROM daily_report_attachments dra WHERE dra.report_id = dr.id) AS attachment_count,
        dr.created_at, dr.updated_at
      FROM daily_reports dr
      JOIN profiles p ON dr.user_id = p.id
      LEFT JOIN user_roles ur ON p.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE dr.id = ?
      LIMIT 1
    `;
    return queryOne<DailyReportRecord>(sql, [id]);
  }

  /**
   * Lists daily reports with pagination and optional user scoping.
   */
  async listReports(
    filter: DailyReportListFilter,
    pagination: DailyReportPaginationOptions,
    scopedUserId?: string | null
  ): Promise<{ reports: DailyReportRecord[]; total: number }> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (scopedUserId) {
      conditions.push("dr.user_id = ?");
      params.push(scopedUserId);
    } else if (filter.user_id) {
      conditions.push("dr.user_id = ?");
      params.push(filter.user_id);
    }

    if (filter.date) {
      conditions.push("dr.report_date = ?");
      params.push(filter.date);
    }
    if (filter.from) {
      conditions.push("dr.report_date >= ?");
      params.push(filter.from);
    }
    if (filter.to) {
      conditions.push("dr.report_date <= ?");
      params.push(filter.to);
    }
    if (filter.status) {
      conditions.push("dr.status = ?");
      params.push(filter.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // 1. Total count
    const countSql = `SELECT COUNT(*) AS total FROM daily_reports dr ${whereClause}`;
    const countRow = await queryOne<{ total: number }>(countSql, params);
    const total = countRow ? Number(countRow.total) : 0;

    // 2. Paginated rows
    const page = Math.max(1, pagination.page);
    const limit = Math.max(1, Math.min(100, pagination.limit));
    const offset = (page - 1) * limit;

    const dataSql = `
      SELECT 
        dr.id, dr.user_id, p.full_name AS user_name, p.email AS user_email,
        COALESCE(r.name, 'Employee') AS role,
        DATE_FORMAT(dr.report_date, '%Y-%m-%d') AS report_date, dr.status, dr.tomorrow_plan, dr.blockers,
        dr.company_requirements, dr.notes, dr.submitted_at,
        (SELECT COUNT(*) FROM daily_report_tasks drt WHERE drt.report_id = dr.id) AS task_count,
        (SELECT COUNT(*) FROM daily_report_attachments dra WHERE dra.report_id = dr.id) AS attachment_count,
        dr.created_at, dr.updated_at
      FROM daily_reports dr
      JOIN profiles p ON dr.user_id = p.id
      LEFT JOIN user_roles ur ON p.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      ${whereClause}
      ORDER BY dr.report_date DESC, dr.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...params, limit, offset];
    const reports = await query<DailyReportRecord>(dataSql, dataParams);

    return { reports, total };
  }

  /**
   * Creates a new daily report.
   */
  async createReport(data: {
    id?: string;
    user_id: string;
    report_date: string;
    status?: string;
    tomorrow_plan?: string | null;
    blockers?: string | null;
    company_requirements?: string | null;
    notes?: string | null;
    submitted_at?: Date | string | null;
  }): Promise<DailyReportRecord> {
    const reportId = data.id || crypto.randomUUID();
    const status = data.status || "Draft";

    const sql = `
      INSERT INTO daily_reports (
        id, user_id, report_date, status, tomorrow_plan, blockers,
        company_requirements, notes, submitted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6))
    `;

    await execute(sql, [
      reportId,
      data.user_id,
      data.report_date,
      status,
      data.tomorrow_plan || null,
      data.blockers || null,
      data.company_requirements || null,
      data.notes || null,
      data.submitted_at || null,
    ]);

    const created = await this.findById(reportId);
    if (!created) {
      throw new Error("Failed to retrieve created daily report");
    }
    return created;
  }

  /**
   * Updates daily report fields.
   */
  async updateReport(id: string, fields: Record<string, any>): Promise<DailyReportRecord | null> {
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

    const updateSql = `UPDATE daily_reports SET ${setClauses.join(", ")} WHERE id = ?`;
    await execute(updateSql, params);

    return this.findById(id);
  }

  /**
   * Retrieves task line items for a daily report.
   */
  async getReportTasks(reportId: string): Promise<DailyReportTaskRecord[]> {
    const sql = `
      SELECT 
        drt.id,
        drt.report_id,
        drt.task_id,
        t.title AS task_title,
        t.project_id,
        pr.name AS project_name,
        drt.time_spent_minutes,
        drt.completion_percentage,
        drt.task_status,
        drt.custom_task_title
      FROM daily_report_tasks drt
      LEFT JOIN tasks t ON drt.task_id = t.id
      LEFT JOIN projects pr ON t.project_id = pr.id
      WHERE drt.report_id = ?
      ORDER BY drt.id ASC
    `;
    return query<DailyReportTaskRecord>(sql, [reportId]);
  }

  /**
   * Adds a task line item to a daily report.
   */
  async addReportTask(data: {
    report_id: string;
    task_id?: string | null;
    time_spent_minutes?: number | null;
    completion_percentage?: number | null;
    task_status?: string | null;
    custom_task_title?: string | null;
  }): Promise<DailyReportTaskRecord> {
    const itemId = crypto.randomUUID();
    const sql = `
      INSERT INTO daily_report_tasks (
        id, report_id, task_id, time_spent_minutes, completion_percentage, task_status, custom_task_title
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    await execute(sql, [
      itemId,
      data.report_id,
      data.task_id || null,
      data.time_spent_minutes !== undefined ? data.time_spent_minutes : null,
      data.completion_percentage !== undefined ? data.completion_percentage : null,
      data.task_status || null,
      data.custom_task_title || null,
    ]);

    const fetchSql = `
      SELECT 
        drt.id, drt.report_id, drt.task_id, t.title AS task_title,
        t.project_id, pr.name AS project_name,
        drt.time_spent_minutes, drt.completion_percentage,
        drt.task_status, drt.custom_task_title
      FROM daily_report_tasks drt
      LEFT JOIN tasks t ON drt.task_id = t.id
      LEFT JOIN projects pr ON t.project_id = pr.id
      WHERE drt.id = ?
      LIMIT 1
    `;
    const item = await queryOne<DailyReportTaskRecord>(fetchSql, [itemId]);
    if (!item) {
      throw new Error("Failed to retrieve created report task item");
    }
    return item;
  }

  /**
   * Updates a report task line item.
   */
  async updateReportTask(itemId: string, fields: Record<string, any>): Promise<DailyReportTaskRecord | null> {
    const keys = Object.keys(fields);
    if (keys.length === 0) {
      return null;
    }

    const setClauses: string[] = [];
    const params: any[] = [];

    for (const key of keys) {
      setClauses.push(`\`${key}\` = ?`);
      params.push(fields[key]);
    }
    params.push(itemId);

    const updateSql = `UPDATE daily_report_tasks SET ${setClauses.join(", ")} WHERE id = ?`;
    await execute(updateSql, params);

    const fetchSql = `
      SELECT 
        drt.id, drt.report_id, drt.task_id, t.title AS task_title,
        t.project_id, pr.name AS project_name,
        drt.time_spent_minutes, drt.completion_percentage,
        drt.task_status, drt.custom_task_title
      FROM daily_report_tasks drt
      LEFT JOIN tasks t ON drt.task_id = t.id
      LEFT JOIN projects pr ON t.project_id = pr.id
      WHERE drt.id = ?
      LIMIT 1
    `;
    return queryOne<DailyReportTaskRecord>(fetchSql, [itemId]);
  }

  /**
   * Retrieves attachments for a daily report.
   */
  async getAttachments(reportId: string): Promise<DailyReportAttachmentRecord[]> {
    const sql = `
      SELECT 
        dra.id, dra.report_id, dra.uploaded_by, p.full_name AS uploader_name,
        dra.file_name, dra.storage_path, dra.file_size, dra.file_type, dra.created_at
      FROM daily_report_attachments dra
      JOIN profiles p ON dra.uploaded_by = p.id
      WHERE dra.report_id = ?
      ORDER BY dra.created_at DESC
    `;
    return query<DailyReportAttachmentRecord>(sql, [reportId]);
  }

  /**
   * Adds an attachment metadata record to a daily report.
   */
  async addAttachment(data: {
    report_id: string;
    uploaded_by: string;
    file_name: string;
    storage_path: string;
    file_size?: number | null;
    file_type?: string | null;
  }): Promise<DailyReportAttachmentRecord> {
    const attachmentId = crypto.randomUUID();
    const sql = `
      INSERT INTO daily_report_attachments (
        id, report_id, uploaded_by, file_name, storage_path, file_size, file_type, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6))
    `;

    await execute(sql, [
      attachmentId,
      data.report_id,
      data.uploaded_by,
      data.file_name,
      data.storage_path,
      data.file_size || null,
      data.file_type || null,
    ]);

    const fetchSql = `
      SELECT 
        dra.id, dra.report_id, dra.uploaded_by, p.full_name AS uploader_name,
        dra.file_name, dra.storage_path, dra.file_size, dra.file_type, dra.created_at
      FROM daily_report_attachments dra
      JOIN profiles p ON dra.uploaded_by = p.id
      WHERE dra.id = ?
      LIMIT 1
    `;
    const item = await queryOne<DailyReportAttachmentRecord>(fetchSql, [attachmentId]);
    if (!item) {
      throw new Error("Failed to retrieve created attachment metadata");
    }
    return item;
  }

  /**
   * Finds an attachment metadata record by ID.
   */
  async findAttachmentById(attachmentId: string): Promise<DailyReportAttachmentRecord | null> {
    const sql = `
      SELECT 
        dra.id, dra.report_id, dra.uploaded_by, p.full_name AS uploader_name,
        dra.file_name, dra.storage_path, dra.file_size, dra.file_type, dra.created_at
      FROM daily_report_attachments dra
      JOIN profiles p ON dra.uploaded_by = p.id
      WHERE dra.id = ?
      LIMIT 1
    `;
    return queryOne<DailyReportAttachmentRecord>(sql, [attachmentId]);
  }

  /**
   * Deletes an attachment metadata record.
   */
  async deleteAttachment(attachmentId: string): Promise<boolean> {
    const sql = `DELETE FROM daily_report_attachments WHERE id = ?`;
    const result = await execute(sql, [attachmentId]);
    return result.affectedRows > 0;
  }

  /**
   * Retrieves sync status for a report.
   */
  async getSyncStatus(reportId: string): Promise<DailyReportSyncRecord | null> {
    const sql = `
      SELECT 
        report_id, status, external_row_reference, attempt_count,
        error_message, last_attempt_at, synced_at, created_at, updated_at
      FROM daily_report_sync
      WHERE report_id = ?
      LIMIT 1
    `;
    return queryOne<DailyReportSyncRecord>(sql, [reportId]);
  }
}

export const dailyReportRepository = new DailyReportRepository();
