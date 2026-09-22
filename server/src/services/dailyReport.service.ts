import {
  dailyReportRepository,
  DailyReportRecord,
  DailyReportTaskRecord,
  DailyReportAttachmentRecord,
  DailyReportSyncRecord,
  DailyReportListFilter,
  DailyReportPaginationOptions,
} from "../repositories/dailyReport.repository.js";
import { taskRepository } from "../repositories/task.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { notificationRepository } from "../repositories/notification.repository.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { UserRoleInfo, rbacService } from "./rbac.service.js";
import { AppError, PaginationMeta } from "../types/api.types.js";
import { isValidUuid, isValidDateString } from "../utils/validation.util.js";

const VALID_TASK_STATUSES = new Set([
  "Todo",
  "In Progress",
  "Review",
  "Needs Revision",
  "Completed",
  "On Hold",
  "Cancelled",
]);

const VALID_REPORT_STATUSES = new Set(["Draft", "Submitted"]);

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
  status: "pending" | "processing" | "synced" | "failed" | "permanently_failed";
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

export class DailyReportService {
  /**
   * Helper to extract "Today's Plan" from notes column if formatted as "Today's Plan: <plan>".
   */
  private extractTodayPlan(notes: string | null): string | null {
    if (!notes) return null;
    const match = notes.match(/^Today's Plan:\s*(.+)$/im);
    return match ? match[1].trim() : null;
  }

  /**
   * Formats notes ensuring the morning plan is stored using standard prefix.
   */
  private formatNotes(notes?: string | null, morningPlan?: string | null): string | null {
    if (morningPlan && morningPlan.trim()) {
      const planClean = morningPlan.trim();
      if (notes && notes.trim() && !notes.startsWith("Today's Plan:")) {
        return `Today's Plan: ${planClean}\n\n${notes.trim()}`;
      }
      return `Today's Plan: ${planClean}`;
    }
    return notes ? notes.trim() : null;
  }

  private formatTaskItem(raw: DailyReportTaskRecord): SafeDailyReportTaskDto {
    return {
      id: raw.id,
      report_id: raw.report_id,
      task_id: raw.task_id,
      task_title: raw.task_title || null,
      project_id: raw.project_id || null,
      project_name: raw.project_name || null,
      time_spent_minutes: raw.time_spent_minutes !== null ? Number(raw.time_spent_minutes) : null,
      completion_percentage: raw.completion_percentage !== null ? Number(raw.completion_percentage) : null,
      task_status: raw.task_status,
      custom_task_title: raw.custom_task_title,
    };
  }

  private formatAttachment(raw: DailyReportAttachmentRecord): SafeDailyReportAttachmentDto {
    return {
      id: raw.id,
      report_id: raw.report_id,
      uploaded_by: raw.uploaded_by,
      uploader_name: raw.uploader_name || null,
      file_name: raw.file_name,
      storage_path: raw.storage_path,
      file_size: raw.file_size !== null ? Number(raw.file_size) : null,
      file_type: raw.file_type,
      created_at:
        typeof raw.created_at === "object" && raw.created_at !== null && "toISOString" in raw.created_at
          ? (raw.created_at as Date).toISOString()
          : String(raw.created_at),
    };
  }

  private formatSync(raw: DailyReportSyncRecord | null): SafeDailyReportSyncDto | null {
    if (!raw) return null;
    return {
      report_id: raw.report_id,
      status: raw.status,
      external_row_reference: raw.external_row_reference,
      attempt_count: raw.attempt_count,
      error_message: raw.error_message,
      last_attempt_at:
        raw.last_attempt_at && typeof raw.last_attempt_at === "object" && "toISOString" in raw.last_attempt_at
          ? (raw.last_attempt_at as Date).toISOString()
          : raw.last_attempt_at ? String(raw.last_attempt_at) : null,
      synced_at:
        raw.synced_at && typeof raw.synced_at === "object" && "toISOString" in raw.synced_at
          ? (raw.synced_at as Date).toISOString()
          : raw.synced_at ? String(raw.synced_at) : null,
    };
  }

  private formatReport(
    raw: DailyReportRecord,
    tasks?: DailyReportTaskRecord[],
    attachments?: DailyReportAttachmentRecord[],
    sync?: DailyReportSyncRecord | null
  ): SafeDailyReportDto {
    const reportDate = String(raw.report_date).split("T")[0];

    const submittedAt = raw.submitted_at
      ? typeof raw.submitted_at === "object" && raw.submitted_at !== null && "toISOString" in raw.submitted_at
        ? (raw.submitted_at as Date).toISOString()
        : String(raw.submitted_at)
      : null;

    const createdAt =
      typeof raw.created_at === "object" && raw.created_at !== null && "toISOString" in raw.created_at
        ? (raw.created_at as Date).toISOString()
        : String(raw.created_at);

    const updatedAt =
      typeof raw.updated_at === "object" && raw.updated_at !== null && "toISOString" in raw.updated_at
        ? (raw.updated_at as Date).toISOString()
        : String(raw.updated_at);

    return {
      id: raw.id,
      user_id: raw.user_id,
      user_name: raw.user_name || "",
      user_email: raw.user_email || "",
      role: raw.role || "Employee",
      report_date: reportDate,
      status: raw.status,
      today_plan: this.extractTodayPlan(raw.notes),
      tomorrow_plan: raw.tomorrow_plan,
      blockers: raw.blockers,
      company_requirements: raw.company_requirements,
      notes: raw.notes,
      submitted_at: submittedAt,
      tasks: tasks ? tasks.map((t) => this.formatTaskItem(t)) : undefined,
      attachments: attachments ? attachments.map((a) => this.formatAttachment(a)) : undefined,
      sync: sync !== undefined ? this.formatSync(sync) : undefined,
      task_count: raw.task_count !== undefined ? Number(raw.task_count) : 0,
      attachment_count: raw.attachment_count !== undefined ? Number(raw.attachment_count) : 0,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  }

  /**
   * Helper to verify caller's access to a report.
   */
  private checkReportAccess(report: DailyReportRecord, callerAuth: UserRoleInfo, requireManage = false): void {
    const isOwner = report.user_id === callerAuth.userId;
    if (isOwner && !requireManage) {
      return;
    }

    if (callerAuth.isSuperAdmin) {
      return;
    }

    if (requireManage) {
      if (isOwner) return; // owner can update their own report
      if (rbacService.hasPermission(callerAuth, "reports.manage")) return;
      throw new AppError("You do not have permission to modify this daily report.", 403, "FORBIDDEN");
    }

    if (rbacService.hasPermission(callerAuth, "reports.view") || rbacService.hasPermission(callerAuth, "reports.manage")) {
      return;
    }

    throw new AppError("You do not have permission to access this daily report.", 403, "FORBIDDEN");
  }

  /**
   * Retrieves today's report for the authenticated user.
   */
  async getTodayReport(userId: string): Promise<SafeDailyReportDto | null> {
    const todayStr = new Date().toISOString().split("T")[0];
    const report = await dailyReportRepository.findByUserAndDate(userId, todayStr);
    if (!report) {
      return null;
    }

    const [tasks, attachments, sync] = await Promise.all([
      dailyReportRepository.getReportTasks(report.id),
      dailyReportRepository.getAttachments(report.id),
      dailyReportRepository.getSyncStatus(report.id),
    ]);

    return this.formatReport(report, tasks, attachments, sync);
  }

  /**
   * Retrieves report details by ID.
   */
  async getReportById(reportId: string, callerAuth: UserRoleInfo): Promise<SafeDailyReportDto> {
    if (!isValidUuid(reportId)) {
      throw new AppError("Invalid report ID format.", 400, "INVALID_UUID");
    }

    const report = await dailyReportRepository.findById(reportId);
    if (!report) {
      throw new AppError("Daily report not found.", 404, "REPORT_NOT_FOUND");
    }

    this.checkReportAccess(report, callerAuth, false);

    const [tasks, attachments, sync] = await Promise.all([
      dailyReportRepository.getReportTasks(report.id),
      dailyReportRepository.getAttachments(report.id),
      dailyReportRepository.getSyncStatus(report.id),
    ]);

    return this.formatReport(report, tasks, attachments, sync);
  }

  /**
   * Lists daily reports with pagination.
   * Scoped to user if not management.
   */
  async listReports(
    filter: DailyReportListFilter,
    pagination: DailyReportPaginationOptions,
    callerAuth: UserRoleInfo
  ): Promise<{ reports: SafeDailyReportDto[]; pagination: PaginationMeta }> {
    const isManagement =
      callerAuth.isSuperAdmin ||
      rbacService.hasPermission(callerAuth, "reports.view") ||
      rbacService.hasPermission(callerAuth, "reports.manage");

    let scopedUserId: string | null = null;
    if (!isManagement) {
      scopedUserId = callerAuth.userId;
    }

    if (filter.date && !isValidDateString(filter.date)) {
      throw new AppError("Invalid 'date' filter format. Expected YYYY-MM-DD.", 400, "INVALID_DATE");
    }
    if (filter.from && !isValidDateString(filter.from)) {
      throw new AppError("Invalid 'from' filter format. Expected YYYY-MM-DD.", 400, "INVALID_DATE");
    }
    if (filter.to && !isValidDateString(filter.to)) {
      throw new AppError("Invalid 'to' filter format. Expected YYYY-MM-DD.", 400, "INVALID_DATE");
    }
    if (filter.user_id && !isValidUuid(filter.user_id)) {
      throw new AppError("Invalid 'user_id' filter format.", 400, "INVALID_UUID");
    }

    const { reports, total } = await dailyReportRepository.listReports(filter, pagination, scopedUserId);
    const totalPages = Math.ceil(total / pagination.limit) || 1;

    return {
      reports: reports.map((r) => this.formatReport(r)),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Creates a new daily report.
   */
  async createReport(
    data: {
      report_date?: string;
      status?: string;
      morning_plan?: string | null;
      today_plan?: string | null;
      tomorrow_plan?: string | null;
      blockers?: string | null;
      company_requirements?: string | null;
      notes?: string | null;
      tasks?: Array<{
        task_id?: string | null;
        time_spent_minutes?: number | null;
        completion_percentage?: number | null;
        task_status?: string | null;
        custom_task_title?: string | null;
      }>;
    },
    callerAuth: UserRoleInfo
  ): Promise<SafeDailyReportDto> {
    const userId = callerAuth.userId;
    const reportDate = data.report_date && data.report_date.trim()
      ? data.report_date.trim()
      : new Date().toISOString().split("T")[0];

    if (!isValidDateString(reportDate)) {
      throw new AppError("Invalid 'report_date' format. Expected YYYY-MM-DD.", 400, "INVALID_DATE");
    }

    // Check if report already exists for this date
    const existing = await dailyReportRepository.findByUserAndDate(userId, reportDate);
    if (existing) {
      throw new AppError(
        `A daily report already exists for ${reportDate}.`,
        409,
        "REPORT_ALREADY_EXISTS",
        { reportId: existing.id }
      );
    }

    const status = data.status && VALID_REPORT_STATUSES.has(data.status) ? data.status : "Draft";
    const submittedAt = status === "Submitted" ? new Date() : null;

    // Morning plan formatting: stored in notes as "Today's Plan: <plan>"
    const morningPlanInput = data.morning_plan || data.today_plan || null;
    const formattedNotes = this.formatNotes(data.notes, morningPlanInput);

    // CRITICAL: tomorrow_plan must remain NULL unless explicitly provided
    const tomorrowPlan = data.tomorrow_plan !== undefined && data.tomorrow_plan !== null && data.tomorrow_plan.trim() !== ""
      ? data.tomorrow_plan.trim()
      : null;

    // Validate tasks if supplied
    if (data.tasks && Array.isArray(data.tasks)) {
      for (const t of data.tasks) {
        if (t.completion_percentage !== undefined && t.completion_percentage !== null) {
          const comp = Number(t.completion_percentage);
          if (isNaN(comp) || comp < 0 || comp > 100) {
            throw new AppError("Task completion percentage must be an integer between 0 and 100.", 400, "INVALID_COMPLETION");
          }
        }
        if (t.time_spent_minutes !== undefined && t.time_spent_minutes !== null) {
          const time = Number(t.time_spent_minutes);
          if (isNaN(time) || time < 0) {
            throw new AppError("Task time spent must be a non-negative integer.", 400, "INVALID_TIME_SPENT");
          }
        }
        if (t.task_status && !VALID_TASK_STATUSES.has(t.task_status)) {
          throw new AppError(`Invalid task_status '${t.task_status}'.`, 400, "INVALID_TASK_STATUS");
        }
        if (t.task_id && !isValidUuid(t.task_id)) {
          throw new AppError("Invalid task_id format.", 400, "INVALID_UUID");
        }
      }
    }

    const createdReport = await dailyReportRepository.createReport({
      user_id: userId,
      report_date: reportDate,
      status,
      tomorrow_plan: tomorrowPlan,
      blockers: data.blockers ? data.blockers.trim() : null,
      company_requirements: data.company_requirements ? data.company_requirements.trim() : null,
      notes: formattedNotes,
      submitted_at: submittedAt,
    });

    // Insert task items if provided
    const createdTasks: DailyReportTaskRecord[] = [];
    if (data.tasks && Array.isArray(data.tasks)) {
      for (const t of data.tasks) {
        const item = await dailyReportRepository.addReportTask({
          report_id: createdReport.id,
          task_id: t.task_id || null,
          time_spent_minutes: t.time_spent_minutes !== undefined ? Number(t.time_spent_minutes) : null,
          completion_percentage: t.completion_percentage !== undefined ? Number(t.completion_percentage) : null,
          task_status: t.task_status || null,
          custom_task_title: t.custom_task_title || null,
        });
        createdTasks.push(item);
      }
    }

    // Notify all Admins and Super Admins if report is submitted
    if (createdReport.status === "Submitted") {
      try {
        const adminIds = await userRepository.getAdminUserIds();
        const callerProfile = await userRepository.findById(callerAuth.userId);
        const submitterName = callerProfile?.full_name || callerAuth.userId;

        for (const adminId of adminIds) {
          if (adminId !== callerAuth.userId) {
            await notificationRepository.createNotification({
              user_id: adminId,
              type: "daily_report_submitted",
              title: "Daily Report Submitted",
              message: `${submitterName} submitted their daily report for ${reportDate}.`,
              reference_id: createdReport.id,
              reference_type: "daily_report",
            });
          }
        }
      } catch (err) {
        console.warn("[NOTIFICATION] Could not dispatch daily_report_submitted notification to admins:", err);
      }
    }

    return this.formatReport(createdReport, createdTasks, [], null);
  }

  /**
   * Updates an existing daily report.
   */
  async updateReport(
    reportId: string,
    data: {
      status?: string;
      morning_plan?: string | null;
      today_plan?: string | null;
      tomorrow_plan?: string | null;
      blockers?: string | null;
      company_requirements?: string | null;
      notes?: string | null;
      submitted_at?: string | null;
    },
    callerAuth: UserRoleInfo
  ): Promise<SafeDailyReportDto> {
    if (!isValidUuid(reportId)) {
      throw new AppError("Invalid report ID format.", 400, "INVALID_UUID");
    }

    const report = await dailyReportRepository.findById(reportId);
    if (!report) {
      throw new AppError("Daily report not found.", 404, "REPORT_NOT_FOUND");
    }

    this.checkReportAccess(report, callerAuth, true);

    const fieldsToUpdate: Record<string, any> = {};

    if (data.status !== undefined) {
      if (!VALID_REPORT_STATUSES.has(data.status)) {
        throw new AppError(`Invalid status '${data.status}'. Allowed values: Draft, Submitted`, 400, "INVALID_STATUS");
      }
      fieldsToUpdate.status = data.status;
      if (data.status === "Submitted" && !report.submitted_at) {
        fieldsToUpdate.submitted_at = new Date();
      }
    }

    if (data.tomorrow_plan !== undefined) {
      fieldsToUpdate.tomorrow_plan = data.tomorrow_plan ? data.tomorrow_plan.trim() : null;
    }

    if (data.blockers !== undefined) {
      fieldsToUpdate.blockers = data.blockers ? data.blockers.trim() : null;
    }

    if (data.company_requirements !== undefined) {
      fieldsToUpdate.company_requirements = data.company_requirements ? data.company_requirements.trim() : null;
    }

    const morningPlanInput = data.morning_plan || data.today_plan;
    if (morningPlanInput !== undefined || data.notes !== undefined) {
      const baseNotes = data.notes !== undefined ? data.notes : report.notes;
      fieldsToUpdate.notes = this.formatNotes(baseNotes, morningPlanInput);
    }

    const updated = await dailyReportRepository.updateReport(reportId, fieldsToUpdate);
    if (!updated) {
      throw new AppError("Failed to update daily report.", 500, "UPDATE_FAILED");
    }

    const [tasks, attachments, sync] = await Promise.all([
      dailyReportRepository.getReportTasks(report.id),
      dailyReportRepository.getAttachments(report.id),
      dailyReportRepository.getSyncStatus(report.id),
    ]);

    // If report was transitioned to Submitted, notify Admins
    if (fieldsToUpdate.status === "Submitted" && report.status !== "Submitted") {
      try {
        const adminIds = await userRepository.getAdminUserIds();
        const callerProfile = await userRepository.findById(callerAuth.userId);
        const submitterName = callerProfile?.full_name || callerAuth.userId;

        for (const adminId of adminIds) {
          if (adminId !== callerAuth.userId) {
            await notificationRepository.createNotification({
              user_id: adminId,
              type: "daily_report_submitted",
              title: "Daily Report Submitted",
              message: `${submitterName} submitted their daily report for ${report.report_date}.`,
              reference_id: updated.id,
              reference_type: "daily_report",
            });
          }
        }
      } catch (err) {
        console.warn("[NOTIFICATION] Could not dispatch daily report submission notification:", err);
      }
    }

    return this.formatReport(updated, tasks, attachments, sync);
  }

  /**
   * Retrieves task line items for a daily report.
   */
  async getReportTasks(reportId: string, callerAuth: UserRoleInfo): Promise<SafeDailyReportTaskDto[]> {
    if (!isValidUuid(reportId)) {
      throw new AppError("Invalid report ID format.", 400, "INVALID_UUID");
    }

    const report = await dailyReportRepository.findById(reportId);
    if (!report) {
      throw new AppError("Daily report not found.", 404, "REPORT_NOT_FOUND");
    }

    this.checkReportAccess(report, callerAuth, false);

    const tasks = await dailyReportRepository.getReportTasks(reportId);
    return tasks.map((t) => this.formatTaskItem(t));
  }

  /**
   * Adds a task line item to a daily report.
   */
  async addReportTask(
    reportId: string,
    data: {
      task_id?: string | null;
      time_spent_minutes?: number | null;
      completion_percentage?: number | null;
      task_status?: string | null;
      custom_task_title?: string | null;
    },
    callerAuth: UserRoleInfo
  ): Promise<SafeDailyReportTaskDto> {
    if (!isValidUuid(reportId)) {
      throw new AppError("Invalid report ID format.", 400, "INVALID_UUID");
    }

    const report = await dailyReportRepository.findById(reportId);
    if (!report) {
      throw new AppError("Daily report not found.", 404, "REPORT_NOT_FOUND");
    }

    this.checkReportAccess(report, callerAuth, true);

    if (data.task_id) {
      if (!isValidUuid(data.task_id)) {
        throw new AppError("Invalid task ID format.", 400, "INVALID_UUID");
      }
      const task = await taskRepository.findById(data.task_id);
      if (!task) {
        throw new AppError("Referenced task does not exist.", 404, "TASK_NOT_FOUND");
      }
    }

    if (data.completion_percentage !== undefined && data.completion_percentage !== null) {
      const comp = Number(data.completion_percentage);
      if (isNaN(comp) || comp < 0 || comp > 100) {
        throw new AppError("Task completion percentage must be an integer between 0 and 100.", 400, "INVALID_COMPLETION");
      }
    }

    if (data.time_spent_minutes !== undefined && data.time_spent_minutes !== null) {
      const time = Number(data.time_spent_minutes);
      if (isNaN(time) || time < 0) {
        throw new AppError("Task time spent must be a non-negative integer.", 400, "INVALID_TIME_SPENT");
      }
    }

    if (data.task_status && !VALID_TASK_STATUSES.has(data.task_status)) {
      throw new AppError(`Invalid task_status '${data.task_status}'.`, 400, "INVALID_TASK_STATUS");
    }

    const item = await dailyReportRepository.addReportTask({
      report_id: reportId,
      task_id: data.task_id || null,
      time_spent_minutes: data.time_spent_minutes !== undefined ? Number(data.time_spent_minutes) : null,
      completion_percentage: data.completion_percentage !== undefined ? Number(data.completion_percentage) : null,
      task_status: data.task_status || null,
      custom_task_title: data.custom_task_title ? data.custom_task_title.trim() : null,
    });

    return this.formatTaskItem(item);
  }

  /**
   * Updates a report task line item.
   */
  async updateReportTask(
    reportId: string,
    taskId: string,
    data: {
      time_spent_minutes?: number | null;
      completion_percentage?: number | null;
      task_status?: string | null;
      custom_task_title?: string | null;
    },
    callerAuth: UserRoleInfo
  ): Promise<SafeDailyReportTaskDto> {
    if (!isValidUuid(reportId) || !isValidUuid(taskId)) {
      throw new AppError("Invalid ID format.", 400, "INVALID_UUID");
    }

    const report = await dailyReportRepository.findById(reportId);
    if (!report) {
      throw new AppError("Daily report not found.", 404, "REPORT_NOT_FOUND");
    }

    this.checkReportAccess(report, callerAuth, true);

    const fieldsToUpdate: Record<string, any> = {};

    if (data.completion_percentage !== undefined) {
      if (data.completion_percentage !== null) {
        const comp = Number(data.completion_percentage);
        if (isNaN(comp) || comp < 0 || comp > 100) {
          throw new AppError("Task completion percentage must be an integer between 0 and 100.", 400, "INVALID_COMPLETION");
        }
        fieldsToUpdate.completion_percentage = comp;
      } else {
        fieldsToUpdate.completion_percentage = null;
      }
    }

    if (data.time_spent_minutes !== undefined) {
      if (data.time_spent_minutes !== null) {
        const time = Number(data.time_spent_minutes);
        if (isNaN(time) || time < 0) {
          throw new AppError("Task time spent must be a non-negative integer.", 400, "INVALID_TIME_SPENT");
        }
        fieldsToUpdate.time_spent_minutes = time;
      } else {
        fieldsToUpdate.time_spent_minutes = null;
      }
    }

    if (data.task_status !== undefined) {
      if (data.task_status && !VALID_TASK_STATUSES.has(data.task_status)) {
        throw new AppError(`Invalid task_status '${data.task_status}'.`, 400, "INVALID_TASK_STATUS");
      }
      fieldsToUpdate.task_status = data.task_status || null;
    }

    if (data.custom_task_title !== undefined) {
      fieldsToUpdate.custom_task_title = data.custom_task_title ? data.custom_task_title.trim() : null;
    }

    const updated = await dailyReportRepository.updateReportTask(taskId, fieldsToUpdate);
    if (!updated) {
      throw new AppError("Report task line item not found or could not be updated.", 404, "TASK_ITEM_NOT_FOUND");
    }

    return this.formatTaskItem(updated);
  }

  /**
   * Retrieves attachment metadata for a daily report.
   */
  async getAttachments(reportId: string, callerAuth: UserRoleInfo): Promise<SafeDailyReportAttachmentDto[]> {
    if (!isValidUuid(reportId)) {
      throw new AppError("Invalid report ID format.", 400, "INVALID_UUID");
    }

    const report = await dailyReportRepository.findById(reportId);
    if (!report) {
      throw new AppError("Daily report not found.", 404, "REPORT_NOT_FOUND");
    }

    this.checkReportAccess(report, callerAuth, false);

    const attachments = await dailyReportRepository.getAttachments(reportId);
    return attachments.map((a) => this.formatAttachment(a));
  }

  /**
   * Adds an attachment metadata record to a daily report.
   */
  async addAttachment(
    reportId: string,
    data: {
      file_name: string;
      storage_path: string;
      file_size?: number | null;
      file_type?: string | null;
    },
    callerAuth: UserRoleInfo
  ): Promise<SafeDailyReportAttachmentDto> {
    if (!isValidUuid(reportId)) {
      throw new AppError("Invalid report ID format.", 400, "INVALID_UUID");
    }

    const report = await dailyReportRepository.findById(reportId);
    if (!report) {
      throw new AppError("Daily report not found.", 404, "REPORT_NOT_FOUND");
    }

    this.checkReportAccess(report, callerAuth, true);

    if (!data.file_name || !data.file_name.trim()) {
      throw new AppError("Attachment file_name is required.", 400, "INVALID_FILE_NAME");
    }
    if (!data.storage_path || !data.storage_path.trim()) {
      throw new AppError("Attachment storage_path is required.", 400, "INVALID_STORAGE_PATH");
    }

    const attachment = await dailyReportRepository.addAttachment({
      report_id: reportId,
      uploaded_by: callerAuth.userId,
      file_name: data.file_name.trim(),
      storage_path: data.storage_path.trim(),
      file_size: data.file_size !== undefined && data.file_size !== null ? Number(data.file_size) : null,
      file_type: data.file_type ? data.file_type.trim() : null,
    });

    await auditRepository.log({
      actor_id: callerAuth.userId,
      action: "DAILY_REPORT_ATTACHMENT_ADD",
      table_name: "daily_report_attachments",
      record_id: attachment.id,
      new_value: { report_id: reportId, file_name: data.file_name, storage_path: data.storage_path },
    });

    return this.formatAttachment(attachment);
  }

  /**
   * Deletes an attachment metadata record from a daily report.
   */
  async deleteAttachment(
    reportId: string,
    attachmentId: string,
    callerAuth: UserRoleInfo
  ): Promise<void> {
    if (!isValidUuid(reportId)) {
      throw new AppError("Invalid report ID format.", 400, "INVALID_UUID");
    }
    if (!isValidUuid(attachmentId)) {
      throw new AppError("Invalid attachment ID format.", 400, "INVALID_UUID");
    }

    const report = await dailyReportRepository.findById(reportId);
    if (!report) {
      throw new AppError("Daily report not found.", 404, "REPORT_NOT_FOUND");
    }

    this.checkReportAccess(report, callerAuth, true);

    const attachment = await dailyReportRepository.findAttachmentById(attachmentId);
    if (!attachment || attachment.report_id !== reportId) {
      throw new AppError("Attachment not found for this report.", 404, "ATTACHMENT_NOT_FOUND");
    }

    const isOwner = attachment.uploaded_by === callerAuth.userId || report.user_id === callerAuth.userId;
    const isManagement =
      callerAuth.role === "SUPER_ADMIN" ||
      callerAuth.role === "ADMIN" ||
      callerAuth.role === "Super Admin" ||
      callerAuth.role === "Admin";

    if (!isOwner && !isManagement) {
      throw new AppError("You do not have permission to delete this attachment.", 403, "FORBIDDEN");
    }

    await dailyReportRepository.deleteAttachment(attachmentId);

    await auditRepository.log({
      actor_id: callerAuth.userId,
      action: "DAILY_REPORT_ATTACHMENT_DELETE",
      table_name: "daily_report_attachments",
      record_id: attachmentId,
      old_value: { report_id: reportId, file_name: attachment.file_name, storage_path: attachment.storage_path },
    });
  }

  /**
   * Retrieves Google Sheets sync metadata for a daily report.
   */
  async getSyncStatus(reportId: string, callerAuth: UserRoleInfo): Promise<SafeDailyReportSyncDto | null> {
    if (!isValidUuid(reportId)) {
      throw new AppError("Invalid report ID format.", 400, "INVALID_UUID");
    }

    const report = await dailyReportRepository.findById(reportId);
    if (!report) {
      throw new AppError("Daily report not found.", 404, "REPORT_NOT_FOUND");
    }

    this.checkReportAccess(report, callerAuth, false);

    const sync = await dailyReportRepository.getSyncStatus(reportId);
    return this.formatSync(sync);
  }
}

export const dailyReportService = new DailyReportService();
