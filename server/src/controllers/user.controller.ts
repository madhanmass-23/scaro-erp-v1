import { Request, Response, NextFunction } from "express";
import { userService } from "../services/user.service.js";
import { rbacService, UserRoleInfo } from "../services/rbac.service.js";
import { sendSuccess, sendPaginatedSuccess } from "../utils/apiResponse.js";
import { AppError } from "../types/api.types.js";
import { UserListFilter } from "../repositories/user.repository.js";

export class UserController {
  /**
   * Helper to ensure req.auth is resolved from the database for the authenticated user.
   */
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
   * GET /api/v1/users/me
   */
  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.id) {
        throw new AppError("Authentication required", 401, "UNAUTHENTICATED");
      }

      const profile = await userService.getCurrentUserProfile(req.user.id);
      sendSuccess(res, profile);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/users
   */
  async getUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);

      const filter: UserListFilter = {};
      if (typeof req.query.role === "string" && req.query.role.trim()) {
        filter.role = req.query.role.trim();
      }
      if (typeof req.query.department_id === "string" && req.query.department_id.trim()) {
        filter.department_id = req.query.department_id.trim();
      }
      if (typeof req.query.employment_status === "string" && req.query.employment_status.trim()) {
        filter.employment_status = req.query.employment_status.trim();
      }
      if (req.query.is_active !== undefined) {
        filter.is_active = req.query.is_active === "true" || req.query.is_active === "1";
      }
      if (typeof req.query.search === "string" && req.query.search.trim()) {
        filter.search = req.query.search.trim();
      }

      const page = parseInt(String(req.query.page || "1"), 10) || 1;
      const limit = parseInt(String(req.query.limit || "20"), 10) || 20;

      const result = await userService.listUsers(filter, { page, limit }, auth);
      sendPaginatedSuccess(res, result.users, result.pagination);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/users/:id
   */
  async getUserById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const targetUserId = String(req.params.id);

      const profile = await userService.getUserById(targetUserId, auth);
      sendSuccess(res, profile);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/users/me
   */
  async updateMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.id) {
        throw new AppError("Authentication required", 401, "UNAUTHENTICATED");
      }

      const updated = await userService.updateOwnProfile(req.user.id, req.body);
      sendSuccess(res, updated);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/users/:id
   */
  async updateUserById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const targetUserId = String(req.params.id);

      const updated = await userService.updateUserById(targetUserId, req.body, auth);
      sendSuccess(res, updated);
    } catch (err) {
      next(err);
    }
  }
}

export const userController = new UserController();
