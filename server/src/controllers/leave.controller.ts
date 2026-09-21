import { Request, Response, NextFunction } from "express";
import { leaveService } from "../services/leave.service.js";
import { rbacService, UserRoleInfo } from "../services/rbac.service.js";
import { sendSuccess, sendPaginatedSuccess } from "../utils/apiResponse.js";
import { AppError } from "../types/api.types.js";
import { LeaveListFilter } from "../repositories/leave.repository.js";

export class LeaveController {
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
   * GET /api/v1/leave-requests
   */
  async listLeaveRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);

      const filter: LeaveListFilter = {};
      if (typeof req.query.status === "string" && req.query.status.trim()) {
        filter.status = req.query.status.trim();
      }
      if (typeof req.query.type === "string" && req.query.type.trim()) {
        filter.type = req.query.type.trim();
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

      const page = parseInt(String(req.query.page || "1"), 10) || 1;
      const limit = parseInt(String(req.query.limit || "20"), 10) || 20;

      const result = await leaveService.listLeaveRequests(filter, { page, limit }, auth);
      sendPaginatedSuccess(res, result.requests, result.pagination);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/leave-requests/:id
   */
  async getLeaveRequestById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id);
      const leave = await leaveService.getLeaveRequestById(id, auth);
      sendSuccess(res, leave);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/leave-requests
   */
  async createLeaveRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const leave = await leaveService.createLeaveRequest(req.body, auth);
      sendSuccess(res, leave, 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/leave-requests/:id
   */
  async updateLeaveRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id);
      const leave = await leaveService.updateLeaveRequest(id, req.body, auth);
      sendSuccess(res, leave);
    } catch (err) {
      next(err);
    }
  }
}

export const leaveController = new LeaveController();
