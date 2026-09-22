import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { 
  Bell, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  CheckSquare, 
  ClipboardList, 
  MessageSquare, 
  Megaphone, 
  FileText,
  Monitor,
  Save,
  ShieldAlert
} from 'lucide-react';
import { notificationApi } from '../../services/api/notificationApi';
import type { UserNotificationPreferences } from '../../services/api/notificationApi';

interface NotificationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPreferencesUpdated?: () => void;
}

export const NotificationSettingsModal: React.FC<NotificationSettingsModalProps> = ({
  isOpen,
  onClose,
  onPreferencesUpdated,
}) => {
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permissionState, setPermissionState] = useState<'default' | 'granted' | 'denied' | 'unsupported'>('default');

  const [preferences, setPreferences] = useState<UserNotificationPreferences>({
    user_id: '',
    meetings_enabled: true,
    tasks_enabled: true,
    leave_enabled: true,
    messages_enabled: true,
    announcements_enabled: true,
    daily_reports_enabled: true,
    browser_enabled: true,
    in_app_enabled: true,
  });

  const checkPermissionState = () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermissionState('unsupported');
    } else {
      setPermissionState(Notification.permission as 'default' | 'granted' | 'denied');
    }
  };

  useEffect(() => {
    if (isOpen) {
      checkPermissionState();
      loadPreferences();
    }
  }, [isOpen]);

  const loadPreferences = async () => {
    try {
      setLoading(true);
      const data = await notificationApi.getUserPreferences();
      if (data) {
        setPreferences(data);
      }
    } catch (err: any) {
      showError(err.message || 'Failed to load notification preferences');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermissionState('unsupported');
      return;
    }

    try {
      const result = await Notification.requestPermission();
      setPermissionState(result as 'granted' | 'denied' | 'default');
      if (result === 'granted') {
        showSuccess('Browser notifications enabled.');
        setPreferences((prev) => ({ ...prev, browser_enabled: true }));
      }
    } catch (err) {
      console.warn('Could not request notification permission:', err);
    }
  };

  const handleToggle = (key: keyof UserNotificationPreferences) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await notificationApi.updateUserPreferences(preferences);
      showSuccess('Notification preferences saved successfully.');
      if (onPreferencesUpdated) onPreferencesUpdated();
      onClose();
    } catch (err: any) {
      showError(err.message || 'Failed to save notification preferences');
    } finally {
      setSaving(false);
    }
  };

  const categories = [
    {
      key: 'meetings_enabled' as const,
      label: 'Meetings & Reminders',
      description: 'Get reminders 5 minutes before scheduled meetings start',
      icon: Calendar,
    },
    {
      key: 'tasks_enabled' as const,
      label: 'Tasks & Assignments',
      description: 'Updates when tasks are assigned, reviewed, or updated',
      icon: CheckSquare,
    },
    {
      key: 'leave_enabled' as const,
      label: 'Leave Requests',
      description: 'Leave submissions, approvals, and status updates',
      icon: ClipboardList,
    },
    {
      key: 'messages_enabled' as const,
      label: 'Direct Messages',
      description: 'Instant alerts when team members send messages',
      icon: MessageSquare,
    },
    {
      key: 'announcements_enabled' as const,
      label: 'Announcements',
      description: 'Company-wide broadcasts and notices',
      icon: Megaphone,
    },
    {
      key: 'daily_reports_enabled' as const,
      label: 'Daily Summary & Reports',
      description: 'Reminders and submission status alerts',
      icon: FileText,
    },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Notification Settings"
    >
      <div className="space-y-6 max-h-[75vh] overflow-y-auto px-1 pr-2">
        {/* Browser Permission Section */}
        <div className="p-4 bg-surface-muted border border-border rounded-xl space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Monitor className="h-5 w-5 text-primary shrink-0" />
              <div>
                <h4 className="text-sm font-semibold text-content">Browser Notifications</h4>
                <p className="text-xs text-content-muted">
                  Stay updated with important SCARO ERP notifications.
                </p>
              </div>
            </div>

            {permissionState === 'granted' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 shrink-0">
                <CheckCircle2 className="h-3.5 w-3.5" /> Enabled
              </span>
            )}
            {permissionState === 'denied' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 shrink-0">
                <ShieldAlert className="h-3.5 w-3.5" /> Blocked
              </span>
            )}
          </div>

          {permissionState === 'default' && (
            <div className="pt-2">
              <Button
                id="enable-browser-notifications-btn"
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRequestPermission}
                className="gap-2 font-semibold text-primary border-primary/40 hover:bg-primary/5 cursor-pointer"
              >
                <Bell className="h-4 w-4" /> Enable Notifications
              </Button>
            </div>
          )}

          {permissionState === 'granted' && (
            <p className="text-xs text-emerald-700 font-medium">
              Notifications are enabled. You will receive desktop and meeting alerts.
            </p>
          )}

          {permissionState === 'denied' && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span>
                Notifications are currently blocked in your browser. You can enable them from your browser site settings.
              </span>
            </div>
          )}

          {permissionState === 'unsupported' && (
            <p className="text-xs text-content-muted">
              Web notifications are not supported in this browser environment. In-app notifications will continue to work.
            </p>
          )}
        </div>

        {/* Delivery Channels */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-content-muted">Delivery Channels</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-center justify-between p-3 bg-surface border border-border rounded-xl cursor-pointer hover:border-primary/40 transition-colors">
              <div className="flex items-center gap-2.5">
                <Monitor className="h-4 w-4 text-content-muted" />
                <span className="text-xs font-medium text-content">Browser Notifications</span>
              </div>
              <input
                type="checkbox"
                checked={preferences.browser_enabled}
                onChange={() => handleToggle('browser_enabled')}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-surface border border-border rounded-xl cursor-pointer hover:border-primary/40 transition-colors">
              <div className="flex items-center gap-2.5">
                <Bell className="h-4 w-4 text-content-muted" />
                <span className="text-xs font-medium text-content">In-App Notifications</span>
              </div>
              <input
                type="checkbox"
                checked={preferences.in_app_enabled}
                onChange={() => handleToggle('in_app_enabled')}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
            </label>
          </div>
        </div>

        {/* Event Categories */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-content-muted">Notification Categories</h4>
          <div className="space-y-2">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isChecked = Boolean(preferences[cat.key]);
              return (
                <label
                  key={cat.key}
                  className="flex items-center justify-between p-3.5 bg-surface border border-border rounded-xl cursor-pointer hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-surface-muted text-content-muted mt-0.5">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-content block">{cat.label}</span>
                      <span className="text-xs text-content-muted block mt-0.5">{cat.description}</span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggle(cat.key)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary ml-3"
                  />
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal Actions */}
      <div className="mt-6 pt-4 border-t border-border flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          id="save-notification-settings-btn"
          type="button"
          variant="primary"
          onClick={handleSave}
          isLoading={saving}
          disabled={saving || loading}
          className="gap-2 font-semibold"
        >
          <Save className="h-4 w-4" /> Save Preferences
        </Button>
      </div>
    </Modal>
  );
};
