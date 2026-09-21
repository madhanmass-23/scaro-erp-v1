import {
  notificationRepository,
  NotificationRecord,
  NotificationListFilter,
  NotificationPaginationOptions,
} from "../repositories/notification.repository.js";
import { UserRoleInfo } from "./rbac.service.js";
import { AppError } from "../types/api.types.js";
import { isValidUuid } from "../utils/validation.util.js";

export interface SafeNotificationDto {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  reference_id: string | null;
  reference_type: string | null;
  is_read: boolean;
  created_at: string;
}

export class NotificationService {
  private formatNotification(raw: NotificationRecord): SafeNotificationDto {
    return {
      id: raw.id,
      user_id: raw.user_id,
      type: raw.type,
      title: raw.title,
      message: raw.message,
      reference_id: raw.reference_id || null,
      reference_type: raw.reference_type || null,
      is_read: raw.is_read === 1 || raw.is_read === true,
      created_at:
        typeof raw.created_at === "object" && raw.created_at !== null && "toISOString" in raw.created_at
          ? (raw.created_at as Date).toISOString()
          : String(raw.created_at),
    };
  }

  /**
   * Lists notifications for the authenticated user with optional filtering and pagination.
   */
  async listNotifications(
    filter: NotificationListFilter,
    pagination: NotificationPaginationOptions,
    callerAuth: UserRoleInfo
  ): Promise<{ notifications: SafeNotificationDto[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const page = Math.max(1, Math.floor(pagination.page || 1));
    const limit = Math.max(1, Math.min(100, Math.floor(pagination.limit || 20)));

    const { notifications, total } = await notificationRepository.listNotifications(
      callerAuth.userId,
      filter,
      { page, limit }
    );

    const formatted = notifications.map((n) => this.formatNotification(n));
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      notifications: formatted,
      pagination: { page, limit, total, totalPages },
    };
  }

  /**
   * Gets the unread notification count for the authenticated user.
   */
  async getUnreadCount(callerAuth: UserRoleInfo): Promise<{ unread_count: number }> {
    const count = await notificationRepository.getUnreadCount(callerAuth.userId);
    return { unread_count: count };
  }

  /**
   * Retrieves a single notification by ID, ensuring user ownership.
   */
  async getNotificationById(id: string, callerAuth: UserRoleInfo): Promise<SafeNotificationDto> {
    if (!isValidUuid(id)) {
      throw new AppError("Invalid notification ID format. Expected UUID.", 400, "INVALID_UUID");
    }

    const notification = await notificationRepository.findById(id);
    if (!notification) {
      throw new AppError("Notification not found", 404, "NOTIFICATION_NOT_FOUND");
    }

    if (notification.user_id !== callerAuth.userId) {
      throw new AppError("Forbidden: You are not authorized to view this notification.", 403, "FORBIDDEN");
    }

    return this.formatNotification(notification);
  }

  /**
   * Marks a specific notification as read.
   */
  async markAsRead(id: string, callerAuth: UserRoleInfo): Promise<SafeNotificationDto> {
    if (!isValidUuid(id)) {
      throw new AppError("Invalid notification ID format. Expected UUID.", 400, "INVALID_UUID");
    }

    const notification = await notificationRepository.findById(id);
    if (!notification) {
      throw new AppError("Notification not found", 404, "NOTIFICATION_NOT_FOUND");
    }

    if (notification.user_id !== callerAuth.userId) {
      throw new AppError("Forbidden: You are not authorized to update this notification.", 403, "FORBIDDEN");
    }

    await notificationRepository.markAsRead(id, callerAuth.userId);
    const updated = await notificationRepository.findById(id);
    return this.formatNotification(updated || notification);
  }

  /**
   * Marks all unread notifications as read for the authenticated user.
   */
  async markAllAsRead(callerAuth: UserRoleInfo): Promise<{ updated_count: number }> {
    const updatedCount = await notificationRepository.markAllAsRead(callerAuth.userId);
    return { updated_count: updatedCount };
  }
}

export const notificationService = new NotificationService();
