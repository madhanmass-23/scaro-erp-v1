/**
 * Attendance API Service for SCARO ERP Frontend.
 * 
 * Interacts with Node.js/Express `/api/v1/attendance` endpoints backed by MariaDB.
 */

import { api } from '../../lib/api';

export interface SafeAttendanceSessionDto {
  id: string;
  user_id: string;
  session_date: string;
  clock_in_time: string;
  clock_out_time: string | null;
  status: 'Present' | 'Absent' | 'Half Day';
  duration_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface SafeManagementAttendanceDto {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  role: string;
  session_date: string;
  clock_in_time: string;
  clock_out_time: string | null;
  status: 'Present' | 'Absent' | 'Half Day';
  duration_minutes: number;
  report: {
    id: string | null;
    status: string | null;
    notes: string | null;
    tomorrow_plan: string | null;
    blockers: string | null;
  } | null;
}

export interface AttendanceHistoryFilter {
  from?: string;
  to?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface ManagementAttendanceFilter {
  date?: string;
  from?: string;
  to?: string;
  user_id?: string;
  role?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export const attendanceApi = {
  /**
   * Signs in authenticated user and starts an attendance session.
   * Calls POST /api/v1/attendance/sign-in
   */
  async signIn(): Promise<SafeAttendanceSessionDto> {
    return api.post<SafeAttendanceSessionDto>('/attendance/sign-in');
  },

  /**
   * Retrieves current active attendance session for authenticated user.
   * Calls GET /api/v1/attendance/current
   */
  async getCurrentSession(): Promise<SafeAttendanceSessionDto | null> {
    try {
      const data = await api.get<SafeAttendanceSessionDto>('/attendance/current');
      return data || null;
    } catch {
      return null;
    }
  },

  /**
   * Signs out authenticated user and finalizes active attendance session.
   * Calls POST /api/v1/attendance/sign-out
   */
  async signOut(): Promise<SafeAttendanceSessionDto> {
    return api.post<SafeAttendanceSessionDto>('/attendance/sign-out');
  },

  /**
   * Retrieves personal attendance history for authenticated user.
   * Calls GET /api/v1/attendance/history
   */
  async getHistory(filter?: AttendanceHistoryFilter): Promise<SafeAttendanceSessionDto[]> {
    const params: Record<string, string | number | boolean | undefined | null> = {};
    if (filter) {
      if (filter.from) params.from = filter.from;
      if (filter.to) params.to = filter.to;
      if (filter.status) params.status = filter.status;
      if (filter.page) params.page = filter.page;
      if (filter.limit) params.limit = filter.limit;
    }

    const data = await api.get<SafeAttendanceSessionDto[] | { sessions: SafeAttendanceSessionDto[] }>('/attendance/history', { params });
    if (Array.isArray(data)) {
      return data;
    }
    if (data && typeof data === 'object' && 'sessions' in data && Array.isArray((data as { sessions: SafeAttendanceSessionDto[] }).sessions)) {
      return (data as { sessions: SafeAttendanceSessionDto[] }).sessions;
    }
    return [];
  },

  /**
   * Retrieves management workforce attendance records (Admin / Super Admin).
   * Calls GET /api/v1/attendance/management
   */
  async getManagementAttendance(filter?: ManagementAttendanceFilter): Promise<SafeManagementAttendanceDto[]> {
    const params: Record<string, string | number | boolean | undefined | null> = {};
    if (filter) {
      if (filter.date) params.date = filter.date;
      if (filter.from) params.from = filter.from;
      if (filter.to) params.to = filter.to;
      if (filter.user_id) params.user_id = filter.user_id;
      if (filter.role) params.role = filter.role;
      if (filter.status) params.status = filter.status;
      if (filter.page) params.page = filter.page;
      if (filter.limit) params.limit = filter.limit;
    }

    const data = await api.get<SafeManagementAttendanceDto[] | { records: SafeManagementAttendanceDto[] }>('/attendance/management', { params });
    if (Array.isArray(data)) {
      return data;
    }
    if (data && typeof data === 'object' && 'records' in data && Array.isArray((data as { records: SafeManagementAttendanceDto[] }).records)) {
      return (data as { records: SafeManagementAttendanceDto[] }).records;
    }
    return [];
  },
};
