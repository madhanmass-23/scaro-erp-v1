import { Request, Response, NextFunction } from "express";
import { attendanceService } from "../services/attendance.service.js";
import { rbacService, UserRoleInfo } from "../services/rbac.service.js";
import { sendSuccess, sendPaginatedSuccess } from "../utils/apiResponse.js";
import { AppError } from "../types/api.types.js";
import { AttendanceHistoryFilter, ManagementAttendanceFilter } from "../repositories/attendance.repository.js";

export class AttendanceController {
  private async getAuthContext(req: Request): Promise<UserRoleInfo> {
    if (req.auth) {
      return req.auth;
    }
    if (!req.user?.id) {
      throw new AppError("Authentication required", 401, "UNAUTHENTICATED");
    }
    const roleInfo = await rbacService.getUserRoleAndPermissions(req.user.id);
    req.auth = roleInfo;
    return roleInfo;
  }

  /**
   * POST /api/v1/attendance/sign-in
   */
  async signIn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const session = await attendanceService.signIn(auth.userId);
      sendSuccess(res, session, 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/attendance/current
   */
  async getCurrentSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const session = await attendanceService.getCurrentSession(auth.userId);
      sendSuccess(res, session);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/attendance/sign-out
   */
  async signOut(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const session = await attendanceService.signOut(auth.userId, auth);
      sendSuccess(res, session);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/attendance/history
   */
  async getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);

      const filter: AttendanceHistoryFilter = {};
      if (typeof req.query.from === "string" && req.query.from.trim()) {
        filter.from = req.query.from.trim();
      }
      if (typeof req.query.to === "string" && req.query.to.trim()) {
        filter.to = req.query.to.trim();
      }
      if (typeof req.query.status === "string" && req.query.status.trim()) {
        filter.status = req.query.status.trim();
      }

      const page = parseInt(String(req.query.page || "1"), 10) || 1;
      const limit = parseInt(String(req.query.limit || "20"), 10) || 20;

      const result = await attendanceService.getHistory(auth.userId, filter, { page, limit });
      sendPaginatedSuccess(res, result.sessions, result.pagination);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/attendance/management
   */
  async getManagementAttendance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);

      const filter: ManagementAttendanceFilter = {};
      if (typeof req.query.date === "string" && req.query.date.trim()) {
        filter.date = req.query.date.trim();
      }
      if (typeof req.query.from === "string" && req.query.from.trim()) {
        filter.from = req.query.from.trim();
      }
      if (typeof req.query.to === "string" && req.query.to.trim()) {
        filter.to = req.query.to.trim();
      }
      if (typeof req.query.user_id === "string" && req.query.user_id.trim()) {
        filter.user_id = req.query.user_id.trim();
      }
      if (typeof req.query.role === "string" && req.query.role.trim()) {
        filter.role = req.query.role.trim();
      }
      if (typeof req.query.status === "string" && req.query.status.trim()) {
        filter.status = req.query.status.trim();
      }

      const page = parseInt(String(req.query.page || "1"), 10) || 1;
      const limit = parseInt(String(req.query.limit || "20"), 10) || 20;

      const result = await attendanceService.getManagementAttendance(filter, { page, limit }, auth);
      sendPaginatedSuccess(res, result.records, result.pagination);
    } catch (err) {
      next(err);
    }
  }
}

export const attendanceController = new AttendanceController();
