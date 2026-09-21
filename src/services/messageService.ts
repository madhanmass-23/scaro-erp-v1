import { messageApi } from './api/messageApi';
import { userApi } from './api/userApi';

export interface ContactProfile {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string;
  designation?: string;
  department?: string;
  role?: string;
  can_message?: boolean;
  last_message?: {
    id: string;
    content: string;
    created_at: string;
    is_read: boolean;
    sender_id: string;
  };
  unread_count?: number;
}

export interface MessageItem {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  recipient_id: string;
  is_read: boolean;
  sender?: { full_name: string; avatar_url?: string };
}

/**
 * Evaluates directional messaging permissions based on sender and recipient roles.
 * 
 * Rules:
 * - Intern -> Admin/Super Admin: DENIED (false)
 * - Intern -> Employee/Intern: ALLOWED (true)
 * - Employee -> Everyone: ALLOWED (true)
 * - Admin -> Everyone (including Interns): ALLOWED (true)
 * - Super Admin -> Everyone (including Interns): ALLOWED (true)
 */
export function canMessageUser(senderRole?: string | null, recipientRole?: string | null): boolean {
  if (!senderRole || !recipientRole) return true;

  if (senderRole === 'Intern') {
    if (recipientRole === 'Admin' || recipientRole === 'Super Admin') {
      return false;
    }
    return true;
  }

  // Employee, Admin, Super Admin can message anyone
  return true;
}

/**
 * Fetches authorized contacts according to the current user's role:
 * - Intern: sees Employees, Interns, and any Admin/Super Admin who already initiated a conversation.
 * - Employee: sees Everyone (Employees, Interns, Admins, Super Admins).
 * - Admin: sees Everyone.
 * - Super Admin: sees Everyone.
 */
export async function fetchAuthorizedContacts(
  currentUserId: string,
  currentUserRole?: string | null
): Promise<ContactProfile[]> {
  // 1. Fetch active company profiles using userApi (excluding current user)
  const [profiles, conversations] = await Promise.all([
    userApi.getUsers({ is_active: true, limit: 200 }),
    messageApi.getConversations(),
  ]);

  const activeProfiles = profiles.filter(p => p.id !== currentUserId);

  // 2. Build conversation lookup map for snippets and unread state
  const lastMsgMap = new Map<string, { id: string; content: string; created_at: string; is_read: boolean; sender_id: string }>();
  const unreadCountMap = new Map<string, number>();

  conversations.forEach((c) => {
    if (c.peer?.id) {
      lastMsgMap.set(c.peer.id, {
        id: '',
        content: c.last_message.content,
        created_at: c.last_message.created_at,
        is_read: c.unread_count === 0,
        sender_id: c.last_message.sender_id,
      });
      if (c.unread_count > 0) {
        unreadCountMap.set(c.peer.id, c.unread_count);
      }
    }
  });

  // 3. Filter according to role visibility rules
  const role = currentUserRole || 'Employee';
  const filteredProfiles = activeProfiles.filter((p) => {
    const contactRole = p.role || 'Employee';

    // If current user is Intern:
    if (role === 'Intern') {
      // Allow Employees and Interns by default
      if (contactRole === 'Employee' || contactRole === 'Intern') {
        return true;
      }
      // If Admin or Super Admin, only allow if they have already initiated a conversation
      if (lastMsgMap.has(p.id)) {
        return true;
      }
      // Otherwise hide Admin/Super Admin from Intern's directory & search
      return false;
    }

    // Employee, Admin, Super Admin see everyone
    return true;
  });

  // 4. Map to ContactProfile
  const contactList: ContactProfile[] = filteredProfiles.map((p) => {
    const contactRole = p.role || 'Member';
    const canMessage = canMessageUser(role, contactRole);

    return {
      id: p.id,
      full_name: p.full_name || p.email.split('@')[0],
      email: p.email,
      avatar_url: p.avatar_url || undefined,
      designation: p.designation || undefined,
      department: p.department || undefined,
      role: contactRole,
      can_message: canMessage,
      last_message: lastMsgMap.get(p.id),
      unread_count: unreadCountMap.get(p.id) || 0,
    };
  });

  // 5. Sort: active conversations first (newest message first), then alphabetical by name
  contactList.sort((a, b) => {
    if (a.last_message && b.last_message) {
      return new Date(b.last_message.created_at).getTime() - new Date(a.last_message.created_at).getTime();
    }
    if (a.last_message) return -1;
    if (b.last_message) return 1;
    return a.full_name.localeCompare(b.full_name);
  });

  return contactList;
}

/**
 * Sends a direct 1-to-1 message with client and server permission checks.
 */
export async function sendDirectMessage(
  _senderId: string,
  recipientId: string,
  content: string,
  senderRole?: string | null,
  recipientRole?: string | null
): Promise<MessageItem> {
  if (!canMessageUser(senderRole, recipientRole)) {
    throw new Error('Unauthorized: Interns are not permitted to message Admins or Super Admins');
  }

  const res = await messageApi.sendMessage({
    recipient_id: recipientId,
    content: content.trim(),
  });

  return {
    id: res.id,
    content: res.content,
    created_at: res.created_at,
    sender_id: res.sender.id,
    recipient_id: res.recipient?.id || recipientId,
    is_read: res.is_read,
    sender: {
      full_name: res.sender.full_name || '',
      avatar_url: res.sender.avatar_url || undefined,
    },
  };
}
