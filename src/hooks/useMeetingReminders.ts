/**
 * SCARO ERP — React Hook for Meeting Reminders
 * 
 * Periodically checks for upcoming meetings (every 60s) for the authenticated user
 * and triggers 5-minute browser & in-app alerts.
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { checkAndTriggerMeetingReminders } from '../services/meetingReminderWatcher';
import { notificationApi } from '../services/api/notificationApi';
import type { UserNotificationPreferences } from '../services/api/notificationApi';

export function useMeetingReminders() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const prefsRef = useRef<UserNotificationPreferences | null>(null);

  useEffect(() => {
    if (!user) return;

    let isMounted = true;

    // Load initial user notification preferences
    const loadPrefs = async () => {
      try {
        const prefs = await notificationApi.getUserPreferences();
        if (isMounted) {
          prefsRef.current = prefs;
        }
      } catch (err) {
        console.warn('[MEETING REMINDERS] Could not load user preferences:', err);
      }
    };

    loadPrefs();

    // Initial check after short delay
    const initialTimeout = setTimeout(() => {
      if (isMounted && user) {
        checkAndTriggerMeetingReminders(prefsRef.current, (url) => navigate(url));
      }
    }, 3000);

    // Periodic check every 60 seconds
    const interval = setInterval(() => {
      if (isMounted && user) {
        checkAndTriggerMeetingReminders(prefsRef.current, (url) => navigate(url));
      }
    }, 60000);

    return () => {
      isMounted = false;
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [user, navigate]);
}
