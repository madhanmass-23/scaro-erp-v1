import {
  meetingRepository,
  MeetingRecord,
  MeetingParticipantRecord,
  MeetingAttendanceRecord,
  MeetingListFilter,
  MeetingPaginationOptions,
} from "../repositories/meeting.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { notificationRepository } from "../repositories/notification.repository.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { authorizationService } from "./authorization.service.js";
import { UserRoleInfo, rbacService } from "./rbac.service.js";
import { AppError } from "../types/api.types.js";
import { isValidUuid, isValidDateString } from "../utils/validation.util.js";

const VALID_ATTENDANCE_STATUSES = new Set(["Present", "Late", "Absent", "Excused"]);

const MEETING_ALLOWED_UPDATE_FIELDS = new Set([
  "title",
  "description",
  "meeting_date",
  "start_time",
  "end_time",
  "meeting_type",
  "external_meeting_url",
  "status",
]);

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
  status: "Present" | "Late" | "Absent" | "Excused" | null;
  delay_minutes: number;
}

export class MeetingService {
  /**
   * Validates time string format (HH:MM or HH:MM:SS) and returns canonical HH:MM:SS.
   */
  private validateAndFormatTime(timeStr: string, fieldName = "time"): string {
    if (!timeStr || typeof timeStr !== "string") {
      throw new AppError(`Invalid ${fieldName}. Time string is required.`, 400, "INVALID_TIME");
    }
    const clean = timeStr.trim();
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;
    const match = clean.match(timeRegex);
    if (!match) {
      throw new AppError(
        `Invalid ${fieldName} format: '${timeStr}'. Expected HH:MM or HH:MM:SS (24-hour).`,
        400,
        "INVALID_TIME"
      );
    }
    const hours = match[1];
    const minutes = match[2];
    const seconds = match[4] || "00";
    return `${hours}:${minutes}:${seconds}`;
  }

  /**
   * Compares two canonical HH:MM:SS time strings.
   * Returns true if start < end.
   */
  private isStartTimeBeforeEndTime(startTime: string, endTime: string): boolean {
    return startTime < endTime;
  }

  private formatMeeting(raw: MeetingRecord): SafeMeetingDto {
    return {
      id: raw.id,
      title: raw.title,
      description: raw.description,
      organizer: {
        id: raw.organizer_id,
        full_name: raw.organizer_name || null,
        email: raw.organizer_email || null,
        avatar_url: raw.organizer_avatar || null,
      },
      meeting_date: raw.meeting_date ? String(raw.meeting_date).split("T")[0] : "",
      start_time: String(raw.start_time).substring(0, 8),
      end_time: String(raw.end_time).substring(0, 8),
      meeting_type: raw.meeting_type,
      external_meeting_url: raw.external_meeting_url,
      status: raw.status,
      participant_count: Number(raw.participant_count) || 0,
      created_at:
        typeof raw.created_at === "object" && raw.created_at !== null && "toISOString" in raw.created_at
          ? (raw.created_at as Date).toISOString()
          : String(raw.created_at),
      updated_at:
        typeof raw.updated_at === "object" && raw.updated_at !== null && "toISOString" in raw.updated_at
          ? (raw.updated_at as Date).toISOString()
          : String(raw.updated_at),
    };
  }

  private formatParticipant(raw: MeetingParticipantRecord): SafeMeetingParticipantDto {
    return {
      meeting_id: raw.meeting_id,
      participant_id: raw.participant_id,
      full_name: raw.full_name || "",
      email: raw.email || "",
      avatar_url: raw.avatar_url || null,
      role: raw.role || "Employee",
      created_at:
        typeof raw.created_at === "object" && raw.created_at !== null && "toISOString" in raw.created_at
          ? (raw.created_at as Date).toISOString()
          : String(raw.created_at),
    };
  }

  private formatAttendance(raw: MeetingAttendanceRecord): SafeMeetingAttendanceDto {
    return {
      meeting_id: raw.meeting_id,
      participant_id: raw.participant_id,
      participant_name: raw.participant_name || null,
      participant_email: raw.participant_email || null,
      participant_avatar: raw.participant_avatar || null,
      joined_at:
        raw.joined_at && typeof raw.joined_at === "object" && "toISOString" in raw.joined_at
          ? (raw.joined_at as Date).toISOString()
          : raw.joined_at
          ? String(raw.joined_at)
          : null,
      left_at:
        raw.left_at && typeof raw.left_at === "object" && "toISOString" in raw.left_at
          ? (raw.left_at as Date).toISOString()
          : raw.left_at
          ? String(raw.left_at)
          : null,
      status: raw.status,
      delay_minutes: Number(raw.delay_minutes) || 0,
    };
  }

  /**
   * Lists meetings accessible to the caller with pagination and filters.
   */
  async listMeetings(
    filter: MeetingListFilter,
    pagination: MeetingPaginationOptions,
    callerAuth: UserRoleInfo
  ): Promise<{ meetings: SafeMeetingDto[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const hasBroadView =
      callerAuth.isSuperAdmin ||
      callerAuth.isAdmin ||
      rbacService.hasPermission(callerAuth, "meetings.view") ||
      rbacService.hasPermission(callerAuth, "meetings.manage");

    const scopedUserId = hasBroadView ? null : callerAuth.userId;

    const page = Math.max(1, Math.floor(pagination.page || 1));
    const limit = Math.max(1, Math.min(100, Math.floor(pagination.limit || 20)));

    const { meetings, total } = await meetingRepository.listMeetings(filter, { page, limit }, scopedUserId);
    const formatted = meetings.map((m) => this.formatMeeting(m));
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      meetings: formatted,
      pagination: { page, limit, total, totalPages },
    };
  }

  /**
   * Retrieves a single meeting by ID after validating authorization.
   */
  async getMeetingById(id: string, callerAuth: UserRoleInfo): Promise<SafeMeetingDto> {
    if (!isValidUuid(id)) {
      throw new AppError("Invalid meeting ID format. Expected UUID.", 400, "INVALID_UUID");
    }

    const meeting = await meetingRepository.findById(id);
    if (!meeting) {
      throw new AppError("Meeting not found", 404, "MEETING_NOT_FOUND");
    }

    const isParticipant = await meetingRepository.isParticipant(id, callerAuth.userId);
    const authCheck = authorizationService.canAccessMeeting(callerAuth, meeting.organizer_id, isParticipant);
    if (!authCheck.allowed) {
      throw new AppError(authCheck.reason || "Forbidden: Access denied to this meeting", 403, "FORBIDDEN");
    }

    return this.formatMeeting(meeting);
  }

  /**
   * Creates a new meeting. Authenticated user becomes the organizer.
   */
  async createMeeting(
    payload: {
      title: string;
      description?: string | null;
      meeting_date: string;
      start_time: string;
      end_time: string;
      meeting_type?: string | null;
      external_meeting_url?: string | null;
      status?: string;
      participant_ids?: string[];
    },
    callerAuth: UserRoleInfo
  ): Promise<SafeMeetingDto> {
    // 1. Validation
    if (!payload.title || typeof payload.title !== "string" || !payload.title.trim()) {
      throw new AppError("Meeting title is required.", 400, "INVALID_TITLE");
    }
    if (payload.title.trim().length > 255) {
      throw new AppError("Meeting title cannot exceed 255 characters.", 400, "INVALID_TITLE_LENGTH");
    }

    if (!payload.meeting_date || !isValidDateString(payload.meeting_date)) {
      throw new AppError(
        "Invalid meeting_date. Expected format: YYYY-MM-DD.",
        400,
        "INVALID_DATE"
      );
    }

    const startTime = this.validateAndFormatTime(payload.start_time, "start_time");
    const endTime = this.validateAndFormatTime(payload.end_time, "end_time");

    if (!this.isStartTimeBeforeEndTime(startTime, endTime)) {
      throw new AppError(
        "Invalid meeting duration: start_time must be earlier than end_time.",
        400,
        "INVALID_TIME_RANGE"
      );
    }

    // 2. Validate participants if provided
    const validParticipantIds: string[] = [];
    if (payload.participant_ids && Array.isArray(payload.participant_ids)) {
      for (const pId of payload.participant_ids) {
        if (typeof pId === "string" && isValidUuid(pId.trim())) {
          validParticipantIds.push(pId.trim());
        }
      }
    }

    // 3. Create meeting record (always binding organizer_id to authenticated caller)
    const created = await meetingRepository.createMeeting({
      title: payload.title.trim(),
      description: payload.description ? payload.description.trim() : null,
      organizer_id: callerAuth.userId,
      meeting_date: payload.meeting_date.trim(),
      start_time: startTime,
      end_time: endTime,
      meeting_type: payload.meeting_type ? payload.meeting_type.trim() : null,
      external_meeting_url: payload.external_meeting_url ? payload.external_meeting_url.trim() : null,
      status: payload.status ? payload.status.trim() : "Scheduled",
      participant_ids: validParticipantIds,
    });

    // 4. Audit Log
    await auditRepository.log({
      actor_id: callerAuth.userId,
      action: "INSERT",
      table_name: "meetings",
      record_id: created.id,
      new_value: {
        title: created.title,
        organizer_id: created.organizer_id,
        meeting_date: created.meeting_date,
        start_time: created.start_time,
        end_time: created.end_time,
      },
    });

    // Notify participants
    if (validParticipantIds.length > 0) {
      try {
        for (const pId of validParticipantIds) {
          if (pId !== callerAuth.userId) {
            await notificationRepository.createNotification({
              user_id: pId,
              type: "meeting_scheduled",
              title: "Meeting Invitation",
              message: `You are invited to "${created.title}" on ${created.meeting_date} at ${created.start_time}.`,
              reference_id: created.id,
              reference_type: "meeting",
            });
          }
        }
      } catch (err) {
        console.warn("[NOTIFICATION] Could not dispatch meeting notifications to participants:", err);
      }
    }

    return this.formatMeeting(created);
  }

  /**
   * Updates an existing meeting.
   */
  async updateMeeting(
    id: string,
    payload: Record<string, any>,
    callerAuth: UserRoleInfo
  ): Promise<SafeMeetingDto> {
    if (!isValidUuid(id)) {
      throw new AppError("Invalid meeting ID format. Expected UUID.", 400, "INVALID_UUID");
    }

    const meeting = await meetingRepository.findById(id);
    if (!meeting) {
      throw new AppError("Meeting not found", 404, "MEETING_NOT_FOUND");
    }

    // Authorization: Only meeting organizer or management can update
    const authCheck = authorizationService.canManageMeeting(callerAuth, meeting.organizer_id);
    if (!authCheck.allowed) {
      throw new AppError(authCheck.reason || "Forbidden: Only meeting organizer or management can update this meeting.", 403, "FORBIDDEN");
    }

    const fieldsToUpdate: Record<string, any> = {};

    for (const [key, val] of Object.entries(payload)) {
      if (MEETING_ALLOWED_UPDATE_FIELDS.has(key)) {
        fieldsToUpdate[key] = val;
      }
    }

    if (Object.keys(fieldsToUpdate).length === 0) {
      return this.formatMeeting(meeting);
    }

    // Validate fields if supplied
    if (fieldsToUpdate.title !== undefined) {
      if (typeof fieldsToUpdate.title !== "string" || !fieldsToUpdate.title.trim()) {
        throw new AppError("Meeting title cannot be empty.", 400, "INVALID_TITLE");
      }
      fieldsToUpdate.title = fieldsToUpdate.title.trim();
    }

    if (fieldsToUpdate.meeting_date !== undefined) {
      if (!isValidDateString(fieldsToUpdate.meeting_date)) {
        throw new AppError("Invalid meeting_date. Expected format: YYYY-MM-DD.", 400, "INVALID_DATE");
      }
      fieldsToUpdate.meeting_date = fieldsToUpdate.meeting_date.trim();
    }

    const effectiveStart = fieldsToUpdate.start_time
      ? this.validateAndFormatTime(fieldsToUpdate.start_time, "start_time")
      : String(meeting.start_time).substring(0, 8);

    const effectiveEnd = fieldsToUpdate.end_time
      ? this.validateAndFormatTime(fieldsToUpdate.end_time, "end_time")
      : String(meeting.end_time).substring(0, 8);

    if (fieldsToUpdate.start_time !== undefined) {
      fieldsToUpdate.start_time = effectiveStart;
    }
    if (fieldsToUpdate.end_time !== undefined) {
      fieldsToUpdate.end_time = effectiveEnd;
    }

    if (!this.isStartTimeBeforeEndTime(effectiveStart, effectiveEnd)) {
      throw new AppError(
        "Invalid meeting duration: start_time must be earlier than end_time.",
        400,
        "INVALID_TIME_RANGE"
      );
    }

    const updated = await meetingRepository.updateMeeting(id, fieldsToUpdate);
    if (!updated) {
      throw new AppError("Failed to update meeting", 500, "UPDATE_FAILED");
    }

    // Audit Log
    await auditRepository.log({
      actor_id: callerAuth.userId,
      action: "UPDATE",
      table_name: "meetings",
      record_id: id,
      old_value: {
        title: meeting.title,
        meeting_date: meeting.meeting_date,
        start_time: meeting.start_time,
        end_time: meeting.end_time,
        status: meeting.status,
      },
      new_value: fieldsToUpdate,
    });

    return this.formatMeeting(updated);
  }

  /**
   * Lists participants enrolled in a meeting.
   */
  async getParticipants(meetingId: string, callerAuth: UserRoleInfo): Promise<SafeMeetingParticipantDto[]> {
    if (!isValidUuid(meetingId)) {
      throw new AppError("Invalid meeting ID format. Expected UUID.", 400, "INVALID_UUID");
    }

    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting) {
      throw new AppError("Meeting not found", 404, "MEETING_NOT_FOUND");
    }

    const isParticipant = await meetingRepository.isParticipant(meetingId, callerAuth.userId);
    const authCheck = authorizationService.canAccessMeeting(callerAuth, meeting.organizer_id, isParticipant);
    if (!authCheck.allowed) {
      throw new AppError(authCheck.reason || "Forbidden: Access denied to this meeting's participants", 403, "FORBIDDEN");
    }

    const participants = await meetingRepository.getParticipants(meetingId);
    return participants.map((p) => this.formatParticipant(p));
  }

  /**
   * Adds a participant to a meeting.
   */
  async addParticipant(
    meetingId: string,
    targetUserId: string,
    callerAuth: UserRoleInfo
  ): Promise<SafeMeetingParticipantDto> {
    if (!isValidUuid(meetingId)) {
      throw new AppError("Invalid meeting ID format. Expected UUID.", 400, "INVALID_UUID");
    }
    if (!isValidUuid(targetUserId)) {
      throw new AppError("Invalid user ID format. Expected UUID.", 400, "INVALID_UUID");
    }

    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting) {
      throw new AppError("Meeting not found", 404, "MEETING_NOT_FOUND");
    }

    // Authorization: Only meeting organizer or management can add participants
    const authCheck = authorizationService.canManageMeeting(callerAuth, meeting.organizer_id);
    if (!authCheck.allowed) {
      throw new AppError(authCheck.reason || "Forbidden: Only meeting organizer or management can add participants.", 403, "FORBIDDEN");
    }

    // Verify target user exists
    const targetUser = await userRepository.findById(targetUserId);
    if (!targetUser) {
      throw new AppError("Target user not found", 404, "USER_NOT_FOUND");
    }

    // Check if already enrolled
    const isAlreadyParticipant = await meetingRepository.isParticipant(meetingId, targetUserId);
    if (isAlreadyParticipant) {
      throw new AppError("User is already a participant of this meeting.", 409, "DUPLICATE_PARTICIPANT");
    }

    const participant = await meetingRepository.addParticipant(meetingId, targetUserId);

    // Audit Log
    await auditRepository.log({
      actor_id: callerAuth.userId,
      action: "INSERT",
      table_name: "meeting_participants",
      record_id: meetingId,
      new_value: { meeting_id: meetingId, participant_id: targetUserId },
    });

    return this.formatParticipant(participant);
  }

  /**
   * Removes a participant from a meeting.
   */
  async removeParticipant(
    meetingId: string,
    targetUserId: string,
    callerAuth: UserRoleInfo
  ): Promise<{ success: boolean; message: string }> {
    if (!isValidUuid(meetingId)) {
      throw new AppError("Invalid meeting ID format. Expected UUID.", 400, "INVALID_UUID");
    }
    if (!isValidUuid(targetUserId)) {
      throw new AppError("Invalid user ID format. Expected UUID.", 400, "INVALID_UUID");
    }

    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting) {
      throw new AppError("Meeting not found", 404, "MEETING_NOT_FOUND");
    }

    // Authorization: Only meeting organizer or management can remove participants
    const authCheck = authorizationService.canManageMeeting(callerAuth, meeting.organizer_id);
    if (!authCheck.allowed) {
      throw new AppError(authCheck.reason || "Forbidden: Only meeting organizer or management can remove participants.", 403, "FORBIDDEN");
    }

    const removed = await meetingRepository.removeParticipant(meetingId, targetUserId);
    if (!removed) {
      throw new AppError("Participant not found in this meeting", 404, "PARTICIPANT_NOT_FOUND");
    }

    // Audit Log
    await auditRepository.log({
      actor_id: callerAuth.userId,
      action: "DELETE",
      table_name: "meeting_participants",
      record_id: meetingId,
      old_value: { meeting_id: meetingId, participant_id: targetUserId },
    });

    return { success: true, message: "Participant removed successfully" };
  }

  /**
   * Retrieves attendance records for a meeting.
   */
  async getAttendance(meetingId: string, callerAuth: UserRoleInfo): Promise<SafeMeetingAttendanceDto[]> {
    if (!isValidUuid(meetingId)) {
      throw new AppError("Invalid meeting ID format. Expected UUID.", 400, "INVALID_UUID");
    }

    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting) {
      throw new AppError("Meeting not found", 404, "MEETING_NOT_FOUND");
    }

    const isParticipant = await meetingRepository.isParticipant(meetingId, callerAuth.userId);
    const authCheck = authorizationService.canAccessMeeting(callerAuth, meeting.organizer_id, isParticipant);
    if (!authCheck.allowed) {
      throw new AppError(authCheck.reason || "Forbidden: Access denied to this meeting's attendance records", 403, "FORBIDDEN");
    }

    const records = await meetingRepository.getAttendance(meetingId);
    return records.map((r) => this.formatAttendance(r));
  }

  /**
   * Records or updates attendance for a participant.
   */
  async recordAttendance(
    meetingId: string,
    targetUserId: string,
    payload: {
      joined_at?: Date | string | null;
      left_at?: Date | string | null;
      status?: "Present" | "Late" | "Absent" | "Excused" | null;
      delay_minutes?: number;
    },
    callerAuth: UserRoleInfo
  ): Promise<SafeMeetingAttendanceDto> {
    if (!isValidUuid(meetingId)) {
      throw new AppError("Invalid meeting ID format. Expected UUID.", 400, "INVALID_UUID");
    }
    if (!isValidUuid(targetUserId)) {
      throw new AppError("Invalid user ID format. Expected UUID.", 400, "INVALID_UUID");
    }

    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting) {
      throw new AppError("Meeting not found", 404, "MEETING_NOT_FOUND");
    }

    // Authorization: User marking self, or meeting organizer, or management
    const authCheck = authorizationService.canManageMeetingAttendance(callerAuth, meeting.organizer_id, targetUserId);
    if (!authCheck.allowed) {
      throw new AppError(authCheck.reason || "Forbidden: You cannot modify this user's meeting attendance.", 403, "FORBIDDEN");
    }

    // Security & Business Rule: Target user MUST be an enrolled participant
    const isEnrolled = await meetingRepository.isParticipant(meetingId, targetUserId);
    if (!isEnrolled) {
      throw new AppError("User is not an enrolled participant of this meeting.", 400, "USER_NOT_PARTICIPANT");
    }

    // Validate status if provided
    if (payload.status !== undefined && payload.status !== null) {
      if (!VALID_ATTENDANCE_STATUSES.has(payload.status)) {
        throw new AppError(
          `Invalid attendance status '${payload.status}'. Expected: Present, Late, Absent, Excused.`,
          400,
          "INVALID_STATUS"
        );
      }
    }

    // Validate delay_minutes if provided
    let delayMinutes = 0;
    if (payload.delay_minutes !== undefined) {
      const delay = Number(payload.delay_minutes);
      if (isNaN(delay) || delay < 0) {
        throw new AppError("delay_minutes must be a non-negative integer.", 400, "INVALID_DELAY_MINUTES");
      }
      delayMinutes = Math.floor(delay);
    }

    const record = await meetingRepository.recordAttendance({
      meeting_id: meetingId,
      participant_id: targetUserId,
      joined_at: payload.joined_at,
      left_at: payload.left_at,
      status: payload.status,
      delay_minutes: delayMinutes,
    });

    // Audit Log
    await auditRepository.log({
      actor_id: callerAuth.userId,
      action: "UPDATE",
      table_name: "meeting_attendance",
      record_id: meetingId,
      new_value: {
        meeting_id: meetingId,
        participant_id: targetUserId,
        status: record.status,
        delay_minutes: record.delay_minutes,
      },
    });

    return this.formatAttendance(record);
  }
}

export const meetingService = new MeetingService();
