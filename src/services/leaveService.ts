import { leaveApi, type SafeLeaveRequestDto } from './api/leaveApi';
import type {
  LeaveRequest,
  LeaveType,
  LeaveFilterParams,
  OverlapCheckResult,
} from '../types/leave';

/**
 * Leave & HR Operations Service
 * Centralizes all queries, mutations, status transitions, and overlap validations.
 * Backend Node.js / Express API and MariaDB enforce all security and self-approval boundaries.
 */

function mapDtoToLeaveRequest(dto: SafeLeaveRequestDto): LeaveRequest {
  return {
    id: dto.id,
    user_id: dto.user_id,
    type: dto.type,
    start_date: dto.start_date,
    end_date: dto.end_date,
    reason: dto.reason,
    status: dto.status,
    rejection_reason: dto.rejection_reason,
    reviewed_by: dto.reviewed_by?.id || null,
    reviewed_at: dto.reviewed_at,
    created_at: dto.created_at,
    updated_at: dto.updated_at,
    applicant: {
      id: dto.user_id,
      full_name: dto.user_name || 'Team Member',
      email: dto.user_email || '',
      employment_status: dto.role || null,
      department_id: null,
      department_name: null,
    },
    reviewer: dto.reviewed_by
      ? {
          id: dto.reviewed_by.id,
          full_name: dto.reviewed_by.full_name || 'Administrator',
          email: dto.reviewed_by.email || '',
        }
      : undefined,
  };
}

export async function fetchOwnLeaveRequests(userId?: string): Promise<LeaveRequest[]> {
  const dtos = await leaveApi.getLeaveRequests({ user_id: userId, limit: 100 });
  return dtos.map(mapDtoToLeaveRequest);
}

export async function fetchManagementLeaveRequests(
  params?: LeaveFilterParams
): Promise<LeaveRequest[]> {
  const dtos = await leaveApi.getLeaveRequests({
    status: params?.status && params.status !== 'All' ? params.status : undefined,
    type: params?.type && params.type !== 'All' ? params.type : undefined,
    from: params?.startDate || undefined,
    to: params?.endDate || undefined,
    limit: 100,
  });

  let results: LeaveRequest[] = dtos.map(mapDtoToLeaveRequest);

  // Client-side department and search filtering if requested
  if (params?.departmentId) {
    results = results.filter(r => r.applicant?.department_id === params.departmentId);
  }

  if (params?.searchQuery && params.searchQuery.trim() !== '') {
    const q = params.searchQuery.toLowerCase();
    results = results.filter(
      r =>
        r.applicant?.full_name?.toLowerCase().includes(q) ||
        r.applicant?.email?.toLowerCase().includes(q) ||
        r.reason?.toLowerCase().includes(q)
    );
  }

  return results;
}

export async function submitLeaveRequest(data: {
  user_id?: string;
  type: LeaveType;
  start_date: string;
  end_date: string;
  reason: string;
}): Promise<LeaveRequest> {
  const dto = await leaveApi.createLeaveRequest({
    type: data.type,
    start_date: data.start_date,
    end_date: data.end_date,
    reason: data.reason,
  });
  return mapDtoToLeaveRequest(dto);
}

export async function cancelLeaveRequest(id: string): Promise<void> {
  await leaveApi.cancelLeaveRequest(id);
}

export async function approveLeaveRequest(id: string): Promise<void> {
  await leaveApi.approveLeaveRequest(id);
}

export async function rejectLeaveRequest(id: string, rejectionReason: string): Promise<void> {
  await leaveApi.rejectLeaveRequest(id, rejectionReason);
}

export async function checkLeaveOverlap(
  userId: string,
  startDate: string,
  endDate: string,
  excludeId?: string
): Promise<OverlapCheckResult> {
  const dtos = await leaveApi.getLeaveRequests({ user_id: userId, limit: 100 });
  const overlapping = dtos
    .filter(
      (r) =>
        (r.status === 'Pending' || r.status === 'Approved') &&
        r.start_date <= endDate &&
        r.end_date >= startDate &&
        (!excludeId || r.id !== excludeId)
    )
    .map(mapDtoToLeaveRequest);

  return {
    hasOverlap: overlapping.length > 0,
    overlappingRequests: overlapping,
  };
}

export async function fetchTodayOnLeaveUsers(): Promise<
  { id: string; user_id: string; full_name: string; type: LeaveType; start_date: string; end_date: string }[]
> {
  const today = new Date().toISOString().split('T')[0];
  const dtos = await leaveApi.getLeaveRequests({
    status: 'Approved',
    limit: 100,
  });

  const activeToday = dtos.filter(
    (r) => r.status === 'Approved' && r.start_date <= today && r.end_date >= today
  );

  return activeToday.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    full_name: row.user_name || 'Team Member',
    type: row.type,
    start_date: row.start_date,
    end_date: row.end_date,
  }));
}

export async function fetchUpcomingApprovedLeaves(daysAhead = 30): Promise<LeaveRequest[]> {
  const today = new Date().toISOString().split('T')[0];
  const future = new Date(Date.now() + daysAhead * 86400000).toISOString().split('T')[0];

  const dtos = await leaveApi.getLeaveRequests({
    status: 'Approved',
    limit: 100,
  });

  const upcoming = dtos
    .filter(
      (r) =>
        r.status === 'Approved' &&
        r.start_date >= today &&
        r.start_date <= future
    )
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  return upcoming.map(mapDtoToLeaveRequest);
}
