/**
 * Messages API Service for SCARO ERP Frontend.
 * 
 * Interacts with Node.js/Express `/api/v1/messages` endpoints backed by MariaDB.
 */

import { api } from '../../lib/api';

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

export interface MessageListFilter {
  peer_id?: string;
  task_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface SendMessagePayload {
  recipient_id?: string | null;
  task_id?: string | null;
  content: string;
}

export const messageApi = {
  /**
   * Lists messages involving the authenticated user with optional filtering.
   * Calls GET /api/v1/messages
   */
  async getMessages(filter?: MessageListFilter): Promise<SafeMessageDto[]> {
    const params: Record<string, string | number | boolean | undefined | null> = {};
    if (filter) {
      if (filter.peer_id) params.peer_id = filter.peer_id;
      if (filter.task_id) params.task_id = filter.task_id;
      if (filter.search) params.search = filter.search;
      if (filter.page) params.page = filter.page;
      if (filter.limit) params.limit = filter.limit;
    }

    const data = await api.get<SafeMessageDto[] | { messages: SafeMessageDto[] }>('/messages', { params });
    if (Array.isArray(data)) {
      return data;
    }
    if (data && typeof data === 'object' && 'messages' in data && Array.isArray((data as { messages: SafeMessageDto[] }).messages)) {
      return (data as { messages: SafeMessageDto[] }).messages;
    }
    return [];
  },

  /**
   * Lists conversation summaries for the authenticated user.
   * Calls GET /api/v1/messages/conversations
   */
  async getConversations(): Promise<SafeConversationDto[]> {
    const data = await api.get<SafeConversationDto[]>('/messages/conversations');
    return Array.isArray(data) ? data : [];
  },

  /**
   * Retrieves messages for a specific conversation with a peer.
   * Calls GET /api/v1/messages/conversations/:peerId
   */
  async getConversationMessages(peerId: string, options?: { page?: number; limit?: number }): Promise<SafeMessageDto[]> {
    const params: Record<string, string | number | boolean | undefined | null> = {};
    if (options?.page) params.page = options.page;
    if (options?.limit) params.limit = options.limit;

    const data = await api.get<SafeMessageDto[] | { messages: SafeMessageDto[] }>(`/messages/conversations/${peerId}`, { params });
    if (Array.isArray(data)) {
      return data;
    }
    if (data && typeof data === 'object' && 'messages' in data && Array.isArray((data as { messages: SafeMessageDto[] }).messages)) {
      return (data as { messages: SafeMessageDto[] }).messages;
    }
    return [];
  },

  /**
   * Retrieves a single message by ID.
   * Calls GET /api/v1/messages/:id
   */
  async getMessageById(id: string): Promise<SafeMessageDto> {
    return api.get<SafeMessageDto>(`/messages/${id}`);
  },

  /**
   * Sends a new direct or task message.
   * Calls POST /api/v1/messages
   */
  async sendMessage(payload: SendMessagePayload): Promise<SafeMessageDto> {
    return api.post<SafeMessageDto>('/messages', payload);
  },

  /**
   * Marks a single message as read by the recipient.
   * Calls PATCH /api/v1/messages/:id/read
   */
  async markAsRead(id: string): Promise<{ id: string; is_read: boolean }> {
    return api.patch<{ id: string; is_read: boolean }>(`/messages/${id}/read`);
  },

  /**
   * Marks all messages in a conversation as read.
   * Calls PATCH /api/v1/messages/conversations/:peerId/read
   */
  async markConversationAsRead(peerId: string): Promise<{ updated_count: number }> {
    return api.patch<{ updated_count: number }>(`/messages/conversations/${peerId}/read`);
  },
};
