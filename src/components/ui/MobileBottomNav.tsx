import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  CheckSquare, 
  FileText, 
  Calendar, 
  Menu, 
  Briefcase, 
  Users, 
  MessageSquare, 
  Bell, 
  User as UserIcon, 
  Shield, 
  LogOut, 
  Megaphone 
} from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { Drawer } from './Drawer';
import { cn } from './Button';
import { useToast } from './Toast';
import { executeAppLogout } from '../../services/authWorkflowService';

export const MobileBottomNav: React.FC = () => {
  const { user, profile, role } = useAuth();
  const { showError } = useToast();
  const navigate = useNavigate();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  // Determine role-specific primary home destination
  let homeHref = '/app/dashboard';
  if (role === 'Super Admin') homeHref = '/app/admin/dashboard';
  else if (role === 'Admin') homeHref = '/app/admin/overview';
  else if (role === 'Intern') homeHref = '/app/intern/dashboard';

  const isSupervisor = role === 'Super Admin' || role === 'Admin';
  const trackerHref = isSupervisor ? '/app/reports' : '/app/tracker';
  const trackerLabel = isSupervisor ? 'Reports' : 'Daily Report';

  const handleLogout = async () => {
    setIsMoreOpen(false);
    await executeAppLogout({
      userId: user?.id,
      role,
      navigate,
      onBlockLogout: (msg) => showError(msg),
    });
  };

  const navItemClass = ({ isActive }: { isActive: boolean }) => cn(
    'flex flex-col items-center justify-center flex-1 py-1.5 text-[10px] font-medium transition-colors select-none',
    isActive ? 'text-primary font-semibold' : 'text-content-muted hover:text-content'
  );

  return (
    <>
      {/* Mobile & Tablet Bottom Navigation (<1024px) */}
      <nav 
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-border shadow-lg flex items-center justify-around h-16 px-1 safe-area-pb select-none"
        aria-label="Mobile Bottom Navigation"
      >
        <NavLink to={homeHref} className={navItemClass}>
          <LayoutDashboard className="h-5 w-5 mb-0.5 shrink-0" />
          <span>Home</span>
        </NavLink>

        <NavLink to="/app/tasks" className={navItemClass}>
          <CheckSquare className="h-5 w-5 mb-0.5 shrink-0" />
          <span>Tasks</span>
        </NavLink>

        <NavLink to={trackerHref} className={navItemClass}>
          <FileText className="h-5 w-5 mb-0.5 shrink-0" />
          <span>{trackerLabel}</span>
        </NavLink>

        <NavLink to="/app/attendance" className={navItemClass}>
          <Calendar className="h-5 w-5 mb-0.5 shrink-0" />
          <span>Work Time</span>
        </NavLink>

        <button 
          type="button"
          onClick={() => setIsMoreOpen(true)}
          className={cn(
            "flex flex-col items-center justify-center flex-1 py-1.5 text-[10px] font-medium transition-colors",
            isMoreOpen ? "text-primary font-semibold" : "text-content-muted hover:text-content"
          )}
          aria-label="Open more menu"
        >
          <Menu className="h-5 w-5 mb-0.5 shrink-0" />
          <span>More</span>
        </button>
      </nav>

      {/* Slide-over Drawer for Secondary Destinations */}
      <Drawer
        isOpen={isMoreOpen}
        onClose={() => setIsMoreOpen(false)}
        title={
          <div className="flex items-center gap-2">
            <img
              src="/assets/scaro-logo.png"
              alt="SCARO Logo"
              className="h-6 w-6 object-contain rounded-md border border-border/40 bg-[#fbf7f2] shadow-2xs shrink-0"
            />
            <span className="font-bold text-primary">SCARO Navigation</span>
          </div>
        }
        position="right"
      >
        {/* User Identity Card */}
        <div className="flex items-center gap-3 p-3 bg-surface-muted rounded-lg border border-border mb-4">
          <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-base shrink-0">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="Avatar" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              profile?.display_name?.charAt(0) || user?.email?.charAt(0).toUpperCase() || 'U'
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-content truncate">{profile?.display_name || user?.email}</p>
            <p className="text-xs text-content-muted truncate">{role || 'Team Member'}</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Section 1: Modules & Work */}
          <div>
            <p className="text-[11px] font-semibold text-content-muted uppercase tracking-wider px-3 mb-1.5">Modules</p>
            <div className="space-y-0.5">
              {role !== 'Intern' && (
                <NavLink
                  to="/app/projects"
                  onClick={() => setIsMoreOpen(false)}
                  className={({ isActive }) => cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                    isActive ? 'bg-primary/10 text-primary font-semibold' : 'text-content hover:bg-surface-muted'
                  )}
                >
                  <Briefcase className="h-4 w-4 shrink-0" />
                  <span>Projects</span>
                </NavLink>
              )}

              <NavLink
                to="/app/meetings"
                onClick={() => setIsMoreOpen(false)}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                  isActive ? 'bg-primary/10 text-primary font-semibold' : 'text-content hover:bg-surface-muted'
                )}
              >
                <Users className="h-4 w-4 shrink-0" />
                <span>Meetings</span>
              </NavLink>

              <NavLink
                to="/app/leave"
                onClick={() => setIsMoreOpen(false)}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                  isActive ? 'bg-primary/10 text-primary font-semibold' : 'text-content hover:bg-surface-muted'
                )}
              >
                <Calendar className="h-4 w-4 shrink-0" />
                <span>Leave Management</span>
              </NavLink>
            </div>
          </div>

          {/* Section 2: Communication */}
          <div>
            <p className="text-[11px] font-semibold text-content-muted uppercase tracking-wider px-3 mb-1.5">Communication</p>
            <div className="space-y-0.5">
              <NavLink
                to="/app/messages"
                onClick={() => setIsMoreOpen(false)}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                  isActive ? 'bg-primary/10 text-primary font-semibold' : 'text-content hover:bg-surface-muted'
                )}
              >
                <MessageSquare className="h-4 w-4 shrink-0" />
                <span>Direct Messages</span>
              </NavLink>

              <NavLink
                to="/app/notifications"
                onClick={() => setIsMoreOpen(false)}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                  isActive ? 'bg-primary/10 text-primary font-semibold' : 'text-content hover:bg-surface-muted'
                )}
              >
                <Bell className="h-4 w-4 shrink-0" />
                <span>Notifications</span>
              </NavLink>

              {isSupervisor && (
                <NavLink
                  to="/app/announcements"
                  onClick={() => setIsMoreOpen(false)}
                  className={({ isActive }) => cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                    isActive ? 'bg-primary/10 text-primary font-semibold' : 'text-content hover:bg-surface-muted'
                  )}
                >
                  <Megaphone className="h-4 w-4 shrink-0" />
                  <span>Announcements</span>
                </NavLink>
              )}
            </div>
          </div>

          {/* Section 3: Administration (Super Admin & Admin only) */}
          {isSupervisor && (
            <div>
              <p className="text-[11px] font-semibold text-content-muted uppercase tracking-wider px-3 mb-1.5">Administration</p>
              <div className="space-y-0.5">
                <NavLink
                  to="/app/people"
                  onClick={() => setIsMoreOpen(false)}
                  className={({ isActive }) => cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                    isActive ? 'bg-primary/10 text-primary font-semibold' : 'text-content hover:bg-surface-muted'
                  )}
                >
                  <Users className="h-4 w-4 shrink-0" />
                  <span>People & Teams</span>
                </NavLink>

                {role === 'Super Admin' && (
                  <>
                    <NavLink
                      to="/app/audit-logs"
                      onClick={() => setIsMoreOpen(false)}
                      className={({ isActive }) => cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                        isActive ? 'bg-primary/10 text-primary font-semibold' : 'text-content hover:bg-surface-muted'
                      )}
                    >
                      <Shield className="h-4 w-4 shrink-0" />
                      <span>Audit Logs</span>
                    </NavLink>

                    <NavLink
                      to="/app/admin/settings"
                      onClick={() => setIsMoreOpen(false)}
                      className={({ isActive }) => cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                        isActive ? 'bg-primary/10 text-primary font-semibold' : 'text-content hover:bg-surface-muted'
                      )}
                    >
                      <Shield className="h-4 w-4 shrink-0" />
                      <span>Company Settings</span>
                    </NavLink>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Section 4: Account */}
          <div>
            <p className="text-[11px] font-semibold text-content-muted uppercase tracking-wider px-3 mb-1.5">Account</p>
            <div className="space-y-0.5">
              <NavLink
                to="/app/profile"
                onClick={() => setIsMoreOpen(false)}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                  isActive ? 'bg-primary/10 text-primary font-semibold' : 'text-content hover:bg-surface-muted'
                )}
              >
                <UserIcon className="h-4 w-4 shrink-0" />
                <span>My Profile & Security</span>
              </NavLink>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-status-danger hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors text-left"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </Drawer>
    </>
  );
};
