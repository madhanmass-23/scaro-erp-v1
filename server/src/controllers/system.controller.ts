import { Request, Response, NextFunction } from "express";
import { systemService } from "../services/system.service.js";
import { rbacService, UserRoleInfo } from "../services/rbac.service.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { AppError } from "../types/api.types.js";

export class SystemController {
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
   * GET /api/v1/system/info
   */
  getSystemInfo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await this.getAuthContext(req);
      const info = systemService.getSystemInfo(auth);
      sendSuccess(res, info);
    } catch (err) {
      next(err);
    }
  };
}

export const systemController = new SystemController();
