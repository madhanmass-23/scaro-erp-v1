import { Request, Response, NextFunction } from "express";
import { notificationService } from "../services/notification.service.js";
import { rbacService, UserRoleInfo } from "../services/rbac.service.js";
import { sendSuccess, sendPaginatedSuccess } from "../utils/apiResponse.js";
import { AppError } from "../types/api.types.js";
import { NotificationListFilter } from "../repositories/notification.repository.js";

export class NotificationController {
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
   * GET /api/v1/notifications
   */
  listNotifications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await this.getAuthContext(req);

      const filter: NotificationListFilter = {};
      if (typeof req.query.type === "string" && req.query.type.trim()) {
        filter.type = req.query.type.trim();
      }
      if (req.query.is_read !== undefined) {
        if (req.query.is_read === "true" || req.query.is_read === "1") {
          filter.is_read = true;
        } else if (req.query.is_read === "false" || req.query.is_read === "0") {
          filter.is_read = false;
        }
      }

      const page = parseInt(String(req.query.page || "1"), 10) || 1;
      const limit = parseInt(String(req.query.limit || "20"), 10) || 20;

      const result = await notificationService.listNotifications(filter, { page, limit }, auth);
      sendPaginatedSuccess(res, result.notifications, result.pagination);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/notifications/unread-count
   */
  getUnreadCount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await this.getAuthContext(req);
      const result = await notificationService.getUnreadCount(auth);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/notifications/:id
   */
  getNotificationById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id || "");
      const notification = await notificationService.getNotificationById(id, auth);
      sendSuccess(res, notification);
    } catch (err) {
      next(err);
    }
  };

  /**
   * PATCH /api/v1/notifications/:id/read
   */
  markAsRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id || "");
      const updated = await notificationService.markAsRead(id, auth);
      sendSuccess(res, updated);
    } catch (err) {
      next(err);
    }
  };

  /**
   * PATCH /api/v1/notifications/read-all
   */
  markAllAsRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await this.getAuthContext(req);
      const result = await notificationService.markAllAsRead(auth);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };
}

export const notificationController = new NotificationController();
