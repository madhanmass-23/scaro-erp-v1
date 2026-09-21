import { Request, Response, NextFunction } from "express";
import { companySettingsService } from "../services/companySettings.service.js";
import { rbacService, UserRoleInfo } from "../services/rbac.service.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { AppError } from "../types/api.types.js";

export class CompanySettingsController {
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
   * GET /api/v1/company-settings
   */
  getSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await this.getAuthContext(req);
      const settings = await companySettingsService.getSettings(auth);
      sendSuccess(res, settings);
    } catch (err) {
      next(err);
    }
  };

  /**
   * PATCH /api/v1/company-settings
   */
  updateSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await this.getAuthContext(req);
      const settings = await companySettingsService.updateSettings(req.body, auth);
      sendSuccess(res, settings);
    } catch (err) {
      next(err);
    }
  };
}

export const companySettingsController = new CompanySettingsController();
