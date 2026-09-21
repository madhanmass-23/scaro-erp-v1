import { Request, Response, NextFunction } from "express";
import { announcementService } from "../services/announcement.service.js";
import { rbacService, UserRoleInfo } from "../services/rbac.service.js";
import { sendSuccess, sendPaginatedSuccess } from "../utils/apiResponse.js";
import { AppError } from "../types/api.types.js";
import { AnnouncementListFilter } from "../repositories/announcement.repository.js";

export class AnnouncementController {
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
   * GET /api/v1/announcements
   */
  listAnnouncements = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await this.getAuthContext(req);

      const filter: AnnouncementListFilter = {};
      if (typeof req.query.audience === "string" && req.query.audience.trim()) {
        filter.audience = req.query.audience.trim();
      }
      if (typeof req.query.priority === "string" && req.query.priority.trim()) {
        filter.priority = req.query.priority.trim();
      }
      if (typeof req.query.department_id === "string" && req.query.department_id.trim()) {
        filter.department_id = req.query.department_id.trim();
      }
      if (typeof req.query.search === "string" && req.query.search.trim()) {
        filter.search = req.query.search.trim();
      }

      const page = parseInt(String(req.query.page || "1"), 10) || 1;
      const limit = parseInt(String(req.query.limit || "20"), 10) || 20;

      const result = await announcementService.listAnnouncements(filter, { page, limit }, auth);
      sendPaginatedSuccess(res, result.announcements, result.pagination);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/announcements/:id
   */
  getAnnouncementById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id || "");
      const announcement = await announcementService.getAnnouncementById(id, auth);
      sendSuccess(res, announcement);
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/announcements
   */
  createAnnouncement = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await this.getAuthContext(req);
      const { title, content, priority, audience, department_id, published_at } = req.body;

      const announcement = await announcementService.createAnnouncement(
        {
          title,
          content,
          priority,
          audience,
          department_id,
          published_at,
        },
        auth
      );

      sendSuccess(res, announcement, 201);
    } catch (err) {
      next(err);
    }
  };

  /**
   * PUT/PATCH /api/v1/announcements/:id
   */
  updateAnnouncement = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id || "");
      const { title, content, priority, audience, department_id, published_at } = req.body;

      const announcement = await announcementService.updateAnnouncement(
        id,
        {
          title,
          content,
          priority,
          audience,
          department_id,
          published_at,
        },
        auth
      );

      sendSuccess(res, announcement);
    } catch (err) {
      next(err);
    }
  };
}

export const announcementController = new AnnouncementController();
