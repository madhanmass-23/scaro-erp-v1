/**
 * Leave API Service for SCARO ERP Frontend.
 * 
 * Interacts with Node.js/Express `/api/v1/leave-requests` endpoints backed by MariaDB.
 */

import { api } from '../../lib/api';
import type { LeaveType, LeaveStatus } from '../../types/leave';

export interface SafeLeaveRequestDto {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_avatar: string | null;
  role: string;
  type: LeaveType;
  start_date: string;
  end_date: string;
  reason: string;
  status: LeaveStatus;
  rejection_reason: string | null;
  reviewed_by: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeaveListFilter {
  status?: string;
  type?: string;
  from?: string;
  to?: string;
  user_id?: string;
  page?: number;
  limit?: number;
}

export interface CreateLeaveRequestPayload {
  type: LeaveType;
  start_date: string;
  end_date: string;
  reason: string;
}

export interface UpdateLeaveRequestPayload {
  status?: LeaveStatus;
  rejection_reason?: string | null;
  type?: LeaveType;
  start_date?: string;
  end_date?: string;
  reason?: string;
}

export const leaveApi = {
  /**
   * Lists leave requests with role-scoping and filters.
   * Calls GET /api/v1/leave-requests
   */
  async getLeaveRequests(filter?: LeaveListFilter): Promise<SafeLeaveRequestDto[]> {
    const params: Record<string, string | number | boolean | undefined | null> = {};
    if (filter) {
      if (filter.status && filter.status !== 'All') params.status = filter.status;
      if (filter.type && filter.type !== 'All') params.type = filter.type;
      if (filter.from) params.from = filter.from;
      if (filter.to) params.to = filter.to;
      if (filter.user_id) params.user_id = filter.user_id;
      if (filter.page) params.page = filter.page;
      if (filter.limit) params.limit = filter.limit;
    }

    const data = await api.get<SafeLeaveRequestDto[] | { requests: SafeLeaveRequestDto[] }>('/leave-requests', { params });
    if (Array.isArray(data)) {
      return data;
    }
    if (data && typeof data === 'object' && 'requests' in data && Array.isArray((data as { requests: SafeLeaveRequestDto[] }).requests)) {
      return (data as { requests: SafeLeaveRequestDto[] }).requests;
    }
    return [];
  },

  /**
   * Retrieves a single leave request by ID.
   * Calls GET /api/v1/leave-requests/:id
   */
  async getLeaveRequestById(id: string): Promise<SafeLeaveRequestDto> {
    return api.get<SafeLeaveRequestDto>(`/leave-requests/${id}`);
  },

  /**
   * Submits a new leave request for the authenticated user.
   * Calls POST /api/v1/leave-requests
   */
  async createLeaveRequest(payload: CreateLeaveRequestPayload): Promise<SafeLeaveRequestDto> {
    return api.post<SafeLeaveRequestDto>('/leave-requests', payload);
  },

  /**
   * Updates an existing leave request (cancellation, modification, approval, rejection).
   * Calls PATCH /api/v1/leave-requests/:id
   */
  async updateLeaveRequest(id: string, payload: UpdateLeaveRequestPayload): Promise<SafeLeaveRequestDto> {
    return api.patch<SafeLeaveRequestDto>(`/leave-requests/${id}`, payload);
  },

  /**
   * Cancels a pending leave request.
   * Calls PATCH /api/v1/leave-requests/:id with { status: 'Cancelled' }
   */
  async cancelLeaveRequest(id: string): Promise<SafeLeaveRequestDto> {
    return api.patch<SafeLeaveRequestDto>(`/leave-requests/${id}`, { status: 'Cancelled' });
  },

  /**
   * Approves a pending leave request (Admin/Super Admin only).
   * Calls PATCH /api/v1/leave-requests/:id with { status: 'Approved' }
   */
  async approveLeaveRequest(id: string): Promise<SafeLeaveRequestDto> {
    return api.patch<SafeLeaveRequestDto>(`/leave-requests/${id}`, { status: 'Approved' });
  },

  /**
   * Rejects a pending leave request (Admin/Super Admin only).
   * Calls PATCH /api/v1/leave-requests/:id with { status: 'Rejected', rejection_reason }
   */
  async rejectLeaveRequest(id: string, rejectionReason: string): Promise<SafeLeaveRequestDto> {
    const reason = rejectionReason.trim() || 'Rejected by administrator';
    return api.patch<SafeLeaveRequestDto>(`/leave-requests/${id}`, {
      status: 'Rejected',
      rejection_reason: reason,
    });
  },
};
