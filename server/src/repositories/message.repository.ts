import { query, queryOne, execute } from "../utils/database.util.js";
import crypto from "crypto";

export interface MessageRecord {
  id: string;
  sender_id: string;
  sender_name?: string;
  sender_email?: string;
  sender_avatar?: string | null;
  sender_role?: string;
  recipient_id: string | null;
  recipient_name?: string | null;
  recipient_email?: string | null;
  recipient_avatar?: string | null;
  recipient_role?: string | null;
  task_id: string | null;
  task_title?: string | null;
  content: string;
  is_read: number | boolean;
  created_at: Date | string;
}

export interface ConversationSummaryRecord {
  peer_id: string;
  peer_name: string;
  peer_email: string;
  peer_avatar: string | null;
  peer_role: string;
  last_message_content: string;
  last_message_created_at: Date | string;
  last_message_sender_id: string;
  unread_count: number;
}

export interface MessageListFilter {
  recipient_id?: string;
  peer_id?: string;
  task_id?: string;
  is_read?: boolean;
  search?: string;
}

export interface MessagePaginationOptions {
  page: number;
  limit: number;
}

export class MessageRepository {
  /**
   * Finds a single message by ID with sender, recipient, and task metadata.
   */
  async findById(id: string): Promise<MessageRecord | null> {
    const sql = `
      SELECT 
        m.id,
        m.sender_id,
        s.full_name AS sender_name,
        s.email AS sender_email,
        s.avatar_url AS sender_avatar,
        COALESCE(sr.name, 'Employee') AS sender_role,
        m.recipient_id,
        r.full_name AS recipient_name,
        r.email AS recipient_email,
        r.avatar_url AS recipient_avatar,
        COALESCE(rr.name, 'Employee') AS recipient_role,
        m.task_id,
        t.title AS task_title,
        m.content,
        m.is_read,
        m.created_at
      FROM messages m
      JOIN profiles s ON m.sender_id = s.id
      LEFT JOIN user_roles sur ON s.id = sur.user_id
      LEFT JOIN roles sr ON sur.role_id = sr.id
      LEFT JOIN profiles r ON m.recipient_id = r.id
      LEFT JOIN user_roles rur ON r.id = rur.user_id
      LEFT JOIN roles rr ON rur.role_id = rr.id
      LEFT JOIN tasks t ON m.task_id = t.id
      WHERE m.id = ?
      LIMIT 1
    `;
    return queryOne<MessageRecord>(sql, [id]);
  }

  /**
   * Lists messages involving a specific user, with optional filters and pagination.
   */
  async listMessages(
    filter: MessageListFilter,
    pagination: MessagePaginationOptions,
    userId: string
  ): Promise<{ messages: MessageRecord[]; total: number }> {
    const conditions: string[] = ["(m.sender_id = ? OR m.recipient_id = ?)"];
    const params: (string | number)[] = [userId, userId];

    if (filter.peer_id) {
      conditions.push("((m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?))");
      params.push(userId, filter.peer_id, filter.peer_id, userId);
    }
    if (filter.recipient_id) {
      conditions.push("m.recipient_id = ?");
      params.push(filter.recipient_id);
    }
    if (filter.task_id) {
      conditions.push("m.task_id = ?");
      params.push(filter.task_id);
    }
    if (filter.is_read !== undefined) {
      conditions.push("m.is_read = ?");
      params.push(filter.is_read ? 1 : 0);
    }
    if (filter.search) {
      conditions.push("m.content LIKE ?");
      params.push(`%${filter.search}%`);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    // 1. Total count
    const countSql = `SELECT COUNT(*) AS total FROM messages m ${whereClause}`;
    const countRow = await queryOne<{ total: number }>(countSql, params);
    const total = countRow ? Number(countRow.total) : 0;

    // 2. Paginated rows
    const page = Math.max(1, pagination.page);
    const limit = Math.max(1, Math.min(100, pagination.limit));
    const offset = (page - 1) * limit;

    const dataSql = `
      SELECT 
        m.id,
        m.sender_id,
        s.full_name AS sender_name,
        s.email AS sender_email,
        s.avatar_url AS sender_avatar,
        COALESCE(sr.name, 'Employee') AS sender_role,
        m.recipient_id,
        r.full_name AS recipient_name,
        r.email AS recipient_email,
        r.avatar_url AS recipient_avatar,
        COALESCE(rr.name, 'Employee') AS recipient_role,
        m.task_id,
        t.title AS task_title,
        m.content,
        m.is_read,
        m.created_at
      FROM messages m
      JOIN profiles s ON m.sender_id = s.id
      LEFT JOIN user_roles sur ON s.id = sur.user_id
      LEFT JOIN roles sr ON sur.role_id = sr.id
      LEFT JOIN profiles r ON m.recipient_id = r.id
      LEFT JOIN user_roles rur ON r.id = rur.user_id
      LEFT JOIN roles rr ON rur.role_id = rr.id
      LEFT JOIN tasks t ON m.task_id = t.id
      ${whereClause}
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...params, limit, offset];
    const messages = await query<MessageRecord>(dataSql, dataParams);

    return { messages, total };
  }

  /**
   * Retrieves conversation summaries for the user grouped by peer.
   */
  async listConversations(userId: string): Promise<ConversationSummaryRecord[]> {
    const sql = `
      WITH UserMessages AS (
        SELECT 
          m.id,
          m.sender_id,
          m.recipient_id,
          CASE WHEN m.sender_id = ? THEN m.recipient_id ELSE m.sender_id END AS peer_id,
          m.content,
          m.is_read,
          m.created_at,
          ROW_NUMBER() OVER (
            PARTITION BY CASE WHEN m.sender_id = ? THEN m.recipient_id ELSE m.sender_id END
            ORDER BY m.created_at DESC
          ) AS rn
        FROM messages m
        WHERE (m.sender_id = ? OR m.recipient_id = ?) AND m.recipient_id IS NOT NULL
      )
      SELECT 
        um.peer_id,
        p.full_name AS peer_name,
        p.email AS peer_email,
        p.avatar_url AS peer_avatar,
        COALESCE(r.name, 'Employee') AS peer_role,
        um.content AS last_message_content,
        um.created_at AS last_message_created_at,
        um.sender_id AS last_message_sender_id,
        (
          SELECT COUNT(*) 
          FROM messages unread_m 
          WHERE unread_m.sender_id = um.peer_id 
            AND unread_m.recipient_id = ? 
            AND unread_m.is_read = 0
        ) AS unread_count
      FROM UserMessages um
      JOIN profiles p ON um.peer_id = p.id
      LEFT JOIN user_roles ur ON p.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE um.rn = 1
      ORDER BY um.created_at DESC
    `;
    return query<ConversationSummaryRecord>(sql, [userId, userId, userId, userId, userId]);
  }

  /**
   * Retrieves messages for a specific conversation thread between two users.
   */
  async getConversationMessages(
    userId: string,
    peerId: string,
    pagination: MessagePaginationOptions
  ): Promise<{ messages: MessageRecord[]; total: number }> {
    const countSql = `
      SELECT COUNT(*) AS total 
      FROM messages m 
      WHERE (m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?)
    `;
    const countRow = await queryOne<{ total: number }>(countSql, [userId, peerId, peerId, userId]);
    const total = countRow ? Number(countRow.total) : 0;

    const page = Math.max(1, pagination.page);
    const limit = Math.max(1, Math.min(100, pagination.limit));
    const offset = (page - 1) * limit;

    const dataSql = `
      SELECT 
        m.id,
        m.sender_id,
        s.full_name AS sender_name,
        s.email AS sender_email,
        s.avatar_url AS sender_avatar,
        COALESCE(sr.name, 'Employee') AS sender_role,
        m.recipient_id,
        r.full_name AS recipient_name,
        r.email AS recipient_email,
        r.avatar_url AS recipient_avatar,
        COALESCE(rr.name, 'Employee') AS recipient_role,
        m.task_id,
        t.title AS task_title,
        m.content,
        m.is_read,
        m.created_at
      FROM messages m
      JOIN profiles s ON m.sender_id = s.id
      LEFT JOIN user_roles sur ON s.id = sur.user_id
      LEFT JOIN roles sr ON sur.role_id = sr.id
      LEFT JOIN profiles r ON m.recipient_id = r.id
      LEFT JOIN user_roles rur ON r.id = rur.user_id
      LEFT JOIN roles rr ON rur.role_id = rr.id
      LEFT JOIN tasks t ON m.task_id = t.id
      WHERE (m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?)
      ORDER BY m.created_at ASC
      LIMIT ? OFFSET ?
    `;
    const messages = await query<MessageRecord>(dataSql, [userId, peerId, peerId, userId, limit, offset]);

    return { messages, total };
  }

  /**
   * Inserts a new message.
   */
  async createMessage(data: {
    id?: string;
    sender_id: string;
    recipient_id?: string | null;
    task_id?: string | null;
    content: string;
  }): Promise<MessageRecord> {
    const messageId = data.id || crypto.randomUUID();

    const sql = `
      INSERT INTO messages (
        id, sender_id, recipient_id, task_id, content, is_read, created_at
      ) VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP(6))
    `;

    await execute(sql, [
      messageId,
      data.sender_id,
      data.recipient_id || null,
      data.task_id || null,
      data.content,
    ]);

    const created = await this.findById(messageId);
    if (!created) {
      throw new Error("Failed to retrieve created message");
    }
    return created;
  }

  /**
   * Marks a single message as read (only if recipient matches).
   */
  async markAsRead(messageId: string, recipientId: string): Promise<boolean> {
    const sql = `UPDATE messages SET is_read = 1 WHERE id = ? AND recipient_id = ?`;
    const result = await execute(sql, [messageId, recipientId]);
    return result.affectedRows > 0;
  }

  /**
   * Marks all messages from a specific sender to a recipient as read.
   */
  async markConversationAsRead(recipientId: string, senderId: string): Promise<number> {
    const sql = `UPDATE messages SET is_read = 1 WHERE recipient_id = ? AND sender_id = ? AND is_read = 0`;
    const result = await execute(sql, [recipientId, senderId]);
    return result.affectedRows;
  }
}

export const messageRepository = new MessageRepository();
