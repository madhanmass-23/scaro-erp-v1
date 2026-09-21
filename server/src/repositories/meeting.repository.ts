import { query, queryOne, execute, withTransaction } from "../utils/database.util.js";
import crypto from "crypto";

export interface MeetingRecord {
  id: string;
  title: string;
  description: string | null;
  organizer_id: string;
  organizer_name?: string;
  organizer_email?: string;
  organizer_avatar?: string | null;
  meeting_date: string;
  start_time: string;
  end_time: string;
  meeting_type: string | null;
  external_meeting_url: string | null;
  status: string;
  participant_count?: number;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface MeetingParticipantRecord {
  meeting_id: string;
  participant_id: string;
  full_name?: string;
  email?: string;
  avatar_url?: string | null;
  role?: string;
  created_at: Date | string;
}

export interface MeetingAttendanceRecord {
  meeting_id: string;
  participant_id: string;
  participant_name?: string;
  participant_email?: string;
  participant_avatar?: string | null;
  joined_at: Date | string | null;
  left_at: Date | string | null;
  status: "Present" | "Late" | "Absent" | "Excused" | null;
  delay_minutes: number;
}

export interface MeetingListFilter {
  date?: string;
  from?: string;
  to?: string;
  status?: string;
  search?: string;
}

export interface MeetingPaginationOptions {
  page: number;
  limit: number;
}

export class MeetingRepository {
  /**
   * Finds a meeting by ID with joined organizer info.
   */
  async findById(id: string): Promise<MeetingRecord | null> {
    const sql = `
      SELECT 
        m.id,
        m.title,
        m.description,
        m.organizer_id,
        p.full_name AS organizer_name,
        p.email AS organizer_email,
        p.avatar_url AS organizer_avatar,
        DATE_FORMAT(m.meeting_date, '%Y-%m-%d') AS meeting_date,
        m.start_time,
        m.end_time,
        m.meeting_type,
        m.external_meeting_url,
        m.status,
        (SELECT COUNT(*) FROM meeting_participants mp WHERE mp.meeting_id = m.id) AS participant_count,
        m.created_at,
        m.updated_at
      FROM meetings m
      JOIN profiles p ON m.organizer_id = p.id
      WHERE m.id = ?
      LIMIT 1
    `;
    return queryOne<MeetingRecord>(sql, [id]);
  }

  /**
   * Lists meetings accessible to a user (or all meetings for management).
   */
  async listMeetings(
    filter: MeetingListFilter,
    pagination: MeetingPaginationOptions,
    scopedUserId?: string | null
  ): Promise<{ meetings: MeetingRecord[]; total: number }> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (scopedUserId) {
      conditions.push(`(
        m.organizer_id = ? OR EXISTS (
          SELECT 1 FROM meeting_participants mp WHERE mp.meeting_id = m.id AND mp.participant_id = ?
        )
      )`);
      params.push(scopedUserId, scopedUserId);
    }

    if (filter.date) {
      conditions.push("m.meeting_date = ?");
      params.push(filter.date);
    }
    if (filter.from) {
      conditions.push("m.meeting_date >= ?");
      params.push(filter.from);
    }
    if (filter.to) {
      conditions.push("m.meeting_date <= ?");
      params.push(filter.to);
    }
    if (filter.status) {
      conditions.push("m.status = ?");
      params.push(filter.status);
    }
    if (filter.search) {
      conditions.push("(m.title LIKE ? OR m.description LIKE ?)");
      const term = `%${filter.search}%`;
      params.push(term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // 1. Total count
    const countSql = `SELECT COUNT(*) AS total FROM meetings m ${whereClause}`;
    const countRow = await queryOne<{ total: number }>(countSql, params);
    const total = countRow ? Number(countRow.total) : 0;

    // 2. Paginated rows
    const page = Math.max(1, pagination.page);
    const limit = Math.max(1, Math.min(100, pagination.limit));
    const offset = (page - 1) * limit;

    const dataSql = `
      SELECT 
        m.id,
        m.title,
        m.description,
        m.organizer_id,
        p.full_name AS organizer_name,
        p.email AS organizer_email,
        p.avatar_url AS organizer_avatar,
        DATE_FORMAT(m.meeting_date, '%Y-%m-%d') AS meeting_date,
        m.start_time,
        m.end_time,
        m.meeting_type,
        m.external_meeting_url,
        m.status,
        (SELECT COUNT(*) FROM meeting_participants mp WHERE mp.meeting_id = m.id) AS participant_count,
        m.created_at,
        m.updated_at
      FROM meetings m
      JOIN profiles p ON m.organizer_id = p.id
      ${whereClause}
      ORDER BY m.meeting_date DESC, m.start_time DESC
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...params, limit, offset];
    const meetings = await query<MeetingRecord>(dataSql, dataParams);

    return { meetings, total };
  }

  /**
   * Creates a new meeting.
   */
  async createMeeting(data: {
    id?: string;
    title: string;
    description?: string | null;
    organizer_id: string;
    meeting_date: string;
    start_time: string;
    end_time: string;
    meeting_type?: string | null;
    external_meeting_url?: string | null;
    status?: string;
    participant_ids?: string[];
  }): Promise<MeetingRecord> {
    const meetingId = data.id || crypto.randomUUID();
    const status = data.status || "Scheduled";

    return withTransaction(async (conn) => {
      const insertSql = `
        INSERT INTO meetings (
          id, title, description, organizer_id, meeting_date,
          start_time, end_time, meeting_type, external_meeting_url, status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6))
      `;

      await conn.execute(insertSql, [
        meetingId,
        data.title,
        data.description || null,
        data.organizer_id,
        data.meeting_date,
        data.start_time,
        data.end_time,
        data.meeting_type || null,
        data.external_meeting_url || null,
        status,
      ]);

      // Automatically enroll organizer and any provided participants
      const participantsToEnroll = new Set<string>([data.organizer_id]);
      if (data.participant_ids && Array.isArray(data.participant_ids)) {
        for (const pId of data.participant_ids) {
          if (pId) participantsToEnroll.add(pId);
        }
      }

      for (const pId of participantsToEnroll) {
        const pSql = `
          INSERT IGNORE INTO meeting_participants (meeting_id, participant_id, created_at)
          VALUES (?, ?, CURRENT_TIMESTAMP(6))
        `;
        await conn.execute(pSql, [meetingId, pId]);
      }

      const fetchSql = `
        SELECT 
          m.id,
          m.title,
          m.description,
          m.organizer_id,
          p.full_name AS organizer_name,
          p.email AS organizer_email,
          p.avatar_url AS organizer_avatar,
          DATE_FORMAT(m.meeting_date, '%Y-%m-%d') AS meeting_date,
          m.start_time,
          m.end_time,
          m.meeting_type,
          m.external_meeting_url,
          m.status,
          (SELECT COUNT(*) FROM meeting_participants mp WHERE mp.meeting_id = m.id) AS participant_count,
          m.created_at,
          m.updated_at
        FROM meetings m
        JOIN profiles p ON m.organizer_id = p.id
        WHERE m.id = ?
        LIMIT 1
      `;
      const [rows] = await conn.query(fetchSql, [meetingId]);
      const created = (rows as MeetingRecord[])[0];
      if (!created) {
        throw new Error("Failed to retrieve created meeting");
      }
      return created;
    });
  }

  /**
   * Updates meeting fields.
   */
  async updateMeeting(id: string, fields: Record<string, any>): Promise<MeetingRecord | null> {
    const keys = Object.keys(fields);
    if (keys.length === 0) {
      return this.findById(id);
    }

    const setClauses: string[] = [];
    const params: any[] = [];

    for (const key of keys) {
      setClauses.push(`\`${key}\` = ?`);
      params.push(fields[key]);
    }

    setClauses.push("`updated_at` = CURRENT_TIMESTAMP(6)");
    params.push(id);

    const updateSql = `UPDATE meetings SET ${setClauses.join(", ")} WHERE id = ?`;
    await execute(updateSql, params);

    return this.findById(id);
  }

  /**
   * Checks if a user is a participant of a meeting.
   */
  async isParticipant(meetingId: string, userId: string): Promise<boolean> {
    const sql = `
      SELECT 1 FROM meeting_participants
      WHERE meeting_id = ? AND participant_id = ?
      LIMIT 1
    `;
    const row = await queryOne<{ 1: number }>(sql, [meetingId, userId]);
    return row !== null;
  }

  /**
   * Retrieves all participants of a meeting.
   */
  async getParticipants(meetingId: string): Promise<MeetingParticipantRecord[]> {
    const sql = `
      SELECT 
        mp.meeting_id,
        mp.participant_id,
        p.full_name,
        p.email,
        p.avatar_url,
        COALESCE(r.name, 'Employee') AS role,
        mp.created_at
      FROM meeting_participants mp
      JOIN profiles p ON mp.participant_id = p.id
      LEFT JOIN user_roles ur ON p.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE mp.meeting_id = ?
      ORDER BY p.full_name ASC
    `;
    return query<MeetingParticipantRecord>(sql, [meetingId]);
  }

  /**
   * Adds a participant to a meeting.
   */
  async addParticipant(meetingId: string, participantId: string): Promise<MeetingParticipantRecord> {
    const sql = `
      INSERT INTO meeting_participants (meeting_id, participant_id, created_at)
      VALUES (?, ?, CURRENT_TIMESTAMP(6))
    `;
    await execute(sql, [meetingId, participantId]);

    const fetchSql = `
      SELECT 
        mp.meeting_id,
        mp.participant_id,
        p.full_name,
        p.email,
        p.avatar_url,
        COALESCE(r.name, 'Employee') AS role,
        mp.created_at
      FROM meeting_participants mp
      JOIN profiles p ON mp.participant_id = p.id
      LEFT JOIN user_roles ur ON p.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE mp.meeting_id = ? AND mp.participant_id = ?
      LIMIT 1
    `;
    const participant = await queryOne<MeetingParticipantRecord>(fetchSql, [meetingId, participantId]);
    if (!participant) {
      throw new Error("Failed to retrieve added participant");
    }
    return participant;
  }

  /**
   * Removes a participant from a meeting.
   */
  async removeParticipant(meetingId: string, participantId: string): Promise<boolean> {
    const sql = `DELETE FROM meeting_participants WHERE meeting_id = ? AND participant_id = ?`;
    const res = await execute(sql, [meetingId, participantId]);
    return res.affectedRows > 0;
  }

  /**
   * Retrieves meeting attendance records.
   */
  async getAttendance(meetingId: string): Promise<MeetingAttendanceRecord[]> {
    const sql = `
      SELECT 
        ma.meeting_id,
        ma.participant_id,
        p.full_name AS participant_name,
        p.email AS participant_email,
        p.avatar_url AS participant_avatar,
        ma.joined_at,
        ma.left_at,
        ma.status,
        ma.delay_minutes
      FROM meeting_attendance ma
      JOIN profiles p ON ma.participant_id = p.id
      WHERE ma.meeting_id = ?
      ORDER BY p.full_name ASC
    `;
    return query<MeetingAttendanceRecord>(sql, [meetingId]);
  }

  /**
   * Records or updates meeting attendance.
   */
  async recordAttendance(data: {
    meeting_id: string;
    participant_id: string;
    joined_at?: Date | string | null;
    left_at?: Date | string | null;
    status?: "Present" | "Late" | "Absent" | "Excused" | null;
    delay_minutes?: number;
  }): Promise<MeetingAttendanceRecord> {
    const sql = `
      INSERT INTO meeting_attendance (
        meeting_id, participant_id, joined_at, left_at, status, delay_minutes
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        joined_at = VALUES(joined_at),
        left_at = VALUES(left_at),
        status = VALUES(status),
        delay_minutes = VALUES(delay_minutes)
    `;

    await execute(sql, [
      data.meeting_id,
      data.participant_id,
      data.joined_at || null,
      data.left_at || null,
      data.status || "Present",
      data.delay_minutes !== undefined ? data.delay_minutes : 0,
    ]);

    const fetchSql = `
      SELECT 
        ma.meeting_id,
        ma.participant_id,
        p.full_name AS participant_name,
        p.email AS participant_email,
        p.avatar_url AS participant_avatar,
        ma.joined_at,
        ma.left_at,
        ma.status,
        ma.delay_minutes
      FROM meeting_attendance ma
      JOIN profiles p ON ma.participant_id = p.id
      WHERE ma.meeting_id = ? AND ma.participant_id = ?
      LIMIT 1
    `;
    const record = await queryOne<MeetingAttendanceRecord>(fetchSql, [data.meeting_id, data.participant_id]);
    if (!record) {
      throw new Error("Failed to retrieve recorded meeting attendance");
    }
    return record;
  }
}

export const meetingRepository = new MeetingRepository();
