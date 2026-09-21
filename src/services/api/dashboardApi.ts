/**
 * Dashboard API Service for SCARO ERP Frontend.
 * 
 * Interacts with Node.js/Express `/api/v1/dashboard` endpoints backed by MariaDB.
 */

import { api } from '../../lib/api';

export interface ManagementDashboardData {
  workforce: {
    total_active: number;
    super_admins: number;
    admins: number;
    employees: number;
    interns: number;
  };
  attendance_today: {
    present: number;
    half_day: number;
    absent: number;
    total_logged: number;
  };
  tasks: {
    total: number;
    todo: number;
    in_progress: number;
    in_review: number;
    completed: number;
    blocked: number;
  };
  projects: {
    total: number;
  };
  meetings: {
    today: number;
    upcoming: number;
  };
  leave_requests: {
    pending: number;
  };
  announcements: {
    total: number;
  };
}

export interface PersonalDashboardData {
  tasks: {
    total_assigned: number;
    todo: number;
    in_progress: number;
    completed: number;
  };
  attendance_today: {
    logged: boolean;
    status: string | null;
    clock_in_time: string | null;
    clock_out_time: string | null;
  };
  daily_report_today: {
    submitted: boolean;
    status: string | null;
    submitted_at: string | null;
  };
  meetings: {
    upcoming_count: number;
  };
  leave_requests: {
    pending_count: number;
  };
  notifications: {
    unread_count: number;
  };
  messages: {
    unread_count: number;
  };
}

export interface DashboardResponseDto {
  role_type: 'management' | 'personal';
  user_role: string;
  data: ManagementDashboardData | PersonalDashboardData;
}

export const dashboardApi = {
  /**
   * Retrieves role-scoped dashboard metrics summary.
   * Calls GET /api/v1/dashboard/summary
   */
  async getSummary(): Promise<DashboardResponseDto> {
    return api.get<DashboardResponseDto>('/dashboard/summary');
  },
};
