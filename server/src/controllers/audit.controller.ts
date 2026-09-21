import { Request, Response, NextFunction } from "express";
import { auditService } from "../services/audit.service.js";
import { rbacService, UserRoleInfo } from "../services/rbac.service.js";
import { sendSuccess, sendPaginatedSuccess } from "../utils/apiResponse.js";
import { AppError } from "../types/api.types.js";
import { AuditListFilter } from "../repositories/audit.repository.js";

export class AuditController {
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
   * GET /api/v1/audit-logs
   */
  listAuditLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await this.getAuthContext(req);

      const filter: AuditListFilter = {};
      if (typeof req.query.actor_id === "string" && req.query.actor_id.trim()) {
        filter.actor_id = req.query.actor_id.trim();
      }
      if (typeof req.query.action === "string" && req.query.action.trim()) {
        filter.action = req.query.action.trim();
      }
      if (typeof req.query.table_name === "string" && req.query.table_name.trim()) {
        filter.table_name = req.query.table_name.trim();
      }
      if (typeof req.query.record_id === "string" && req.query.record_id.trim()) {
        filter.record_id = req.query.record_id.trim();
      }
      if (typeof req.query.from === "string" && req.query.from.trim()) {
        filter.from = req.query.from.trim();
      }
      if (typeof req.query.to === "string" && req.query.to.trim()) {
        filter.to = req.query.to.trim();
      }

      const page = parseInt(String(req.query.page || "1"), 10) || 1;
      const limit = parseInt(String(req.query.limit || "20"), 10) || 20;

      const result = await auditService.listAuditLogs(filter, { page, limit }, auth);
      sendPaginatedSuccess(res, result.audit_logs, result.pagination);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/audit-logs/:id
   */
  getAuditLogById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id || "");
      const entry = await auditService.getAuditLogById(id, auth);
      sendSuccess(res, entry);
    } catch (err) {
      next(err);
    }
  };
}

export const auditController = new AuditController();
