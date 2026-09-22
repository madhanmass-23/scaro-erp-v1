/**
 * Notifications API Service for SCARO ERP Frontend.
 * 
 * Interacts with Node.js/Express `/api/v1/notifications` endpoints backed by MariaDB.
 */

import { api } from '../../lib/api';

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

export interface NotificationListFilter {
  type?: string;
  is_read?: boolean;
  page?: number;
  limit?: number;
}

export const notificationApi = {
  /**
   * Lists notifications for the authenticated user.
   * Calls GET /api/v1/notifications
   */
  async getNotifications(filter?: NotificationListFilter): Promise<SafeNotificationDto[]> {
    const params: Record<string, string | number | boolean | undefined | null> = {};
    if (filter) {
      if (filter.type) params.type = filter.type;
      if (filter.is_read !== undefined) params.is_read = filter.is_read;
      if (filter.page) params.page = filter.page;
      if (filter.limit) params.limit = filter.limit;
    }

    const data = await api.get<SafeNotificationDto[] | { notifications: SafeNotificationDto[] }>('/notifications', { params });
    if (Array.isArray(data)) {
      return data;
    }
    if (data && typeof data === 'object' && 'notifications' in data && Array.isArray((data as { notifications: SafeNotificationDto[] }).notifications)) {
      return (data as { notifications: SafeNotificationDto[] }).notifications;
    }
    return [];
  },

  /**
   * Gets unread notification count for authenticated user.
   * Calls GET /api/v1/notifications/unread-count
   */
  async getUnreadCount(): Promise<number> {
    const data = await api.get<{ unread_count: number }>('/notifications/unread-count');
    return data?.unread_count ?? 0;
  },

  /**
   * Retrieves single notification by ID.
   * Calls GET /api/v1/notifications/:id
   */
  async getNotificationById(id: string): Promise<SafeNotificationDto> {
    return api.get<SafeNotificationDto>(`/notifications/${id}`);
  },

  /**
   * Marks a specific notification as read.
   * Calls PATCH /api/v1/notifications/:id/read
   */
  async markAsRead(id: string): Promise<SafeNotificationDto> {
    return api.patch<SafeNotificationDto>(`/notifications/${id}/read`);
  },

  /**
   * Marks all notifications as read for the authenticated user.
   * Calls PATCH /api/v1/notifications/read-all
   */
  async markAllAsRead(): Promise<{ updated_count: number }> {
    return api.patch<{ updated_count: number }>('/notifications/read-all');
  },

  /**
   * Gets notification preferences for the authenticated user.
   * Calls GET /api/v1/notifications/preferences
   */
  async getUserPreferences(): Promise<UserNotificationPreferences> {
    return api.get<UserNotificationPreferences>('/notifications/preferences');
  },

  /**
   * Updates notification preferences for the authenticated user.
   * Calls PUT /api/v1/notifications/preferences
   */
  async updateUserPreferences(prefs: Partial<UserNotificationPreferences>): Promise<UserNotificationPreferences> {
    return api.put<UserNotificationPreferences>('/notifications/preferences', prefs);
  },

  /**
   * Triggers upcoming meeting reminder check.
   * Calls POST /api/v1/notifications/reminders/check
   */
  async triggerMeetingRemindersCheck(windowMinutes = 6): Promise<{ dispatchedCount: number }> {
    return api.post<{ dispatchedCount: number }>('/notifications/reminders/check', { windowMinutes });
  },

  /**
   * Registers a Web Push subscription.
   * Calls POST /api/v1/notifications/push-subscribe
   */
  async subscribePush(subscription: any): Promise<{ success: boolean }> {
    return api.post<{ success: boolean }>('/notifications/push-subscribe', { subscription });
  },

  /**
   * Removes a Web Push subscription.
   * Calls POST /api/v1/notifications/push-unsubscribe
   */
  async unsubscribePush(endpoint: string): Promise<{ success: boolean }> {
    return api.post<{ success: boolean }>('/notifications/push-unsubscribe', { endpoint });
  },
};

export interface UserNotificationPreferences {
  user_id: string;
  meetings_enabled: boolean;
  tasks_enabled: boolean;
  leave_enabled: boolean;
  messages_enabled: boolean;
  announcements_enabled: boolean;
  daily_reports_enabled: boolean;
  browser_enabled: boolean;
  in_app_enabled: boolean;
  updated_at?: string;
}

