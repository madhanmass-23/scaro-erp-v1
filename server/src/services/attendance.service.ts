import {
  attendanceRepository,
  AttendanceSessionRecord,
  ManagementAttendanceRecord,
  AttendanceHistoryFilter,
  ManagementAttendanceFilter,
  AttendancePaginationOptions,
} from "../repositories/attendance.repository.js";
import { dailyReportRepository } from "../repositories/dailyReport.repository.js";
import { UserRoleInfo, rbacService } from "./rbac.service.js";
import { AppError, PaginationMeta } from "../types/api.types.js";
import { isValidUuid, isValidDateString } from "../utils/validation.util.js";

const VALID_ATTENDANCE_STATUSES = new Set(["Present", "Absent", "Half Day"]);

export interface SafeAttendanceSessionDto {
  id: string;
  user_id: string;
  session_date: string;
  clock_in_time: string;
  clock_out_time: string | null;
  status: "Present" | "Absent" | "Half Day";
  duration_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface SafeManagementAttendanceDto {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  role: string;
  session_date: string;
  clock_in_time: string;
  clock_out_time: string | null;
  status: "Present" | "Absent" | "Half Day";
  duration_minutes: number;
  report: {
    id: string | null;
    status: string | null;
    notes: string | null;
    tomorrow_plan: string | null;
    blockers: string | null;
  } | null;
}

export class AttendanceService {
  private formatSession(raw: AttendanceSessionRecord): SafeAttendanceSessionDto {
    const clockIn =
      typeof raw.clock_in_time === "object" && raw.clock_in_time !== null && "toISOString" in raw.clock_in_time
        ? (raw.clock_in_time as Date).toISOString()
        : String(raw.clock_in_time);

    const clockOut = raw.clock_out_time
      ? typeof raw.clock_out_time === "object" && raw.clock_out_time !== null && "toISOString" in raw.clock_out_time
        ? (raw.clock_out_time as Date).toISOString()
        : String(raw.clock_out_time)
      : null;

    const createdAt =
      typeof raw.created_at === "object" && raw.created_at !== null && "toISOString" in raw.created_at
        ? (raw.created_at as Date).toISOString()
        : String(raw.created_at);

    const updatedAt =
      typeof raw.updated_at === "object" && raw.updated_at !== null && "toISOString" in raw.updated_at
        ? (raw.updated_at as Date).toISOString()
        : String(raw.updated_at);

    const sessionDate = String(raw.session_date).split("T")[0];

    return {
      id: raw.id,
      user_id: raw.user_id,
      session_date: sessionDate,
      clock_in_time: clockIn,
      clock_out_time: clockOut,
      status: raw.status,
      duration_minutes: raw.duration_minutes !== undefined && raw.duration_minutes !== null ? Number(raw.duration_minutes) : 0,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  }

  private formatManagementRecord(raw: ManagementAttendanceRecord): SafeManagementAttendanceDto {
    const clockIn =
      typeof raw.clock_in_time === "object" && raw.clock_in_time !== null && "toISOString" in raw.clock_in_time
        ? (raw.clock_in_time as Date).toISOString()
        : String(raw.clock_in_time);

    const clockOut = raw.clock_out_time
      ? typeof raw.clock_out_time === "object" && raw.clock_out_time !== null && "toISOString" in raw.clock_out_time
        ? (raw.clock_out_time as Date).toISOString()
        : String(raw.clock_out_time)
      : null;

    const sessionDate = String(raw.session_date).split("T")[0];

    return {
      id: raw.id,
      user_id: raw.user_id,
      user_name: raw.user_name,
      user_email: raw.user_email,
      role: raw.role,
      session_date: sessionDate,
      clock_in_time: clockIn,
      clock_out_time: clockOut,
      status: raw.status,
      duration_minutes: raw.duration_minutes !== null ? Number(raw.duration_minutes) : 0,
      report: raw.report_id
        ? {
            id: raw.report_id,
            status: raw.report_status,
            notes: raw.notes,
            tomorrow_plan: raw.tomorrow_plan,
            blockers: raw.blockers,
          }
        : null,
    };
  }

  /**
   * Signs in the authenticated user and starts an attendance session.
   */
  async signIn(userId: string): Promise<SafeAttendanceSessionDto> {
    // 1. Check if user already has an active session
    const active = await attendanceRepository.findActiveSession(userId);
    if (active) {
      throw new AppError(
        "You already have an active attendance session.",
        409,
        "SESSION_ALREADY_ACTIVE",
        { sessionId: active.id, clockInTime: active.clock_in_time }
      );
    }

    // 2. Determine session date (YYYY-MM-DD) from server UTC time
    const todayStr = new Date().toISOString().split("T")[0];

    // 3. Create session
    const created = await attendanceRepository.createSession(userId, todayStr, "Present");
    return this.formatSession(created);
  }

  /**
   * Retrieves current active attendance session for authenticated user.
   */
  async getCurrentSession(userId: string): Promise<SafeAttendanceSessionDto | null> {
    const active = await attendanceRepository.findActiveSession(userId);
    if (!active) {
      return null;
    }
    return this.formatSession(active);
  }

  /**
   * Signs out the authenticated user.
   * For Employee/Intern: requires today's daily report to be submitted.
   */
  async signOut(userId: string, userAuth: UserRoleInfo): Promise<SafeAttendanceSessionDto> {
    // 1. Find active session
    const active = await attendanceRepository.findActiveSession(userId);
    if (!active) {
      throw new AppError(
        "No active attendance session found to sign out from.",
        400,
        "NO_ACTIVE_SESSION"
      );
    }

    // 2. Check Daily Report requirement for Employee / Intern
    const isManagement = userAuth.isSuperAdmin || userAuth.isAdmin || userAuth.role === "Admin";
    if (!isManagement) {
      const sessionDateStr = String(active.session_date).split("T")[0];

      const report = await dailyReportRepository.findByUserAndDate(userId, sessionDateStr);
      if (!report || report.status !== "Submitted") {
        throw new AppError(
          "Submit today's daily report before signing out.",
          400,
          "DAILY_REPORT_REQUIRED",
          { sessionDate: sessionDateStr }
        );
      }
    }

    // 3. Close the session
    const closed = await attendanceRepository.closeSession(active.id);
    if (!closed) {
      throw new AppError("Failed to close attendance session.", 500, "ATTENDANCE_CLOSE_FAILED");
    }

    return this.formatSession(closed);
  }

  /**
   * Retrieves authenticated user's personal attendance history.
   */
  async getHistory(
    userId: string,
    filter: AttendanceHistoryFilter,
    pagination: AttendancePaginationOptions
  ): Promise<{ sessions: SafeAttendanceSessionDto[]; pagination: PaginationMeta }> {
    if (filter.from && !isValidDateString(filter.from)) {
      throw new AppError("Invalid 'from' date format. Expected YYYY-MM-DD.", 400, "INVALID_DATE");
    }
    if (filter.to && !isValidDateString(filter.to)) {
      throw new AppError("Invalid 'to' date format. Expected YYYY-MM-DD.", 400, "INVALID_DATE");
    }
    if (filter.status && !VALID_ATTENDANCE_STATUSES.has(filter.status)) {
      throw new AppError(
        `Invalid status '${filter.status}'. Allowed values: Present, Absent, Half Day`,
        400,
        "INVALID_STATUS"
      );
    }

    const { sessions, total } = await attendanceRepository.getUserHistory(userId, filter, pagination);
    const totalPages = Math.ceil(total / pagination.limit) || 1;

    return {
      sessions: sessions.map((s) => this.formatSession(s)),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Retrieves management workforce attendance records (Admin / Super Admin only).
   */
  async getManagementAttendance(
    filter: ManagementAttendanceFilter,
    pagination: AttendancePaginationOptions,
    callerAuth: UserRoleInfo
  ): Promise<{ records: SafeManagementAttendanceDto[]; pagination: PaginationMeta }> {
    // Permission check
    const hasAccess =
      callerAuth.isSuperAdmin ||
      rbacService.hasPermission(callerAuth, "attendance.view") ||
      rbacService.hasPermission(callerAuth, "attendance.manage");

    if (!hasAccess) {
      throw new AppError(
        "You do not have permission to access management attendance records.",
        403,
        "FORBIDDEN"
      );
    }

    if (filter.date && !isValidDateString(filter.date)) {
      throw new AppError("Invalid 'date' format. Expected YYYY-MM-DD.", 400, "INVALID_DATE");
    }
    if (filter.from && !isValidDateString(filter.from)) {
      throw new AppError("Invalid 'from' date format. Expected YYYY-MM-DD.", 400, "INVALID_DATE");
    }
    if (filter.to && !isValidDateString(filter.to)) {
      throw new AppError("Invalid 'to' date format. Expected YYYY-MM-DD.", 400, "INVALID_DATE");
    }
    if (filter.user_id && !isValidUuid(filter.user_id)) {
      throw new AppError("Invalid 'user_id' filter format.", 400, "INVALID_UUID");
    }
    if (filter.status && !VALID_ATTENDANCE_STATUSES.has(filter.status)) {
      throw new AppError(
        `Invalid status '${filter.status}'. Allowed values: Present, Absent, Half Day`,
        400,
        "INVALID_STATUS"
      );
    }

    const { records, total } = await attendanceRepository.getManagementAttendance(filter, pagination);
    const totalPages = Math.ceil(total / pagination.limit) || 1;

    return {
      records: records.map((r) => this.formatManagementRecord(r)),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages,
      },
    };
  }
}

export const attendanceService = new AttendanceService();
