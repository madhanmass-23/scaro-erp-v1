/**
 * Meetings API Service for SCARO ERP Frontend.
 * 
 * Interacts with Node.js/Express `/api/v1/meetings` endpoints backed by MariaDB.
 */

import { api } from '../../lib/api';

export interface SafeMeetingDto {
  id: string;
  title: string;
  description: string | null;
  organizer: {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  };
  meeting_date: string;
  start_time: string;
  end_time: string;
  meeting_type: string | null;
  external_meeting_url: string | null;
  status: string;
  participant_count: number;
  created_at: string;
  updated_at: string;
}

export interface SafeMeetingParticipantDto {
  meeting_id: string;
  participant_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  role: string;
  created_at: string;
}

export interface SafeMeetingAttendanceDto {
  meeting_id: string;
  participant_id: string;
  participant_name: string | null;
  participant_email: string | null;
  participant_avatar: string | null;
  joined_at: string | null;
  left_at: string | null;
  status: 'Present' | 'Late' | 'Absent' | 'Excused' | null;
  delay_minutes: number;
}

export interface MeetingListFilter {
  date?: string;
  from?: string;
  to?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateMeetingRequest {
  title: string;
  description?: string | null;
  meeting_date: string;
  start_time: string;
  end_time: string;
  meeting_type?: string | null;
  external_meeting_url?: string | null;
  status?: string;
  participant_ids?: string[];
}

export interface UpdateMeetingRequest {
  title?: string;
  description?: string | null;
  meeting_date?: string;
  start_time?: string;
  end_time?: string;
  meeting_type?: string | null;
  external_meeting_url?: string | null;
  status?: string;
}

export interface RecordMeetingAttendanceRequest {
  user_id?: string;
  participant_id?: string;
  joined_at?: string | null;
  left_at?: string | null;
  status?: 'Present' | 'Late' | 'Absent' | 'Excused' | null;
  delay_minutes?: number;
}

export const meetingApi = {
  /**
   * Lists meetings with RBAC scoping, filters, and pagination.
   * Calls GET /api/v1/meetings
   */
  async getMeetings(filter?: MeetingListFilter): Promise<SafeMeetingDto[]> {
    const params: Record<string, string | number | boolean | undefined | null> = {};
    if (filter) {
      if (filter.date) params.date = filter.date;
      if (filter.from) params.from = filter.from;
      if (filter.to) params.to = filter.to;
      if (filter.status && filter.status !== 'All') params.status = filter.status;
      if (filter.search) params.search = filter.search;
      if (filter.page) params.page = filter.page;
      if (filter.limit) params.limit = filter.limit;
    }

    const data = await api.get<SafeMeetingDto[] | { meetings: SafeMeetingDto[] }>('/meetings', { params });
    if (Array.isArray(data)) {
      return data;
    }
    if (data && typeof data === 'object' && 'meetings' in data && Array.isArray((data as { meetings: SafeMeetingDto[] }).meetings)) {
      return (data as { meetings: SafeMeetingDto[] }).meetings;
    }
    return [];
  },

  /**
   * Retrieves a single meeting by ID with access verification.
   * Calls GET /api/v1/meetings/:id
   */
  async getMeetingById(id: string): Promise<SafeMeetingDto> {
    return api.get<SafeMeetingDto>(`/meetings/${id}`);
  },

  /**
   * Creates a new meeting.
   * Calls POST /api/v1/meetings
   */
  async createMeeting(payload: CreateMeetingRequest): Promise<SafeMeetingDto> {
    return api.post<SafeMeetingDto>('/meetings', payload);
  },

  /**
   * Updates an existing meeting.
   * Calls PATCH /api/v1/meetings/:id
   */
  async updateMeeting(id: string, payload: UpdateMeetingRequest): Promise<SafeMeetingDto> {
    return api.patch<SafeMeetingDto>(`/meetings/${id}`, payload);
  },

  /**
   * Retrieves participants for a meeting.
   * Calls GET /api/v1/meetings/:id/participants
   */
  async getParticipants(meetingId: string): Promise<SafeMeetingParticipantDto[]> {
    const data = await api.get<SafeMeetingParticipantDto[]>(`/meetings/${meetingId}/participants`);
    return Array.isArray(data) ? data : [];
  },

  /**
   * Adds a participant to a meeting.
   * Calls POST /api/v1/meetings/:id/participants
   */
  async addParticipant(meetingId: string, userId: string): Promise<SafeMeetingParticipantDto> {
    return api.post<SafeMeetingParticipantDto>(`/meetings/${meetingId}/participants`, { user_id: userId });
  },

  /**
   * Removes a participant from a meeting.
   * Calls DELETE /api/v1/meetings/:id/participants/:userId
   */
  async removeParticipant(meetingId: string, userId: string): Promise<{ success: boolean; message: string }> {
    return api.delete<{ success: boolean; message: string }>(`/meetings/${meetingId}/participants/${userId}`);
  },

  /**
   * Retrieves attendance records for a meeting.
   * Calls GET /api/v1/meetings/:id/attendance
   */
  async getAttendance(meetingId: string): Promise<SafeMeetingAttendanceDto[]> {
    const data = await api.get<SafeMeetingAttendanceDto[]>(`/meetings/${meetingId}/attendance`);
    return Array.isArray(data) ? data : [];
  },

  /**
   * Records attendance for a participant.
   * Calls POST /api/v1/meetings/:id/attendance
   */
  async recordAttendance(meetingId: string, payload: RecordMeetingAttendanceRequest): Promise<SafeMeetingAttendanceDto> {
    return api.post<SafeMeetingAttendanceDto>(`/meetings/${meetingId}/attendance`, payload);
  },

  /**
   * Updates attendance for a participant.
   * Calls PATCH /api/v1/meetings/:id/attendance/:userId
   */
  async updateAttendance(meetingId: string, userId: string, payload: RecordMeetingAttendanceRequest): Promise<SafeMeetingAttendanceDto> {
    return api.patch<SafeMeetingAttendanceDto>(`/meetings/${meetingId}/attendance/${userId}`, payload);
  },
};
