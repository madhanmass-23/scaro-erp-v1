import { query, queryOne, execute } from "../utils/database.util.js";
import crypto from "crypto";

export interface TaskRecord {
  id: string;
  project_id: string;
  project_name: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
  assignee_avatar: string | null;
  reporter_id: string;
  reporter_name: string;
  reporter_email: string;
  priority: "Low" | "Medium" | "High" | "Urgent";
  status: "Todo" | "In Progress" | "Review" | "Needs Revision" | "Completed" | "On Hold" | "Cancelled";
  progress: number;
  estimated_hours: number;
  due_date: string | null;
  comment_count: number;
  attachment_count: number;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface TaskCommentRecord {
  id: string;
  task_id: string;
  author_id: string;
  author_name: string;
  author_email: string;
  author_avatar: string | null;
  content: string;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface TaskAttachmentRecord {
  id: string;
  task_id: string;
  uploaded_by: string;
  uploader_name: string;
  uploader_email: string;
  file_name: string;
  storage_path: string;
  file_size: number;
  file_type: string | null;
  created_at: Date | string;
}

export interface TaskListFilter {
  project_id?: string;
  status?: string;
  priority?: string;
  assignee_id?: string;
  reporter_id?: string;
  search?: string;
}

export interface TaskPaginationOptions {
  page: number;
  limit: number;
}

export interface UserTaskScope {
  userId: string;
  projectIds: string[];
}

export class TaskRepository {
  /**
   * Retrieves a single task by ID with joined project, assignee, reporter, and counts.
   */
  async findById(id: string): Promise<TaskRecord | null> {
    const sql = `
      SELECT 
        t.id,
        t.project_id,
        pr.name AS project_name,
        t.title,
        t.description,
        t.assignee_id,
        a.full_name AS assignee_name,
        a.email AS assignee_email,
        a.avatar_url AS assignee_avatar,
        t.reporter_id,
        r.full_name AS reporter_name,
        r.email AS reporter_email,
        t.priority,
        t.status,
        t.progress,
        CAST(t.estimated_hours AS DOUBLE) AS estimated_hours,
        t.due_date,
        (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id) AS comment_count,
        (SELECT COUNT(*) FROM task_attachments ta WHERE ta.task_id = t.id) AS attachment_count,
        t.created_at,
        t.updated_at
      FROM tasks t
      JOIN projects pr ON t.project_id = pr.id
      LEFT JOIN profiles a ON t.assignee_id = a.id
      JOIN profiles r ON t.reporter_id = r.id
      WHERE t.id = ?
      LIMIT 1
    `;
    return queryOne<TaskRecord>(sql, [id]);
  }

  /**
   * Lists tasks with filtering, pagination, and optional RBAC user scoping.
   */
  async listTasks(
    filter: TaskListFilter,
    pagination: TaskPaginationOptions,
    scope?: UserTaskScope | null
  ): Promise<{ tasks: TaskRecord[]; total: number }> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    // Scope for non-admin users (Assignee OR Reporter OR Member of project)
    if (scope) {
      if (scope.projectIds.length > 0) {
        const placeholders = scope.projectIds.map(() => "?").join(", ");
        conditions.push(`(t.assignee_id = ? OR t.reporter_id = ? OR t.project_id IN (${placeholders}))`);
        params.push(scope.userId, scope.userId, ...scope.projectIds);
      } else {
        conditions.push(`(t.assignee_id = ? OR t.reporter_id = ?)`);
        params.push(scope.userId, scope.userId);
      }
    }

    if (filter.project_id) {
      conditions.push("t.project_id = ?");
      params.push(filter.project_id);
    }

    if (filter.status) {
      conditions.push("t.status = ?");
      params.push(filter.status);
    }

    if (filter.priority) {
      conditions.push("t.priority = ?");
      params.push(filter.priority);
    }

    if (filter.assignee_id) {
      conditions.push("t.assignee_id = ?");
      params.push(filter.assignee_id);
    }

    if (filter.reporter_id) {
      conditions.push("t.reporter_id = ?");
      params.push(filter.reporter_id);
    }

    if (filter.search && filter.search.trim().length > 0) {
      const term = `%${filter.search.trim()}%`;
      conditions.push("(t.title LIKE ? OR t.description LIKE ?)");
      params.push(term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // 1. Total count
    const countSql = `
      SELECT COUNT(DISTINCT t.id) AS total
      FROM tasks t
      JOIN projects pr ON t.project_id = pr.id
      ${whereClause}
    `;
    const countRow = await queryOne<{ total: number }>(countSql, params);
    const total = countRow ? Number(countRow.total) : 0;

    // 2. Paginated rows
    const page = Math.max(1, pagination.page);
    const limit = Math.max(1, Math.min(100, pagination.limit));
    const offset = (page - 1) * limit;

    const dataSql = `
      SELECT 
        t.id,
        t.project_id,
        pr.name AS project_name,
        t.title,
        t.description,
        t.assignee_id,
        a.full_name AS assignee_name,
        a.email AS assignee_email,
        a.avatar_url AS assignee_avatar,
        t.reporter_id,
        r.full_name AS reporter_name,
        r.email AS reporter_email,
        t.priority,
        t.status,
        t.progress,
        CAST(t.estimated_hours AS DOUBLE) AS estimated_hours,
        t.due_date,
        (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id) AS comment_count,
        (SELECT COUNT(*) FROM task_attachments ta WHERE ta.task_id = t.id) AS attachment_count,
        t.created_at,
        t.updated_at
      FROM tasks t
      JOIN projects pr ON t.project_id = pr.id
      LEFT JOIN profiles a ON t.assignee_id = a.id
      JOIN profiles r ON t.reporter_id = r.id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...params, limit, offset];
    const tasks = await query<TaskRecord>(dataSql, dataParams);

    return { tasks, total };
  }

  /**
   * Inserts a new task.
   */
  async createTask(data: {
    id?: string;
    project_id: string;
    title: string;
    description?: string | null;
    assignee_id?: string | null;
    reporter_id: string;
    priority?: "Low" | "Medium" | "High" | "Urgent";
    status?: "Todo" | "In Progress" | "Review" | "Needs Revision" | "Completed" | "On Hold" | "Cancelled";
    progress?: number;
    estimated_hours?: number;
    due_date?: string | null;
  }): Promise<TaskRecord> {
    const taskId = data.id || crypto.randomUUID();
    const priority = data.priority || "Medium";
    const status = data.status || "Todo";
    const progress = data.progress !== undefined ? data.progress : 0;
    const estimatedHours = data.estimated_hours !== undefined ? data.estimated_hours : 0.0;

    const sql = `
      INSERT INTO tasks (
        id, project_id, title, description, assignee_id, reporter_id,
        priority, status, progress, estimated_hours, due_date,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6))
    `;

    await execute(sql, [
      taskId,
      data.project_id,
      data.title,
      data.description || null,
      data.assignee_id || null,
      data.reporter_id,
      priority,
      status,
      progress,
      estimatedHours,
      data.due_date || null,
    ]);

    const created = await this.findById(taskId);
    if (!created) {
      throw new Error("Failed to retrieve created task record");
    }
    return created;
  }

  /**
   * Updates task columns from an allow-list.
   */
  async update(id: string, fields: Record<string, any>): Promise<TaskRecord | null> {
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

    const updateSql = `UPDATE tasks SET ${setClauses.join(", ")} WHERE id = ?`;
    await execute(updateSql, params);

    return this.findById(id);
  }

  /**
   * Retrieves comments on a task.
   */
  async getComments(taskId: string): Promise<TaskCommentRecord[]> {
    const sql = `
      SELECT 
        tc.id,
        tc.task_id,
        tc.author_id,
        p.full_name AS author_name,
        p.email AS author_email,
        p.avatar_url AS author_avatar,
        tc.content,
        tc.created_at,
        tc.updated_at
      FROM task_comments tc
      JOIN profiles p ON tc.author_id = p.id
      WHERE tc.task_id = ?
      ORDER BY tc.created_at ASC
    `;
    return query<TaskCommentRecord>(sql, [taskId]);
  }

  /**
   * Adds a comment to a task.
   */
  async addComment(taskId: string, authorId: string, content: string): Promise<TaskCommentRecord> {
    const commentId = crypto.randomUUID();
    const insertSql = `
      INSERT INTO task_comments (id, task_id, author_id, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6))
    `;
    await execute(insertSql, [commentId, taskId, authorId, content]);

    const fetchSql = `
      SELECT 
        tc.id,
        tc.task_id,
        tc.author_id,
        p.full_name AS author_name,
        p.email AS author_email,
        p.avatar_url AS author_avatar,
        tc.content,
        tc.created_at,
        tc.updated_at
      FROM task_comments tc
      JOIN profiles p ON tc.author_id = p.id
      WHERE tc.id = ?
      LIMIT 1
    `;
    const comment = await queryOne<TaskCommentRecord>(fetchSql, [commentId]);
    if (!comment) {
      throw new Error("Failed to retrieve created comment");
    }
    return comment;
  }

  /**
   * Retrieves attachment metadata records for a task.
   */
  async getAttachments(taskId: string): Promise<TaskAttachmentRecord[]> {
    const sql = `
      SELECT 
        ta.id,
        ta.task_id,
        ta.uploaded_by,
        p.full_name AS uploader_name,
        p.email AS uploader_email,
        ta.file_name,
        ta.storage_path,
        ta.file_size,
        ta.file_type,
        ta.created_at
      FROM task_attachments ta
      JOIN profiles p ON ta.uploaded_by = p.id
      WHERE ta.task_id = ?
      ORDER BY ta.created_at DESC
    `;
    return query<TaskAttachmentRecord>(sql, [taskId]);
  }

  /**
   * Adds an attachment metadata record to a task.
   */
  async addAttachment(data: {
    task_id: string;
    uploaded_by: string;
    file_name: string;
    storage_path: string;
    file_size?: number | null;
    file_type?: string | null;
  }): Promise<TaskAttachmentRecord> {
    const attachmentId = crypto.randomUUID();
    const sql = `
      INSERT INTO task_attachments (
        id, task_id, uploaded_by, file_name, storage_path, file_size, file_type, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6))
    `;

    await execute(sql, [
      attachmentId,
      data.task_id,
      data.uploaded_by,
      data.file_name,
      data.storage_path,
      data.file_size || null,
      data.file_type || null,
    ]);

    const fetchSql = `
      SELECT 
        ta.id, ta.task_id, ta.uploaded_by, p.full_name AS uploader_name,
        ta.file_name, ta.storage_path, ta.file_size, ta.file_type, ta.created_at
      FROM task_attachments ta
      JOIN profiles p ON ta.uploaded_by = p.id
      WHERE ta.id = ?
      LIMIT 1
    `;
    const item = await queryOne<TaskAttachmentRecord>(fetchSql, [attachmentId]);
    if (!item) {
      throw new Error("Failed to retrieve created attachment metadata");
    }
    return item;
  }

  /**
   * Finds an attachment by ID.
   */
  async findAttachmentById(attachmentId: string): Promise<TaskAttachmentRecord | null> {
    const sql = `
      SELECT 
        ta.id, ta.task_id, ta.uploaded_by, p.full_name AS uploader_name,
        ta.file_name, ta.storage_path, ta.file_size, ta.file_type, ta.created_at
      FROM task_attachments ta
      JOIN profiles p ON ta.uploaded_by = p.id
      WHERE ta.id = ?
      LIMIT 1
    `;
    return queryOne<TaskAttachmentRecord>(sql, [attachmentId]);
  }

  /**
   * Deletes an attachment metadata record.
   */
  async deleteAttachment(attachmentId: string): Promise<boolean> {
    const sql = `DELETE FROM task_attachments WHERE id = ?`;
    const result = await execute(sql, [attachmentId]);
    return result.affectedRows > 0;
  }
}

export const taskRepository = new TaskRepository();
