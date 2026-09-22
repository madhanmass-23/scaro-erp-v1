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

  /**
   * Creates notifications for multiple recipients in bulk.
   */
  async createBulkNotifications(
    notifications: Array<{
      id?: string;
      user_id: string;
      type: string;
      title: string;
      message: string;
      reference_id?: string | null;
      reference_type?: string | null;
    }>
  ): Promise<void> {
    if (!notifications || notifications.length === 0) return;
    for (const n of notifications) {
      try {
        await this.createNotification(n);
      } catch (err) {
        console.warn("[NOTIFICATION] Failed to deliver bulk notification:", err);
      }
    }
  }

  /**
   * Ensures user_notification_settings and push_subscriptions tables exist.
   */
  async ensureTables(): Promise<void> {
    try {
      await execute(`
        CREATE TABLE IF NOT EXISTS \`user_notification_settings\` (
          \`user_id\` CHAR(36) NOT NULL,
          \`meetings_enabled\` TINYINT(1) NOT NULL DEFAULT 1,
          \`tasks_enabled\` TINYINT(1) NOT NULL DEFAULT 1,
          \`leave_enabled\` TINYINT(1) NOT NULL DEFAULT 1,
          \`messages_enabled\` TINYINT(1) NOT NULL DEFAULT 1,
          \`announcements_enabled\` TINYINT(1) NOT NULL DEFAULT 1,
          \`daily_reports_enabled\` TINYINT(1) NOT NULL DEFAULT 1,
          \`browser_enabled\` TINYINT(1) NOT NULL DEFAULT 1,
          \`in_app_enabled\` TINYINT(1) NOT NULL DEFAULT 1,
          \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`user_id\`),
          CONSTRAINT \`fk_user_notification_settings_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`profiles\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await execute(`
        CREATE TABLE IF NOT EXISTS \`push_subscriptions\` (
          \`id\` CHAR(36) NOT NULL,
          \`user_id\` CHAR(36) NOT NULL,
          \`endpoint\` TEXT NOT NULL,
          \`p256dh\` VARCHAR(255) NOT NULL,
          \`auth\` VARCHAR(255) NOT NULL,
          \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          INDEX \`idx_push_subscriptions_user_id\` (\`user_id\`),
          CONSTRAINT \`fk_push_subscriptions_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`profiles\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    } catch (err) {
      // Table may already exist or DB init already ran
      console.warn("[NOTIFICATION] ensureTables notice:", err);
    }
  }

  /**
   * Retrieves user notification preferences with fallback to default values.
   */
  async getUserPreferences(userId: string): Promise<UserNotificationSettingsRecord> {
    await this.ensureTables();
    const sql = `
      SELECT 
        user_id,
        meetings_enabled,
        tasks_enabled,
        leave_enabled,
        messages_enabled,
        announcements_enabled,
        daily_reports_enabled,
        browser_enabled,
        in_app_enabled,
        updated_at
      FROM user_notification_settings
      WHERE user_id = ?
      LIMIT 1
    `;
    const row = await queryOne<UserNotificationSettingsRecord>(sql, [userId]);
    if (row) {
      return {
        user_id: row.user_id,
        meetings_enabled: row.meetings_enabled === 1 || row.meetings_enabled === true,
        tasks_enabled: row.tasks_enabled === 1 || row.tasks_enabled === true,
        leave_enabled: row.leave_enabled === 1 || row.leave_enabled === true,
        messages_enabled: row.messages_enabled === 1 || row.messages_enabled === true,
        announcements_enabled: row.announcements_enabled === 1 || row.announcements_enabled === true,
        daily_reports_enabled: row.daily_reports_enabled === 1 || row.daily_reports_enabled === true,
        browser_enabled: row.browser_enabled === 1 || row.browser_enabled === true,
        in_app_enabled: row.in_app_enabled === 1 || row.in_app_enabled === true,
        updated_at: row.updated_at,
      };
    }

    // Default: all enabled
    return {
      user_id: userId,
      meetings_enabled: true,
      tasks_enabled: true,
      leave_enabled: true,
      messages_enabled: true,
      announcements_enabled: true,
      daily_reports_enabled: true,
      browser_enabled: true,
      in_app_enabled: true,
    };
  }

  /**
   * Updates user notification preferences.
   */
  async updateUserPreferences(
    userId: string,
    prefs: Partial<UserNotificationSettingsRecord>
  ): Promise<UserNotificationSettingsRecord> {
    await this.ensureTables();
    const current = await this.getUserPreferences(userId);
    const updated: UserNotificationSettingsRecord = {
      user_id: userId,
      meetings_enabled: prefs.meetings_enabled !== undefined ? (prefs.meetings_enabled ? 1 : 0) : (current.meetings_enabled ? 1 : 0),
      tasks_enabled: prefs.tasks_enabled !== undefined ? (prefs.tasks_enabled ? 1 : 0) : (current.tasks_enabled ? 1 : 0),
      leave_enabled: prefs.leave_enabled !== undefined ? (prefs.leave_enabled ? 1 : 0) : (current.leave_enabled ? 1 : 0),
      messages_enabled: prefs.messages_enabled !== undefined ? (prefs.messages_enabled ? 1 : 0) : (current.messages_enabled ? 1 : 0),
      announcements_enabled: prefs.announcements_enabled !== undefined ? (prefs.announcements_enabled ? 1 : 0) : (current.announcements_enabled ? 1 : 0),
      daily_reports_enabled: prefs.daily_reports_enabled !== undefined ? (prefs.daily_reports_enabled ? 1 : 0) : (current.daily_reports_enabled ? 1 : 0),
      browser_enabled: prefs.browser_enabled !== undefined ? (prefs.browser_enabled ? 1 : 0) : (current.browser_enabled ? 1 : 0),
      in_app_enabled: prefs.in_app_enabled !== undefined ? (prefs.in_app_enabled ? 1 : 0) : (current.in_app_enabled ? 1 : 0),
    };

    const sql = `
      INSERT INTO user_notification_settings (
        user_id, meetings_enabled, tasks_enabled, leave_enabled, messages_enabled,
        announcements_enabled, daily_reports_enabled, browser_enabled, in_app_enabled, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6))
      ON DUPLICATE KEY UPDATE
        meetings_enabled = VALUES(meetings_enabled),
        tasks_enabled = VALUES(tasks_enabled),
        leave_enabled = VALUES(leave_enabled),
        messages_enabled = VALUES(messages_enabled),
        announcements_enabled = VALUES(announcements_enabled),
        daily_reports_enabled = VALUES(daily_reports_enabled),
        browser_enabled = VALUES(browser_enabled),
        in_app_enabled = VALUES(in_app_enabled),
        updated_at = CURRENT_TIMESTAMP(6)
    `;

    await execute(sql, [
      updated.user_id,
      updated.meetings_enabled,
      updated.tasks_enabled,
      updated.leave_enabled,
      updated.messages_enabled,
      updated.announcements_enabled,
      updated.daily_reports_enabled,
      updated.browser_enabled,
      updated.in_app_enabled,
    ]);

    return this.getUserPreferences(userId);
  }

  /**
   * Checks whether a specific meeting reminder notification was already sent to a user.
   */
  async findDuplicateMeetingReminder(userId: string, meetingId: string): Promise<boolean> {
    const sql = `
      SELECT id FROM notifications 
      WHERE user_id = ? AND reference_id = ? AND type = 'meeting_reminder'
      LIMIT 1
    `;
    const row = await queryOne<{ id: string }>(sql, [userId, meetingId]);
    return row !== null;
  }

  /**
   * Retrieves upcoming meetings starting within the next windowMinutes.
   */
  async getUpcomingActiveMeetings(windowMinutes = 6): Promise<Array<{
    id: string;
    title: string;
    meeting_date: string;
    start_time: string;
    end_time: string;
    organizer_id: string;
    status: string;
  }>> {
    const sql = `
      SELECT 
        id,
        title,
        DATE_FORMAT(meeting_date, '%Y-%m-%d') AS meeting_date,
        start_time,
        end_time,
        organizer_id,
        status
      FROM meetings
      WHERE status != 'Cancelled'
        AND meeting_date = CURRENT_DATE()
        AND TIMEDIFF(start_time, CURRENT_TIME()) BETWEEN '00:00:00' AND SEC_TO_TIME(? * 60)
    `;
    return query(sql, [windowMinutes]);
  }

  /**
   * Retrieves participant user IDs for a meeting (including organizer).
   */
  async getMeetingParticipantUserIds(meetingId: string): Promise<string[]> {
    const meeting = await queryOne<{ organizer_id: string }>(
      `SELECT organizer_id FROM meetings WHERE id = ? LIMIT 1`,
      [meetingId]
    );
    const participants = await query<{ participant_id: string }>(
      `SELECT participant_id FROM meeting_participants WHERE meeting_id = ?`,
      [meetingId]
    );

    const userIds = new Set<string>();
    if (meeting?.organizer_id) userIds.add(meeting.organizer_id);
    for (const p of participants) {
      if (p.participant_id) userIds.add(p.participant_id);
    }
    return Array.from(userIds);
  }

  /**
   * Saves or updates a Web Push subscription.
   */
  async savePushSubscription(
    userId: string,
    sub: { endpoint: string; keys: { p256dh: string; auth: string } }
  ): Promise<void> {
    await this.ensureTables();
    const id = crypto.randomUUID();
    const sql = `
      INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6))
      ON DUPLICATE KEY UPDATE
        p256dh = VALUES(p256dh),
        auth = VALUES(auth)
    `;
    await execute(sql, [id, userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth]);
  }

  /**
   * Removes a Web Push subscription.
   */
  async removePushSubscription(userId: string, endpoint: string): Promise<boolean> {
    await this.ensureTables();
    const sql = `DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?`;
    const result = await execute(sql, [userId, endpoint]);
    return result.affectedRows > 0;
  }
}

export interface UserNotificationSettingsRecord {
  user_id: string;
  meetings_enabled: number | boolean;
  tasks_enabled: number | boolean;
  leave_enabled: number | boolean;
  messages_enabled: number | boolean;
  announcements_enabled: number | boolean;
  daily_reports_enabled: number | boolean;
  browser_enabled: number | boolean;
  in_app_enabled: number | boolean;
  updated_at?: Date | string;
}

export const notificationRepository = new NotificationRepository();
