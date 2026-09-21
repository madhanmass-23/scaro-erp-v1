/**
 * Task Service - Centralized API layer for SCARO ERP Tasks
 * 
 * Migrated in Phase 3A-4 to Node.js/Express + MariaDB REST APIs.
 */

import { taskApi } from './api/taskApi';
import type { SafeTaskDto, TaskCommentDto } from './api/taskApi';
import { taskAttachmentApi } from './api/taskAttachmentApi';
import { userApi } from './api/userApi';
import type { 
  Task, 
  TaskComment, 
  TaskAttachment, 
  CreateTaskPayload, 
  UpdateTaskPayload, 
  TaskFilterParams,
  AssignableUser
} from '../types/task';

function mapSafeTaskToTask(t: SafeTaskDto, todayStr: string): Task {
  const isOverdue = !!(t.due_date && t.due_date < todayStr && t.status !== 'Completed' && t.status !== 'Cancelled');
  const isDueToday = !!(t.due_date && t.due_date === todayStr && t.status !== 'Completed' && t.status !== 'Cancelled');

  return {
    id: t.id,
    project_id: t.project_id,
    title: t.title,
    description: t.description,
    assignee_id: t.assignee?.id || null,
    reporter_id: t.reporter?.id || '',
    priority: t.priority,
    status: t.status,
    progress: t.progress,
    estimated_hours: t.estimated_hours,
    due_date: t.due_date,
    created_at: t.created_at,
    updated_at: t.updated_at,
    project: {
      id: t.project_id,
      name: t.project_name || 'Project',
      status: 'Active',
    },
    assignee: t.assignee ? {
      id: t.assignee.id || '',
      full_name: t.assignee.full_name || '',
      email: t.assignee.email || undefined,
    } : null,
    reporter: t.reporter ? {
      id: t.reporter.id,
      full_name: t.reporter.full_name || '',
      email: t.reporter.email || undefined,
    } : null,
    comments_count: t.comment_count,
    attachments_count: t.attachment_count,
    is_overdue: isOverdue,
    is_due_today: isDueToday,
  };
}

export async function fetchAssignableUsers(): Promise<AssignableUser[]> {
  const users = await userApi.getUsers();
  
  const assignable: AssignableUser[] = [];
  users.forEach((u) => {
    if (u.role === 'Employee' || u.role === 'Intern') {
      assignable.push({
        id: u.id,
        full_name: u.full_name || u.email.split('@')[0],
        email: u.email,
        avatar_url: u.avatar_url,
        role: u.role as 'Employee' | 'Intern',
        department_name: u.department || null,
        designation: u.designation || null,
      });
    }
  });

  // Sort: Employees first, then Interns; alphabetically by name
  return assignable.sort((a, b) => {
    if (a.role !== b.role) return a.role === 'Employee' ? -1 : 1;
    return a.full_name.localeCompare(b.full_name);
  });
}

export async function fetchTasks(params: TaskFilterParams = {}): Promise<Task[]> {
  const filterParams: Record<string, any> = {
    limit: 100,
  };

  if (params.tab === 'my_tasks') {
    filterParams.scope = 'my';
  } else if (params.tab === 'assigned_by_me') {
    filterParams.scope = 'reported';
  }

  if (params.projectId && params.projectId !== 'All') {
    filterParams.project_id = params.projectId;
  }
  if (params.status && params.status !== 'All') {
    filterParams.status = params.status;
  }
  if (params.priority && params.priority !== 'All') {
    filterParams.priority = params.priority;
  }
  if (params.assigneeId && params.assigneeId !== 'All') {
    filterParams.assignee_id = params.assigneeId;
  }
  if (params.searchQuery && params.searchQuery.trim()) {
    filterParams.search = params.searchQuery.trim();
  }

  const rawTasks = await taskApi.getTasks(filterParams);
  const todayStr = new Date().toISOString().split('T')[0];

  let tasks: Task[] = rawTasks.map((t) => mapSafeTaskToTask(t, todayStr));

  // Client-side refinements if needed
  if (params.tab === 'assigned_by_manager') {
    tasks = tasks.filter((t) => t.assignee_id !== t.reporter_id);
  }

  if (params.dateFilter === 'Due Today' || params.isDueToday) {
    tasks = tasks.filter((t) => t.is_due_today);
  } else if (params.dateFilter === 'Overdue' || params.isOverdue) {
    tasks = tasks.filter((t) => t.is_overdue);
  } else if (params.dateFilter === 'Upcoming') {
    tasks = tasks.filter((t) => t.due_date && t.due_date > todayStr);
  }

  return tasks;
}

export async function fetchTaskById(id: string): Promise<Task | null> {
  const raw = await taskApi.getTaskById(id);
  if (!raw) return null;
  const todayStr = new Date().toISOString().split('T')[0];
  return mapSafeTaskToTask(raw, todayStr);
}

export async function createTask(payload: CreateTaskPayload): Promise<Task> {
  const raw = await taskApi.createTask({
    project_id: payload.project_id,
    title: payload.title.trim(),
    description: payload.description?.trim() || null,
    assignee_id: payload.assignee_id || null,
    priority: payload.priority || 'Medium',
    status: payload.status || 'Todo',
    progress: payload.progress || 0,
    estimated_hours: payload.estimated_hours || 0,
    due_date: payload.due_date ? payload.due_date : null,
  });

  const todayStr = new Date().toISOString().split('T')[0];
  return mapSafeTaskToTask(raw, todayStr);
}

export async function updateTask(id: string, payload: UpdateTaskPayload): Promise<Task> {
  const updates: Record<string, any> = {};
  if (payload.title !== undefined) updates.title = payload.title.trim();
  if (payload.description !== undefined) updates.description = payload.description?.trim() || null;
  if (payload.assignee_id !== undefined) updates.assignee_id = payload.assignee_id || null;
  if (payload.priority !== undefined) updates.priority = payload.priority;
  if (payload.status !== undefined) updates.status = payload.status;
  if (payload.progress !== undefined) updates.progress = payload.progress;
  if (payload.estimated_hours !== undefined) updates.estimated_hours = payload.estimated_hours;
  if (payload.due_date !== undefined) updates.due_date = payload.due_date ? payload.due_date : null;

  const raw = await taskApi.updateTask(id, updates);
  const todayStr = new Date().toISOString().split('T')[0];
  return mapSafeTaskToTask(raw, todayStr);
}

export async function deleteTask(_id: string): Promise<void> {
  // Soft deletion or administrative delete
}

// ============================================================================
// Comments
// ============================================================================

export async function fetchTaskComments(taskId: string): Promise<TaskComment[]> {
  const rawComments = await taskApi.getComments(taskId);
  return rawComments.map((c: TaskCommentDto) => ({
    id: c.id,
    task_id: c.task_id,
    author_id: c.author_id,
    content: c.content,
    created_at: c.created_at,
    updated_at: c.updated_at,
    author: {
      id: c.author_id,
      full_name: c.author_name,
      avatar_url: c.author_avatar,
    },
  }));
}

export async function addTaskComment(taskId: string, content: string): Promise<TaskComment> {
  const c = await taskApi.addComment(taskId, content.trim());
  return {
    id: c.id,
    task_id: c.task_id,
    author_id: c.author_id,
    content: c.content,
    created_at: c.created_at,
    updated_at: c.updated_at,
    author: {
      id: c.author_id,
      full_name: c.author_name,
      avatar_url: c.author_avatar,
    },
  };
}

// ============================================================================
// Attachments
// ============================================================================

export async function fetchTaskAttachments(taskId: string): Promise<TaskAttachment[]> {
  return taskAttachmentApi.getAttachments(taskId);
}

/**
 * Uploads a task attachment via the Node.js backend storage and tasks API.
 */
export async function uploadTaskAttachment(taskId: string, file: File): Promise<TaskAttachment> {
  return taskAttachmentApi.uploadAttachment(taskId, file);
}

/**
 * Retrieves a secure temporary signed download URL for a task attachment.
 */
export async function getAttachmentSignedUrl(storagePath: string): Promise<string> {
  return taskAttachmentApi.getAttachmentSignedUrl(storagePath, 30);
}

/**
 * Deletes a task attachment and purges the physical file.
 */
export async function deleteTaskAttachment(attachmentId: string, storagePath: string, taskId?: string): Promise<void> {
  if (taskId) {
    return taskAttachmentApi.deleteAttachment(taskId, attachmentId, storagePath);
  }
  // Fallback: delete physical asset and attempt cleanup
  const filename = storagePath.includes('/') ? storagePath.split('/').pop() || storagePath : storagePath;
  await taskAttachmentApi.deleteAttachment('', attachmentId, filename);
}

