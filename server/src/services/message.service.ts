import {
  messageRepository,
  MessageRecord,
  ConversationSummaryRecord,
  MessageListFilter,
  MessagePaginationOptions,
} from "../repositories/message.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { notificationRepository } from "../repositories/notification.repository.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { authorizationService } from "./authorization.service.js";
import { UserRoleInfo, rbacService } from "./rbac.service.js";
import { AppError } from "../types/api.types.js";
import { isValidUuid } from "../utils/validation.util.js";

export interface SafeMessageDto {
  id: string;
  sender: {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
    role: string;
  };
  recipient: {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
    role: string;
  } | null;
  task_id: string | null;
  task_title: string | null;
  content: string;
  is_read: boolean;
  created_at: string;
}

export interface SafeConversationDto {
  peer: {
    id: string;
    full_name: string;
    email: string;
    avatar_url: string | null;
    role: string;
  };
  last_message: {
    content: string;
    created_at: string;
    sender_id: string;
  };
  unread_count: number;
}

export class MessageService {
  private formatMessage(raw: MessageRecord): SafeMessageDto {
    return {
      id: raw.id,
      sender: {
        id: raw.sender_id,
        full_name: raw.sender_name || null,
        email: raw.sender_email || null,
        avatar_url: raw.sender_avatar || null,
        role: raw.sender_role || "Employee",
      },
      recipient: raw.recipient_id
        ? {
            id: raw.recipient_id,
            full_name: raw.recipient_name || null,
            email: raw.recipient_email || null,
            avatar_url: raw.recipient_avatar || null,
            role: raw.recipient_role || "Employee",
          }
        : null,
      task_id: raw.task_id || null,
      task_title: raw.task_title || null,
      content: raw.content,
      is_read: raw.is_read === 1 || raw.is_read === true,
      created_at:
        typeof raw.created_at === "object" && raw.created_at !== null && "toISOString" in raw.created_at
          ? (raw.created_at as Date).toISOString()
          : String(raw.created_at),
    };
  }

  private formatConversation(raw: ConversationSummaryRecord): SafeConversationDto {
    return {
      peer: {
        id: raw.peer_id,
        full_name: raw.peer_name,
        email: raw.peer_email,
        avatar_url: raw.peer_avatar,
        role: raw.peer_role,
      },
      last_message: {
        content: raw.last_message_content,
        created_at:
          typeof raw.last_message_created_at === "object" &&
          raw.last_message_created_at !== null &&
          "toISOString" in raw.last_message_created_at
            ? (raw.last_message_created_at as Date).toISOString()
            : String(raw.last_message_created_at),
        sender_id: raw.last_message_sender_id,
      },
      unread_count: Number(raw.unread_count) || 0,
    };
  }

  /**
   * Lists messages involving the authenticated user.
   */
  async listMessages(
    filter: MessageListFilter,
    pagination: MessagePaginationOptions,
    callerAuth: UserRoleInfo
  ): Promise<{ messages: SafeMessageDto[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const page = Math.max(1, Math.floor(pagination.page || 1));
    const limit = Math.max(1, Math.min(100, Math.floor(pagination.limit || 20)));

    const { messages, total } = await messageRepository.listMessages(filter, { page, limit }, callerAuth.userId);
    const formatted = messages.map((m) => this.formatMessage(m));
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      messages: formatted,
      pagination: { page, limit, total, totalPages },
    };
  }

  /**
   * Lists all conversation summaries for the authenticated user.
   */
  async listConversations(callerAuth: UserRoleInfo): Promise<SafeConversationDto[]> {
    const conversations = await messageRepository.listConversations(callerAuth.userId);
    return conversations.map((c) => this.formatConversation(c));
  }

  /**
   * Retrieves messages for a specific conversation thread with a peer.
   */
  async getConversationMessages(
    peerId: string,
    pagination: MessagePaginationOptions,
    callerAuth: UserRoleInfo
  ): Promise<{ messages: SafeMessageDto[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    if (!isValidUuid(peerId)) {
      throw new AppError("Invalid peer user ID format. Expected UUID.", 400, "INVALID_UUID");
    }

    const peer = await userRepository.findById(peerId);
    if (!peer) {
      throw new AppError("Target user not found", 404, "USER_NOT_FOUND");
    }

    const page = Math.max(1, Math.floor(pagination.page || 1));
    const limit = Math.max(1, Math.min(100, Math.floor(pagination.limit || 50)));

    const { messages, total } = await messageRepository.getConversationMessages(callerAuth.userId, peerId, { page, limit });
    const formatted = messages.map((m) => this.formatMessage(m));
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      messages: formatted,
      pagination: { page, limit, total, totalPages },
    };
  }

  /**
   * Retrieves a single message by ID with authorization checks.
   */
  async getMessageById(id: string, callerAuth: UserRoleInfo): Promise<SafeMessageDto> {
    if (!isValidUuid(id)) {
      throw new AppError("Invalid message ID format. Expected UUID.", 400, "INVALID_UUID");
    }

    const message = await messageRepository.findById(id);
    if (!message) {
      throw new AppError("Message not found", 404, "MESSAGE_NOT_FOUND");
    }

    const authCheck = authorizationService.canViewMessage(callerAuth, message.sender_id, message.recipient_id);
    if (!authCheck.allowed) {
      throw new AppError(authCheck.reason || "Forbidden: You are not authorized to view this message.", 403, "FORBIDDEN");
    }

    return this.formatMessage(message);
  }

  /**
   * Sends a new message enforcing directional messaging RBAC policies.
   */
  async sendMessage(
    payload: {
      recipient_id?: string | null;
      task_id?: string | null;
      content: string;
    },
    callerAuth: UserRoleInfo
  ): Promise<SafeMessageDto> {
    // 1. Content validation
    if (!payload.content || typeof payload.content !== "string" || !payload.content.trim()) {
      throw new AppError("Message content cannot be empty.", 400, "INVALID_CONTENT");
    }
    if (payload.content.trim().length > 5000) {
      throw new AppError("Message content exceeds maximum allowed length of 5000 characters.", 400, "MESSAGE_TOO_LONG");
    }

    const cleanContent = payload.content.trim();

    // 2. Target validation (recipient_id or task_id required)
    if (!payload.recipient_id && !payload.task_id) {
      throw new AppError("Message target required: recipient_id or task_id must be provided.", 400, "TARGET_REQUIRED");
    }

    let recipientId: string | null = null;
    let taskId: string | null = null;

    if (payload.recipient_id) {
      if (!isValidUuid(payload.recipient_id)) {
        throw new AppError("Invalid recipient_id format. Expected UUID.", 400, "INVALID_UUID");
      }
      recipientId = payload.recipient_id.trim();

      // Prevent messaging self
      if (recipientId === callerAuth.userId) {
        throw new AppError("Cannot send a direct message to yourself.", 400, "SELF_MESSAGE_FORBIDDEN");
      }

      // 3. Resolve recipient and recipient role
      const recipient = await userRepository.findById(recipientId);
      if (!recipient) {
        throw new AppError("Target recipient user not found", 404, "RECIPIENT_NOT_FOUND");
      }

      const recipientAuth = await rbacService.getUserRoleAndPermissions(recipientId);

      // 4. CRITICAL DIRECTIONAL MESSAGING RBAC CHECK
      const canSend = authorizationService.canSendMessage(callerAuth.role, recipientAuth.role);
      if (!canSend.allowed) {
        throw new AppError(
          canSend.reason || `Users with role '${callerAuth.role}' are not permitted to message users with role '${recipientAuth.role}'.`,
          403,
          "FORBIDDEN_MESSAGE_DIRECTION"
        );
      }
    }

    if (payload.task_id) {
      if (!isValidUuid(payload.task_id)) {
        throw new AppError("Invalid task_id format. Expected UUID.", 400, "INVALID_UUID");
      }
      taskId = payload.task_id.trim();
    }

    // 5. Create Message in Database (sender_id is ALWAYS bound to callerAuth.userId)
    const created = await messageRepository.createMessage({
      sender_id: callerAuth.userId,
      recipient_id: recipientId,
      task_id: taskId,
      content: cleanContent,
    });

    // 6. Generate Notification for recipient if direct message
    if (recipientId) {
      try {
        await notificationRepository.createNotification({
          user_id: recipientId,
          type: "message",
          title: "New Message",
          message: cleanContent.length > 80 ? `${cleanContent.substring(0, 77)}...` : cleanContent,
          reference_id: created.id,
          reference_type: "messages",
        });
      } catch (err) {
        console.warn("[NOTIFICATION] Could not create recipient notification:", err);
      }
    }

    // 7. Audit Log
    await auditRepository.log({
      actor_id: callerAuth.userId,
      action: "INSERT",
      table_name: "messages",
      record_id: created.id,
      new_value: {
        sender_id: created.sender_id,
        recipient_id: created.recipient_id,
        task_id: created.task_id,
      },
    });

    return this.formatMessage(created);
  }

  /**
   * Marks a single message as read by the recipient.
   */
  async markAsRead(messageId: string, callerAuth: UserRoleInfo): Promise<boolean> {
    if (!isValidUuid(messageId)) {
      throw new AppError("Invalid message ID format. Expected UUID.", 400, "INVALID_UUID");
    }

    const message = await messageRepository.findById(messageId);
    if (!message) {
      throw new AppError("Message not found", 404, "MESSAGE_NOT_FOUND");
    }

    if (message.recipient_id !== callerAuth.userId) {
      throw new AppError("Forbidden: Only the intended recipient can mark this message as read.", 403, "FORBIDDEN");
    }

    return messageRepository.markAsRead(messageId, callerAuth.userId);
  }

  /**
   * Marks all messages in a conversation as read.
   */
  async markConversationAsRead(peerId: string, callerAuth: UserRoleInfo): Promise<{ updated_count: number }> {
    if (!isValidUuid(peerId)) {
      throw new AppError("Invalid peer user ID format. Expected UUID.", 400, "INVALID_UUID");
    }

    const count = await messageRepository.markConversationAsRead(callerAuth.userId, peerId);
    return { updated_count: count };
  }
}

export const messageService = new MessageService();
