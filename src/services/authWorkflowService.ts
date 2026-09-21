/**
 * Auth Workflow Service - Handles daily summary check-in/out and logout barriers.
 * 
 * Migrated in Phase 3A-5 to Node.js/Express + MariaDB REST APIs.
 */

import { authApi } from './api/authApi';
import { attendanceApi } from './api/attendanceApi';
import { dailyReportApi } from './api/dailyReportApi';
import type { NavigateFunction } from 'react-router-dom';

/**
 * Checks whether today's Daily Summary is submitted for the given user.
 */
export async function isTodayDailySummarySubmitted(_userId?: string): Promise<boolean> {
  try {
    const report = await dailyReportApi.getTodayReport();
    if (!report) return false;
    return (report.status || '').toLowerCase() === 'submitted';
  } catch (err) {
    console.error('Failed to verify daily report status:', err);
    return false;
  }
}

/**
 * Records attendance clock-out time and finalizes the workday session.
 */
export async function finalizeWorkdaySignOut(_userId?: string): Promise<void> {
  try {
    // Finalize session with backend attendance sign-out
    await attendanceApi.signOut();
  } catch (err) {
    console.warn('Attendance sign-out warning / already closed:', err);
  } finally {
    // Terminate backend authentication session
    await authApi.logout();
  }
}

/**
 * Global Logout handler for Header & Navigation.
 * - Admin / Super Admin: Immediate sign out.
 * - Employee / Intern:
 *     If today's daily summary is NOT submitted:
 *       Blocks logout, keeps session active, navigates to /app/tracker with notice.
 *     If today's daily summary IS submitted:
 *       Finalizes attendance session, signs out, and navigates to /login with success message.
 */
export async function executeAppLogout({
  userId,
  role,
  navigate,
  onBlockLogout,
}: {
  userId?: string;
  role?: string | null;
  navigate: NavigateFunction;
  onBlockLogout?: (message: string) => void;
}): Promise<void> {
  const isSupervisor = role === 'Super Admin' || role === 'Admin';

  if (!userId || isSupervisor) {
    await authApi.logout();
    navigate('/login');
    return;
  }

  // For Employee and Intern:
  const isSubmitted = await isTodayDailySummarySubmitted(userId);

  if (!isSubmitted) {
    const warningMsg = 'Please complete your Daily Summary before logging out.';
    if (onBlockLogout) {
      onBlockLogout(warningMsg);
    }
    navigate('/app/tracker', {
      state: {
        requiredForLogout: true,
        message: warningMsg,
      },
    });
    return;
  }

  // If already submitted: proceed to finalize attendance and sign out
  await finalizeWorkdaySignOut(userId);
  navigate('/login', {
    state: {
      logoutSuccessMessage: 'Attendance captured successfully. You have been signed out.',
    },
  });
}
