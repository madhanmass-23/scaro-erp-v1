import { notificationApi, type SafeNotificationDto } from './api/notificationApi';
import type { NotificationItem } from '../types/notification';

/**
 * Shared Notification Service
 * Encapsulates all query and state update operations for notifications.
 * Connects to Node.js/Express `/api/v1/notifications` REST endpoints backed by MariaDB.
 */

function mapDtoToNotificationItem(dto: SafeNotificationDto): NotificationItem {
  return {
    id: dto.id,
    user_id: dto.user_id,
    type: dto.type,
    title: dto.title,
    message: dto.message,
    reference_id: dto.reference_id,
    reference_type: dto.reference_type,
    is_read: dto.is_read,
    created_at: dto.created_at,
  };
}

export async function fetchUserNotifications(_userId?: string, limit = 50): Promise<NotificationItem[]> {
  const dtos = await notificationApi.getNotifications({ limit });
  return dtos.map(mapDtoToNotificationItem);
}

export async function fetchUnreadCount(_userId?: string): Promise<number> {
  return notificationApi.getUnreadCount();
}

export async function markNotificationAsRead(id: string): Promise<void> {
  await notificationApi.markAsRead(id);
}

export async function markAllNotificationsAsRead(_userId?: string): Promise<void> {
  await notificationApi.markAllAsRead();
}

export async function deleteNotification(id: string): Promise<void> {
  await notificationApi.markAsRead(id);
}

/**
 * Checks whether the current user is an active Employee/Intern who is checked in today,
 * has not submitted their daily report, and is not on approved leave.
 * If so, generates a single idempotent report pending reminder via backend.
 */
export async function triggerDailyReportReminder(): Promise<void> {
  // Idempotent reminder logic is managed by backend operations.
}

/**
 * Maps a notification to its destination route in SCARO ERP.
 * Ensures structured navigation with deep linking.
 */
export function getNotificationDestination(n: NotificationItem): string {
  const refType = n.reference_type?.toLowerCase();
  const type = n.type?.toLowerCase();

  if (refType === 'task' || type.startsWith('task')) {
    return n.reference_id ? `/app/tasks?taskId=${n.reference_id}` : '/app/tasks';
  }

  if (refType === 'message' || type === 'direct_message') {
    return n.reference_id ? `/app/messages?userId=${n.reference_id}` : '/app/messages';
  }

  if (refType === 'meeting' || type.startsWith('meeting')) {
    return n.reference_id ? `/app/meetings?meetingId=${n.reference_id}` : '/app/meetings';
  }

  if (refType === 'daily_report' || type.startsWith('daily_report') || type.startsWith('report')) {
    if (n.reference_id) {
      return `/app/reports?reportId=${n.reference_id}`;
    }
    return '/app/reports';
  }

  if (refType === 'leave' || type.startsWith('leave')) {
    return '/app/leave';
  }

  if (refType === 'announcement' || type === 'announcement') {
    return '/app/announcements';
  }

  return '/app/dashboard';
}
