/**
 * SCARO ERP — Client-Side Meeting Reminder Watcher
 * 
 * Monitors active scheduled meetings for the authenticated user and triggers
 * native browser/PWA notifications approximately 5 minutes before start time.
 * Deduplicates notifications across sessions and browser tabs.
 */

import { meetingApi } from './api/meetingApi';
import type { SafeMeetingDto } from './api/meetingApi';
import { notificationApi } from './api/notificationApi';
import type { UserNotificationPreferences } from './api/notificationApi';

const REMINDER_STORAGE_KEY_PREFIX = 'scaro_reminder_fired_';
const firedInSession = new Set<string>();

/**
 * Checks if a reminder was already shown for a given meeting on today's date.
 */
function isReminderAlreadyFired(meetingId: string, meetingDate: string): boolean {
  const key = `${REMINDER_STORAGE_KEY_PREFIX}${meetingId}_${meetingDate}`;
  if (firedInSession.has(key)) return true;
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/**
 * Marks a reminder as fired in memory and persistent storage.
 */
function markReminderFired(meetingId: string, meetingDate: string): void {
  const key = `${REMINDER_STORAGE_KEY_PREFIX}${meetingId}_${meetingDate}`;
  firedInSession.add(key);
  try {
    localStorage.setItem(key, '1');
  } catch {
    // LocalStorage unavailable/quarantined
  }
}

/**
 * Parses time string (HH:MM or HH:MM:SS) on a given date (YYYY-MM-DD) into a Date object.
 */
function parseMeetingDateTime(dateStr: string, timeStr: string): Date | null {
  try {
    const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
    const timeParts = timeStr.split(':');
    const hours = parseInt(timeParts[0], 10);
    const minutes = parseInt(timeParts[1], 10);
    const seconds = timeParts[2] ? parseInt(timeParts[2], 10) : 0;

    const [year, month, day] = cleanDate.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day, hours, minutes, seconds);
    return isNaN(dateObj.getTime()) ? null : dateObj;
  } catch {
    return null;
  }
}

/**
 * Dispatches a native browser notification for an upcoming meeting.
 */
export function dispatchNativeBrowserMeetingReminder(
  meeting: SafeMeetingDto,
  onNavigate?: (url: string) => void
): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const title = 'Meeting starts in 5 minutes';
  const body = `Meeting "${meeting.title}" is scheduled to start at ${meeting.start_time.slice(0, 5)}.`;

  try {
    const notification = new Notification(title, {
      body,
      icon: '/favicon.svg',
      tag: `meeting-reminder-${meeting.id}`,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
      if (onNavigate) {
        onNavigate('/app/meetings');
      } else {
        window.location.href = '/app/meetings';
      }
    };
  } catch {
    // Fallback for Service Worker notification if constructor fails in some mobile browsers
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(title, {
          body,
          icon: '/favicon.svg',
          tag: `meeting-reminder-${meeting.id}`,
          data: { url: '/app/meetings' },
        });
      });
    }
  }
}

/**
 * Checks upcoming meetings and triggers 5-minute reminders if appropriate.
 */
export async function checkAndTriggerMeetingReminders(
  userPreferences?: UserNotificationPreferences | null,
  onNavigate?: (url: string) => void
): Promise<void> {
  // If user disabled meetings notifications, do nothing
  if (userPreferences && !userPreferences.meetings_enabled) {
    return;
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const meetings = await meetingApi.getMeetings();

    const now = new Date();

    for (const meeting of meetings) {
      // Skip cancelled meetings
      if (meeting.status === 'Cancelled') continue;

      const meetingDate = meeting.meeting_date.includes('T')
        ? meeting.meeting_date.split('T')[0]
        : meeting.meeting_date;

      // Only check today's meetings
      if (meetingDate !== today) continue;

      const meetingStart = parseMeetingDateTime(meetingDate, meeting.start_time);
      if (!meetingStart) continue;

      const diffMs = meetingStart.getTime() - now.getTime();
      const diffMinutes = diffMs / (1000 * 60);

      // Trigger if meeting starts in 0 to 5.5 minutes
      if (diffMinutes >= 0 && diffMinutes <= 5.5) {
        if (!isReminderAlreadyFired(meeting.id, meetingDate)) {
          markReminderFired(meeting.id, meetingDate);

          // Check if browser notifications are allowed & enabled
          const isBrowserEnabled = userPreferences?.browser_enabled ?? true;
          if (isBrowserEnabled && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            dispatchNativeBrowserMeetingReminder(meeting, onNavigate);
          }
        }
      }
    }

    // Also trigger server-side check for in-app persistence (best effort)
    try {
      await notificationApi.triggerMeetingRemindersCheck(6);
    } catch {
      // Server check endpoint failure is non-blocking
    }
  } catch (err) {
    console.warn('[MEETING REMINDER WATCHER] Check failed:', err);
  }
}
