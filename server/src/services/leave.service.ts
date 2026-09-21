import {
  leaveRepository,
  LeaveRequestRecord,
  LeaveListFilter,
  LeavePaginationOptions,
} from "../repositories/leave.repository.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { authorizationService } from "./authorization.service.js";
import { UserRoleInfo, rbacService } from "./rbac.service.js";
import { AppError } from "../types/api.types.js";
import { isValidUuid, isValidDateString } from "../utils/validation.util.js";

const VALID_LEAVE_TYPES = new Set(["Leave", "Permission", "Work From Home"]);
const VALID_LEAVE_STATUSES = new Set(["Pending", "Approved", "Rejected", "Cancelled"]);

export interface SafeLeaveRequestDto {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_avatar: string | null;
  role: string;
  type: "Leave" | "Permission" | "Work From Home";
  start_date: string;
  end_date: string;
  reason: string;
  status: "Pending" | "Approved" | "Rejected" | "Cancelled";
  rejection_reason: string | null;
  reviewed_by: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export class LeaveService {
  private formatLeaveRequest(raw: LeaveRequestRecord): SafeLeaveRequestDto {
    return {
      id: raw.id,
      user_id: raw.user_id,
      user_name: raw.user_name || "",
      user_email: raw.user_email || "",
      user_avatar: raw.user_avatar || null,
      role: raw.role || "Employee",
      type: raw.type,
      start_date: raw.start_date ? String(raw.start_date).split("T")[0] : "",
      end_date: raw.end_date ? String(raw.end_date).split("T")[0] : "",
      reason: raw.reason,
      status: raw.status,
      rejection_reason: raw.rejection_reason,
      reviewed_by: raw.reviewed_by
        ? {
            id: raw.reviewed_by,
            full_name: raw.reviewer_name || null,
            email: raw.reviewer_email || null,
          }
        : null,
      reviewed_at:
        raw.reviewed_at && typeof raw.reviewed_at === "object" && "toISOString" in raw.reviewed_at
          ? (raw.reviewed_at as Date).toISOString()
          : raw.reviewed_at
          ? String(raw.reviewed_at)
          : null,
      created_at:
        typeof raw.created_at === "object" && raw.created_at !== null && "toISOString" in raw.created_at
          ? (raw.created_at as Date).toISOString()
          : String(raw.created_at),
      updated_at:
        typeof raw.updated_at === "object" && raw.updated_at !== null && "toISOString" in raw.updated_at
          ? (raw.updated_at as Date).toISOString()
          : String(raw.updated_at),
    };
  }

  /**
   * Lists leave requests with pagination, filters, and strict role scoping.
   */
  async listLeaveRequests(
    filter: LeaveListFilter,
    pagination: LeavePaginationOptions,
    callerAuth: UserRoleInfo
  ): Promise<{ requests: SafeLeaveRequestDto[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const hasManagementAccess =
      callerAuth.isSuperAdmin ||
      callerAuth.isAdmin ||
      rbacService.hasPermission(callerAuth, "leave.manage") ||
      rbacService.hasPermission(callerAuth, "leave.view");

    // Normal users strictly see their own requests.
    // Management users can filter by user_id or view all workforce requests.
    const scopedUserId = hasManagementAccess ? null : callerAuth.userId;

    const page = Math.max(1, Math.floor(pagination.page || 1));
    const limit = Math.max(1, Math.min(100, Math.floor(pagination.limit || 20)));

    const { requests, total } = await leaveRepository.listLeaveRequests(filter, { page, limit }, scopedUserId);
    const formatted = requests.map((r) => this.formatLeaveRequest(r));
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      requests: formatted,
      pagination: { page, limit, total, totalPages },
    };
  }

  /**
   * Retrieves a single leave request by ID after validating authorization.
   */
  async getLeaveRequestById(id: string, callerAuth: UserRoleInfo): Promise<SafeLeaveRequestDto> {
    if (!isValidUuid(id)) {
      throw new AppError("Invalid leave request ID format. Expected UUID.", 400, "INVALID_UUID");
    }

    const leave = await leaveRepository.findById(id);
    if (!leave) {
      throw new AppError("Leave request not found", 404, "LEAVE_NOT_FOUND");
    }

    const hasManagementAccess =
      callerAuth.isSuperAdmin ||
      callerAuth.isAdmin ||
      rbacService.hasPermission(callerAuth, "leave.manage") ||
      rbacService.hasPermission(callerAuth, "leave.view");

    if (leave.user_id !== callerAuth.userId && !hasManagementAccess) {
      throw new AppError("Forbidden: You are not authorized to view this leave request.", 403, "FORBIDDEN");
    }

    return this.formatLeaveRequest(leave);
  }

  /**
   * Creates a new leave request. Requester is strictly bound to callerAuth.userId.
   */
  async createLeaveRequest(
    payload: {
      type: "Leave" | "Permission" | "Work From Home";
      start_date: string;
      end_date: string;
      reason: string;
    },
    callerAuth: UserRoleInfo
  ): Promise<SafeLeaveRequestDto> {
    // 1. Validation
    if (!payload.type || !VALID_LEAVE_TYPES.has(payload.type)) {
      throw new AppError(
        `Invalid leave type '${payload.type}'. Expected: 'Leave', 'Permission', or 'Work From Home'.`,
        400,
        "INVALID_LEAVE_TYPE"
      );
    }

    if (!payload.start_date || !isValidDateString(payload.start_date)) {
      throw new AppError("Invalid start_date. Expected format: YYYY-MM-DD.", 400, "INVALID_DATE");
    }
    if (!payload.end_date || !isValidDateString(payload.end_date)) {
      throw new AppError("Invalid end_date. Expected format: YYYY-MM-DD.", 400, "INVALID_DATE");
    }

    const startDateClean = payload.start_date.trim();
    const endDateClean = payload.end_date.trim();

    if (startDateClean > endDateClean) {
      throw new AppError(
        "Invalid date range: start_date cannot be after end_date.",
        400,
        "INVALID_DATE_RANGE"
      );
    }

    if (!payload.reason || typeof payload.reason !== "string" || !payload.reason.trim()) {
      throw new AppError("Leave reason is required.", 400, "INVALID_REASON");
    }

    // 2. Create in DB (always binding user_id to JWT authenticated caller)
    const created = await leaveRepository.createLeaveRequest({
      user_id: callerAuth.userId,
      type: payload.type,
      start_date: startDateClean,
      end_date: endDateClean,
      reason: payload.reason.trim(),
      status: "Pending",
    });

    // 3. Audit Log
    await auditRepository.log({
      actor_id: callerAuth.userId,
      action: "INSERT",
      table_name: "leave_requests",
      record_id: created.id,
      new_value: {
        user_id: created.user_id,
        type: created.type,
        start_date: created.start_date,
        end_date: created.end_date,
        reason: created.reason,
        status: created.status,
      },
    });

    return this.formatLeaveRequest(created);
  }

  /**
   * Updates an existing leave request (Requester modification/cancellation or Management approval/rejection).
   */
  async updateLeaveRequest(
    id: string,
    payload: Record<string, any>,
    callerAuth: UserRoleInfo
  ): Promise<SafeLeaveRequestDto> {
    if (!isValidUuid(id)) {
      throw new AppError("Invalid leave request ID format. Expected UUID.", 400, "INVALID_UUID");
    }

    const leave = await leaveRepository.findById(id);
    if (!leave) {
      throw new AppError("Leave request not found", 404, "LEAVE_NOT_FOUND");
    }

    const isRequester = leave.user_id === callerAuth.userId;
    const hasManagementReview =
      callerAuth.isSuperAdmin ||
      callerAuth.isAdmin ||
      rbacService.hasPermission(callerAuth, "leave.manage");

    if (!isRequester && !hasManagementReview) {
      throw new AppError("Forbidden: You are not authorized to modify this leave request.", 403, "FORBIDDEN");
    }

    const fieldsToUpdate: Record<string, any> = {};

    // --------------------------------------------------------------------------
    // CASE A: Management Approval / Rejection Review Flow
    // --------------------------------------------------------------------------
    if (payload.status === "Approved" || payload.status === "Rejected") {
      // Self-approval protection
      const reviewCheck = authorizationService.canReviewLeaveRequest(callerAuth, leave.user_id);
      if (!reviewCheck.allowed) {
        throw new AppError(reviewCheck.reason || "Forbidden: You cannot review this leave request.", 403, "SELF_APPROVAL_BLOCKED");
      }

      if (leave.status !== "Pending") {
        throw new AppError(
          `Cannot review leave request with status '${leave.status}'. Only Pending requests can be reviewed.`,
          400,
          "INVALID_STATE_TRANSITION"
        );
      }

      if (payload.status === "Approved") {
        fieldsToUpdate.status = "Approved";
        fieldsToUpdate.reviewed_by = callerAuth.userId;
        fieldsToUpdate.reviewed_at = new Date();
        fieldsToUpdate.rejection_reason = null;
      } else if (payload.status === "Rejected") {
        fieldsToUpdate.status = "Rejected";
        fieldsToUpdate.reviewed_by = callerAuth.userId;
        fieldsToUpdate.reviewed_at = new Date();
        fieldsToUpdate.rejection_reason = payload.rejection_reason ? String(payload.rejection_reason).trim() : null;
      }
    }
    // --------------------------------------------------------------------------
    // CASE B: Requester Cancellation / Modification Flow
    // --------------------------------------------------------------------------
    else if (isRequester) {
      if (leave.status !== "Pending") {
        throw new AppError(
          `Cannot modify leave request with status '${leave.status}'. Only Pending requests can be modified or cancelled.`,
          400,
          "LEAVE_NOT_PENDING"
        );
      }

      if (payload.status === "Cancelled") {
        fieldsToUpdate.status = "Cancelled";
      } else if (payload.status !== undefined && payload.status !== "Pending") {
        throw new AppError("Requesters can only cancel their pending leave requests.", 403, "FORBIDDEN_TRANSITION");
      }

      if (payload.type !== undefined) {
        if (!VALID_LEAVE_TYPES.has(payload.type)) {
          throw new AppError(`Invalid leave type '${payload.type}'.`, 400, "INVALID_LEAVE_TYPE");
        }
        fieldsToUpdate.type = payload.type;
      }

      if (payload.reason !== undefined) {
        if (typeof payload.reason !== "string" || !payload.reason.trim()) {
          throw new AppError("Leave reason cannot be empty.", 400, "INVALID_REASON");
        }
        fieldsToUpdate.reason = payload.reason.trim();
      }

      const effectiveStart = payload.start_date ? String(payload.start_date).trim() : leave.start_date;
      const effectiveEnd = payload.end_date ? String(payload.end_date).trim() : leave.end_date;

      if (payload.start_date !== undefined) {
        if (!isValidDateString(payload.start_date)) {
          throw new AppError("Invalid start_date format. Expected YYYY-MM-DD.", 400, "INVALID_DATE");
        }
        fieldsToUpdate.start_date = effectiveStart;
      }

      if (payload.end_date !== undefined) {
        if (!isValidDateString(payload.end_date)) {
          throw new AppError("Invalid end_date format. Expected YYYY-MM-DD.", 400, "INVALID_DATE");
        }
        fieldsToUpdate.end_date = effectiveEnd;
      }

      if (effectiveStart > effectiveEnd) {
        throw new AppError("Invalid date range: start_date cannot be after end_date.", 400, "INVALID_DATE_RANGE");
      }
    }
    // --------------------------------------------------------------------------
    // CASE C: Management General Update (e.g. updating notes or cancelling)
    // --------------------------------------------------------------------------
    else if (hasManagementReview) {
      if (payload.status === "Cancelled") {
        fieldsToUpdate.status = "Cancelled";
      } else if (payload.status !== undefined && !VALID_LEAVE_STATUSES.has(payload.status)) {
        throw new AppError(`Invalid status '${payload.status}'.`, 400, "INVALID_STATUS");
      }

      if (payload.rejection_reason !== undefined) {
        fieldsToUpdate.rejection_reason = payload.rejection_reason;
      }
    }

    if (Object.keys(fieldsToUpdate).length === 0) {
      return this.formatLeaveRequest(leave);
    }

    const updated = await leaveRepository.updateLeaveRequest(id, fieldsToUpdate);
    if (!updated) {
      throw new AppError("Failed to update leave request", 500, "UPDATE_FAILED");
    }

    // Audit Log
    await auditRepository.log({
      actor_id: callerAuth.userId,
      action: fieldsToUpdate.status ? `STATUS_${fieldsToUpdate.status.toUpperCase()}` : "UPDATE",
      table_name: "leave_requests",
      record_id: id,
      old_value: {
        status: leave.status,
        type: leave.type,
        start_date: leave.start_date,
        end_date: leave.end_date,
      },
      new_value: fieldsToUpdate,
    });

    return this.formatLeaveRequest(updated);
  }
}

export const leaveService = new LeaveService();
