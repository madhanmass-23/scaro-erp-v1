import React, { useEffect, useState } from 'react';
import { Search, Bell, Settings, LogOut, User as UserIcon } from 'lucide-react';
import { Dropdown, DropdownItem } from '../components/ui/Dropdown';
import { Avatar } from '../components/ui/Avatar';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { useToast } from '../components/ui/Toast';
import { executeAppLogout } from '../services/authWorkflowService';
import type { NotificationItem } from '../types/notification';
import {
  fetchUserNotifications,
  fetchUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getNotificationDestination,
  triggerDailyReportReminder,
} from '../services/notificationService';

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, role } = useAuth();
  const { showError } = useToast();
  
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = async () => {
    if (!user) return;
    try {
      const [list, count] = await Promise.all([
        fetchUserNotifications(user.id, 8),
        fetchUnreadCount(user.id),
      ]);
      setNotifications(list);
      setUnreadCount(count);
    } catch (err) {
      console.error('Failed to load notifications in Header:', err);
    }
  };

  useEffect(() => {
    if (!user) return;
    
    loadNotifications();
    triggerDailyReportReminder();

    // Periodic check every 30s
    const interval = setInterval(() => {
      loadNotifications();
    }, 30000);

    return () => {
      clearInterval(interval);
    };
  }, [user]);

  const handleLogout = async () => {
    await executeAppLogout({
      userId: user?.id,
      role,
      navigate,
      onBlockLogout: (msg) => showError(msg),
    });
  };
  
  const handleItemClick = async (n: NotificationItem) => {
    if (!n.is_read) {
      try {
        await markNotificationAsRead(n.id);
        setNotifications(curr => curr.map(item => item.id === n.id ? { ...item, is_read: true } : item));
        setUnreadCount(c => Math.max(0, c - 1));
      } catch (e) {
        console.error('Failed to mark notification as read:', e);
      }
    }
    const dest = getNotificationDestination(n);
    navigate(dest);
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0 || !user) return;
    try {
      await markAllNotificationsAsRead(user.id);
      setUnreadCount(0);
      setNotifications(curr => curr.map(n => ({ ...n, is_read: true })));
    } catch (e) {
      console.error('Failed to mark all as read:', e);
    }
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-x-4 border-b border-border bg-surface px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
      {/* Mobile/Tablet Brand Logo (displayed when desktop sidebar is hidden) */}
      <div className="flex items-center gap-2 lg:hidden shrink-0">
        <img
          src="/assets/scaro-logo.png"
          alt="SCARO Logo"
          className="h-7 w-7 object-contain rounded-md border border-border/40 bg-[#fbf7f2] shadow-2xs shrink-0"
        />
        <span className="text-base font-bold text-primary tracking-tight">SCARO</span>
      </div>

      <div className="flex flex-1 gap-x-4 self-stretch items-center lg:gap-x-6">
        <form className="relative flex flex-1 h-full items-center" action="#" method="GET">
          <label htmlFor="search-field" className="sr-only">Search</label>
          <Search
            className="pointer-events-none absolute inset-y-0 left-0 h-full w-4 text-content-muted ml-1"
            aria-hidden="true"
          />
          <input
            id="search-field"
            className="block h-9 w-full rounded-md border-0 bg-surface-muted/60 py-1.5 pl-8 pr-3 text-content placeholder:text-content-muted text-xs focus:ring-1 focus:ring-primary sm:text-sm"
            placeholder="Search workspace..."
            type="search"
            name="search"
          />
        </form>

        <div className="flex items-center gap-x-3 lg:gap-x-5 shrink-0">
          {/* Notifications Dropdown */}
          <Dropdown
            align="right"
            trigger={
              <button 
                type="button" 
                className="-m-2 p-2 text-content-muted hover:text-content relative rounded-full transition-colors"
                aria-label="View notifications"
              >
                <span className="sr-only">View notifications</span>
                <Bell className="h-5 w-5" aria-hidden="true" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-status-danger px-1 text-[10px] font-bold text-white ring-2 ring-surface">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            }
          >
            <div className="px-4 py-2.5 border-b border-border min-w-[280px] sm:min-w-[320px] flex items-center justify-between">
              <p className="text-sm font-semibold text-content">Notifications</p>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  Mark all as read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-border">
               {notifications.length === 0 ? (
                 <div className="p-4 text-center text-xs text-content-muted">
                   No notifications yet
                 </div>
               ) : (
                 notifications.map(n => (
                   <div
                     key={n.id}
                     onClick={() => handleItemClick(n)}
                     className={`p-3 cursor-pointer hover:bg-surface-muted/70 transition-colors flex items-start gap-2.5 ${
                       !n.is_read ? 'bg-primary/5' : ''
                     }`}
                   >
                     <div className="mt-1 shrink-0">
                       {!n.is_read ? (
                         <span className="h-2 w-2 rounded-full bg-primary block" />
                       ) : (
                         <span className="h-2 w-2 rounded-full bg-transparent block" />
                       )}
                     </div>
                     <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                       <span className={`text-xs ${!n.is_read ? 'font-bold text-content' : 'font-medium text-content-muted'} truncate`}>
                         {n.title}
                       </span>
                       <span className="text-xs text-content-muted line-clamp-2">
                         {n.message}
                       </span>
                       <span className="text-[10px] text-content-muted/80 mt-1">
                         {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                       </span>
                     </div>
                   </div>
                 ))
               )}
            </div>
            <div className="border-t border-border p-2 bg-surface-muted/30">
              <button
                type="button"
                className="w-full text-center text-primary text-xs font-semibold py-1 hover:underline"
                onClick={() => navigate('/app/notifications')}
              >
                View all notifications
              </button>
            </div>
          </Dropdown>

          {/* Separator */}
          <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-border" aria-hidden="true" />

          {/* Profile dropdown */}
          <Dropdown
            align="right"
            trigger={
              <button type="button" className="-m-1 flex items-center p-1 rounded-full focus:outline-none focus:ring-2 focus:ring-primary/40">
                <span className="sr-only">Open user menu</span>
                <Avatar 
                  size="sm" 
                  fallback={profile?.display_name ? profile.display_name.substring(0, 2).toUpperCase() : 'SC'} 
                  src={profile?.avatar_url} 
                />
              </button>
            }
          >
            <div className="px-4 py-2.5 border-b border-border mb-1 min-w-[200px]">
              <p className="text-sm font-semibold text-content truncate">{profile?.display_name || user?.email}</p>
              <p className="text-xs text-content-muted truncate">{role || 'Team Member'}</p>
            </div>
            <DropdownItem onClick={() => navigate('/app/profile')}>
              <div className="flex items-center gap-2">
                <UserIcon className="h-4 w-4 text-content-muted" /> Profile & Security
              </div>
            </DropdownItem>
            {role === 'Super Admin' && (
              <DropdownItem onClick={() => navigate('/app/admin/settings')}>
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-content-muted" /> Company Settings
                </div>
              </DropdownItem>
            )}
            <div className="border-t border-border mt-1 pt-1">
              <DropdownItem onClick={handleLogout} className="text-status-danger hover:text-red-700 hover:bg-red-50">
                <div className="flex items-center gap-2">
                  <LogOut className="h-4 w-4" /> Logout
                </div>
              </DropdownItem>
            </div>
          </Dropdown>
        </div>
      </div>
    </header>
  );
};
