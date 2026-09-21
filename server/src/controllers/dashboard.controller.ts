import { Request, Response, NextFunction } from "express";
import { dashboardService } from "../services/dashboard.service.js";
import { rbacService, UserRoleInfo } from "../services/rbac.service.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { AppError } from "../types/api.types.js";

export class DashboardController {
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
   * GET /api/v1/dashboard/summary
   */
  getDashboardSummary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await this.getAuthContext(req);
      const summary = await dashboardService.getDashboardSummary(auth);
      sendSuccess(res, summary);
    } catch (err) {
      next(err);
    }
  };
}

export const dashboardController = new DashboardController();
