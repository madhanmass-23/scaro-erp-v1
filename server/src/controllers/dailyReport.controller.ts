import { Request, Response, NextFunction } from "express";
import { dailyReportService } from "../services/dailyReport.service.js";
import { rbacService, UserRoleInfo } from "../services/rbac.service.js";
import { sendSuccess, sendPaginatedSuccess } from "../utils/apiResponse.js";
import { AppError } from "../types/api.types.js";
import { DailyReportListFilter } from "../repositories/dailyReport.repository.js";

export class DailyReportController {
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
   * GET /api/v1/daily-reports/today
   */
  async getTodayReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const report = await dailyReportService.getTodayReport(auth.userId);
      sendSuccess(res, report);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/daily-reports
   */
  async listReports(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);

      const filter: DailyReportListFilter = {};
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
      if (typeof req.query.status === "string" && req.query.status.trim()) {
        filter.status = req.query.status.trim();
      }

      const page = parseInt(String(req.query.page || "1"), 10) || 1;
      const limit = parseInt(String(req.query.limit || "20"), 10) || 20;

      const result = await dailyReportService.listReports(filter, { page, limit }, auth);
      sendPaginatedSuccess(res, result.reports, result.pagination);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/daily-reports/:id
   */
  async getReportById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id);
      const report = await dailyReportService.getReportById(id, auth);
      sendSuccess(res, report);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/daily-reports
   */
  async createReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const created = await dailyReportService.createReport(req.body, auth);
      sendSuccess(res, created, 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/daily-reports/:id
   */
  async updateReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id);
      const updated = await dailyReportService.updateReport(id, req.body, auth);
      sendSuccess(res, updated);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/daily-reports/:id/tasks
   */
  async getReportTasks(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id);
      const tasks = await dailyReportService.getReportTasks(id, auth);
      sendSuccess(res, tasks);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/daily-reports/:id/tasks
   */
  async addReportTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id);
      const item = await dailyReportService.addReportTask(id, req.body, auth);
      sendSuccess(res, item, 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/daily-reports/:id/tasks/:taskId
   */
  async updateReportTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id);
      const taskId = String(req.params.taskId);
      const item = await dailyReportService.updateReportTask(id, taskId, req.body, auth);
      sendSuccess(res, item);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/daily-reports/:id/attachments
   */
  async getAttachments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id);
      const attachments = await dailyReportService.getAttachments(id, auth);
      sendSuccess(res, attachments);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/daily-reports/:id/attachments
   */
  async addAttachment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id);
      const attachment = await dailyReportService.addAttachment(id, req.body, auth);
      sendSuccess(res, attachment, 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/v1/daily-reports/:id/attachments/:attachmentId
   */
  async deleteAttachment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id);
      const attachmentId = String(req.params.attachmentId);
      await dailyReportService.deleteAttachment(id, attachmentId, auth);
      sendSuccess(res, { message: "Daily report attachment deleted successfully" });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/daily-reports/:id/sync
   */
  async getSyncStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id);
      const sync = await dailyReportService.getSyncStatus(id, auth);
      sendSuccess(res, sync);
    } catch (err) {
      next(err);
    }
  }
}

export const dailyReportController = new DailyReportController();

