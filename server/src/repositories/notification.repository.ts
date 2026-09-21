import { query, queryOne, execute } from "../utils/database.util.js";
import crypto from "crypto";

export interface NotificationRecord {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  reference_id: string | null;
  reference_type: string | null;
  is_read: number | boolean;
  created_at: Date | string;
}

export interface NotificationListFilter {
  type?: string;
  is_read?: boolean;
}

export interface NotificationPaginationOptions {
  page: number;
  limit: number;
}

export class NotificationRepository {
  /**
   * Finds a notification by ID.
   */
  async findById(id: string): Promise<NotificationRecord | null> {
    const sql = `
      SELECT 
        id,
        user_id,
        type,
        title,
        message,
        reference_id,
        reference_type,
        is_read,
        created_at
      FROM notifications
      WHERE id = ?
      LIMIT 1
    `;
    return queryOne<NotificationRecord>(sql, [id]);
  }

  /**
   * Lists notifications for a specific user with pagination and optional filters.
   */
  async listNotifications(
    userId: string,
    filter: NotificationListFilter,
    pagination: NotificationPaginationOptions
  ): Promise<{ notifications: NotificationRecord[]; total: number }> {
    const conditions: string[] = ["user_id = ?"];
    const params: (string | number)[] = [userId];

    if (filter.type) {
      conditions.push("type = ?");
      params.push(filter.type);
    }
    if (filter.is_read !== undefined) {
      conditions.push("is_read = ?");
      params.push(filter.is_read ? 1 : 0);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const countSql = `SELECT COUNT(*) AS total FROM notifications ${whereClause}`;
    const countRow = await queryOne<{ total: number }>(countSql, params);
    const total = countRow ? Number(countRow.total) : 0;

    const page = Math.max(1, pagination.page);
    const limit = Math.max(1, Math.min(100, pagination.limit));
    const offset = (page - 1) * limit;

    const dataSql = `
      SELECT 
        id,
        user_id,
        type,
        title,
        message,
        reference_id,
        reference_type,
        is_read,
        created_at
      FROM notifications
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...params, limit, offset];
    const notifications = await query<NotificationRecord>(dataSql, dataParams);

    return { notifications, total };
  }

  /**
   * Gets the unread notification count for a user.
   */
  async getUnreadCount(userId: string): Promise<number> {
    const sql = `SELECT COUNT(*) AS unread_count FROM notifications WHERE user_id = ? AND is_read = 0`;
    const row = await queryOne<{ unread_count: number }>(sql, [userId]);
    return row ? Number(row.unread_count) : 0;
  }

  /**
   * Marks a specific notification as read for its owner.
   */
  async markAsRead(id: string, userId: string): Promise<boolean> {
    const sql = `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`;
    const result = await execute(sql, [id, userId]);
    return result.affectedRows > 0;
  }

  /**
   * Marks all unread notifications as read for a user.
   */
  async markAllAsRead(userId: string): Promise<number> {
    const sql = `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`;
    const result = await execute(sql, [userId]);
    return result.affectedRows;
  }

  /**
   * Creates a new notification record.
   */
  async createNotification(data: {
    id?: string;
    user_id: string;
    type: string;
    title: string;
    message: string;
    reference_id?: string | null;
    reference_type?: string | null;
  }): Promise<NotificationRecord> {
    const id = data.id || crypto.randomUUID();
    const sql = `
      INSERT INTO notifications (
        id, user_id, type, title, message, reference_id, reference_type, is_read, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP(6))
    `;
    await execute(sql, [
      id,
      data.user_id,
      data.type,
      data.title,
      data.message,
      data.reference_id || null,
      data.reference_type || null,
    ]);

    const created = await this.findById(id);
    if (!created) {
      throw new Error("Failed to retrieve created notification");
    }
    return created;
  }
}

export const notificationRepository = new NotificationRepository();
