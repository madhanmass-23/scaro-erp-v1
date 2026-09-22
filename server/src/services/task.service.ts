import {
  taskRepository,
  TaskRecord,
  TaskCommentRecord,
  TaskAttachmentRecord,
  TaskListFilter,
  TaskPaginationOptions,
  UserTaskScope,
} from "../repositories/task.repository.js";
import { projectRepository } from "../repositories/project.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { notificationRepository } from "../repositories/notification.repository.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { UserRoleInfo, rbacService } from "./rbac.service.js";
import { AppError } from "../types/api.types.js";
import { isValidUuid, isValidDateString } from "../utils/validation.util.js";

const VALID_PRIORITIES = new Set(["Low", "Medium", "High", "Urgent"]);
const VALID_STATUSES = new Set([
  "Todo",
  "In Progress",
  "Review",
  "Needs Revision",
  "Completed",
  "On Hold",
  "Cancelled",
]);

const TASK_ALLOWED_UPDATE_FIELDS = new Set([
  "title",
  "description",
  "assignee_id",
  "priority",
  "status",
  "progress",
  "estimated_hours",
  "due_date",
]);

export interface SafeTaskDto {
  id: string;
  project_id: string;
  project_name: string;
  title: string;
  description: string | null;
  assignee: {
    id: string | null;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
  reporter: {
    id: string;
    full_name: string;
    email: string;
  };
  priority: "Low" | "Medium" | "High" | "Urgent";
  status: "Todo" | "In Progress" | "Review" | "Needs Revision" | "Completed" | "On Hold" | "Cancelled";
  progress: number;
  estimated_hours: number;
  due_date: string | null;
  comment_count: number;
  attachment_count: number;
  created_at: string;
  updated_at: string;
}

export class TaskService {
  private formatTask(raw: TaskRecord): SafeTaskDto {
    return {
      id: raw.id,
      project_id: raw.project_id,
      project_name: raw.project_name,
      title: raw.title,
      description: raw.description,
      assignee: raw.assignee_id
        ? {
            id: raw.assignee_id,
            full_name: raw.assignee_name,
            email: raw.assignee_email,
            avatar_url: raw.assignee_avatar,
          }
        : null,
      reporter: {
        id: raw.reporter_id,
        full_name: raw.reporter_name,
        email: raw.reporter_email,
      },
      priority: raw.priority,
      status: raw.status,
      progress: Number(raw.progress) || 0,
      estimated_hours: Number(raw.estimated_hours) || 0,
      due_date: raw.due_date ? String(raw.due_date).split("T")[0] : null,
      comment_count: Number(raw.comment_count) || 0,
      attachment_count: Number(raw.attachment_count) || 0,
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

  /**
   * Lists tasks with RBAC scoping and pagination.
   */
  async listTasks(
    filter: TaskListFilter,
    pagination: TaskPaginationOptions,
    callerAuth: UserRoleInfo,
    viewScope?: string
  ): Promise<{ tasks: SafeTaskDto[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const hasBroadView =
      callerAuth.isSuperAdmin ||
      rbacService.hasPermission(callerAuth, "tasks.view") ||
      rbacService.hasPermission(callerAuth, "tasks.manage");

    let scope: UserTaskScope | null = null;

    if (viewScope === "my") {
      filter.assignee_id = callerAuth.userId;
    } else if (viewScope === "reported") {
      filter.reporter_id = callerAuth.userId;
    } else if (!hasBroadView) {
      // Normal employee/intern general list: restrict to tasks they are assigned to, reported, or in their projects
      const projectIds = await projectRepository.getUserAssociatedProjectIds(callerAuth.userId);
      scope = {
        userId: callerAuth.userId,
        projectIds,
      };
    }

    const page = Math.max(1, Math.floor(pagination.page || 1));
    const limit = Math.max(1, Math.min(100, Math.floor(pagination.limit || 20)));

    const { tasks, total } = await taskRepository.listTasks(filter, { page, limit }, scope);
    const formatted = tasks.map((t) => this.formatTask(t));
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      tasks: formatted,
      pagination: { page, limit, total, totalPages },
    };
  }

  /**
   * Retrieves a single task with IDOR protection.
   */
  async getTaskById(taskId: string, callerAuth: UserRoleInfo): Promise<SafeTaskDto> {
    if (!taskId || !isValidUuid(taskId)) {
      throw new AppError("Invalid task ID format. Must be a valid UUID.", 400, "INVALID_UUID");
    }

    const task = await taskRepository.findById(taskId);
    if (!task) {
      throw new AppError("Task not found", 404, "TASK_NOT_FOUND");
    }

    const hasBroadView =
      callerAuth.isSuperAdmin ||
      rbacService.hasPermission(callerAuth, "tasks.view") ||
      rbacService.hasPermission(callerAuth, "tasks.manage");

    if (!hasBroadView) {
      const isDirectParty = task.assignee_id === callerAuth.userId || task.reporter_id === callerAuth.userId;
      if (!isDirectParty) {
        const isProjectMember = await projectRepository.isUserAssociatedWithProject(task.project_id, callerAuth.userId);
        if (!isProjectMember) {
          throw new AppError("You do not have permission to view this task", 403, "FORBIDDEN");
        }
      }
    }

    return this.formatTask(task);
  }

  /**
   * Creates a new task with assignment security rules.
   */
  async createTask(body: Record<string, any>, callerAuth: UserRoleInfo): Promise<SafeTaskDto> {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new AppError("Request body must be a valid JSON object", 400, "INVALID_REQUEST_BODY");
    }

    const { project_id, title, description, assignee_id, priority, status, progress, estimated_hours, due_date } =
      body;

    if (!project_id || !isValidUuid(project_id)) {
      throw new AppError("project_id must be a valid UUID", 400, "INVALID_UUID");
    }

    const project = await projectRepository.findById(project_id);
    if (!project) {
      throw new AppError("Target project does not exist", 404, "PROJECT_NOT_FOUND");
    }

    // Verify caller has access to the project
    const hasProjectAccess =
      callerAuth.isSuperAdmin ||
      rbacService.hasPermission(callerAuth, "projects.view") ||
      rbacService.hasPermission(callerAuth, "projects.manage") ||
      (await projectRepository.isUserAssociatedWithProject(project_id, callerAuth.userId));

    if (!hasProjectAccess) {
      throw new AppError("You do not have access to the designated project", 403, "FORBIDDEN");
    }

    if (typeof title !== "string" || title.trim().length === 0 || title.length > 255) {
      throw new AppError("Task title is required and must be between 1 and 255 characters", 400, "INVALID_FIELD");
    }

    // Validate Priority
    const taskPriority = priority || "Medium";
    if (!VALID_PRIORITIES.has(taskPriority)) {
      throw new AppError(
        `Invalid priority: '${taskPriority}'. Allowed: ${Array.from(VALID_PRIORITIES).join(", ")}`,
        400,
        "INVALID_ENUM"
      );
    }

    // Validate Status
    const taskStatus = status || "Todo";
    if (!VALID_STATUSES.has(taskStatus)) {
      throw new AppError(
        `Invalid status: '${taskStatus}'. Allowed: ${Array.from(VALID_STATUSES).join(", ")}`,
        400,
        "INVALID_ENUM"
      );
    }

    // Validate Progress
    const taskProgress = progress !== undefined ? parseInt(String(progress), 10) : 0;
    if (isNaN(taskProgress) || taskProgress < 0 || taskProgress > 100) {
      throw new AppError("progress must be an integer between 0 and 100", 400, "INVALID_RANGE");
    }

    // Validate Estimated Hours
    const taskEstHours = estimated_hours !== undefined ? parseFloat(String(estimated_hours)) : 0.0;
    if (isNaN(taskEstHours) || taskEstHours < 0) {
      throw new AppError("estimated_hours must be a non-negative number", 400, "INVALID_RANGE");
    }

    // Validate Due Date
    if (due_date && !isValidDateString(due_date)) {
      throw new AppError("due_date must be in YYYY-MM-DD format", 400, "INVALID_DATE");
    }

    // Assignment Authorization Check
    let targetAssigneeId = callerAuth.userId; // Default to self

    if (assignee_id !== undefined && assignee_id !== null && assignee_id !== "") {
      if (!isValidUuid(assignee_id)) {
        throw new AppError("assignee_id must be a valid UUID", 400, "INVALID_UUID");
      }

      if (assignee_id !== callerAuth.userId) {
        const canAssignOthers =
          callerAuth.isSuperAdmin ||
          rbacService.hasPermission(callerAuth, "tasks.create") ||
          rbacService.hasPermission(callerAuth, "tasks.manage");

        if (!canAssignOthers) {
          throw new AppError("You do not have permission to assign tasks to other users", 403, "FORBIDDEN");
        }

        const targetUser = await userRepository.findById(assignee_id);
        if (!targetUser || !targetUser.is_active) {
          throw new AppError("Designated assignee does not exist or is inactive", 400, "USER_NOT_FOUND");
        }
      }
      targetAssigneeId = assignee_id;
    }

    const created = await taskRepository.createTask({
      project_id,
      title: title.trim(),
      description: typeof description === "string" ? description.trim() : null,
      assignee_id: targetAssigneeId,
      reporter_id: callerAuth.userId,
      priority: taskPriority,
      status: taskStatus,
      progress: taskProgress,
      estimated_hours: taskEstHours,
      due_date: due_date ? String(due_date).trim() : null,
    });

    // Notify assignee if different from creator
    if (created.assignee_id && created.assignee_id !== callerAuth.userId) {
      try {
        await notificationRepository.createNotification({
          user_id: created.assignee_id,
          type: "task_assigned",
          title: "New Task Assigned",
          message: `You have been assigned task "${created.title}" in ${project.name}.`,
          reference_id: created.id,
          reference_type: "task",
        });
      } catch (err) {
        console.warn("[NOTIFICATION] Could not dispatch task_assigned notification:", err);
      }
    }

    return this.formatTask(created);
  }

  /**
   * Updates an existing task with permission and ownership checks.
   */
  async updateTask(taskId: string, body: Record<string, any>, callerAuth: UserRoleInfo): Promise<SafeTaskDto> {
    if (!taskId || !isValidUuid(taskId)) {
      throw new AppError("Invalid task ID format. Must be a valid UUID.", 400, "INVALID_UUID");
    }

    const task = await taskRepository.findById(taskId);
    if (!task) {
      throw new AppError("Task not found", 404, "TASK_NOT_FOUND");
    }

    const isSuperAdmin = callerAuth.isSuperAdmin;
    const hasTaskManage = rbacService.hasPermission(callerAuth, "tasks.manage");
    const hasTaskUpdate = rbacService.hasPermission(callerAuth, "tasks.update");
    const isReporter = task.reporter_id === callerAuth.userId;
    const isAssignee = task.assignee_id === callerAuth.userId;

    const canFullManage = isSuperAdmin || hasTaskManage;
    const canReportUpdate = isReporter || hasTaskUpdate;

    if (!canFullManage && !canReportUpdate && !isAssignee) {
      throw new AppError("You do not have permission to update this task", 403, "FORBIDDEN");
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new AppError("Request body must be a valid JSON object", 400, "INVALID_REQUEST_BODY");
    }

    const providedKeys = Object.keys(body);
    if (providedKeys.length === 0) {
      return this.formatTask(task);
    }

    for (const key of providedKeys) {
      if (!TASK_ALLOWED_UPDATE_FIELDS.has(key)) {
        throw new AppError(
          `Field '${key}' cannot be updated. Allowed fields: ${Array.from(TASK_ALLOWED_UPDATE_FIELDS).join(", ")}`,
          400,
          "RESTRICTED_OR_UNKNOWN_FIELD"
        );
      }
    }

    const fieldsToUpdate: Record<string, any> = {};

    if ("title" in body) {
      if (!canFullManage && !canReportUpdate) {
        throw new AppError("Only the reporter or a task manager can update the task title", 403, "FORBIDDEN");
      }
      const val = body.title;
      if (typeof val !== "string" || val.trim().length === 0 || val.length > 255) {
        throw new AppError("title must be a non-empty string up to 255 characters", 400, "INVALID_FIELD");
      }
      fieldsToUpdate.title = val.trim();
    }

    if ("description" in body) {
      const val = body.description;
      fieldsToUpdate.description = typeof val === "string" ? val.trim() : null;
    }

    if ("priority" in body) {
      if (!canFullManage && !canReportUpdate) {
        throw new AppError("Only the reporter or a task manager can update task priority", 403, "FORBIDDEN");
      }
      const val = body.priority;
      if (!VALID_PRIORITIES.has(val)) {
        throw new AppError(
          `Invalid priority: '${val}'. Allowed: ${Array.from(VALID_PRIORITIES).join(", ")}`,
          400,
          "INVALID_ENUM"
        );
      }
      fieldsToUpdate.priority = val;
    }

    if ("status" in body) {
      const val = body.status;
      if (!VALID_STATUSES.has(val)) {
        throw new AppError(
          `Invalid status: '${val}'. Allowed: ${Array.from(VALID_STATUSES).join(", ")}`,
          400,
          "INVALID_ENUM"
        );
      }
      fieldsToUpdate.status = val;
    }

    if ("progress" in body) {
      const val = parseInt(String(body.progress), 10);
      if (isNaN(val) || val < 0 || val > 100) {
        throw new AppError("progress must be an integer between 0 and 100", 400, "INVALID_RANGE");
      }
      fieldsToUpdate.progress = val;
    }

    if ("estimated_hours" in body) {
      if (!canFullManage && !canReportUpdate) {
        throw new AppError("Only the reporter or a task manager can update estimated hours", 403, "FORBIDDEN");
      }
      const val = parseFloat(String(body.estimated_hours));
      if (isNaN(val) || val < 0) {
        throw new AppError("estimated_hours must be a non-negative number", 400, "INVALID_RANGE");
      }
      fieldsToUpdate.estimated_hours = val;
    }

    if ("due_date" in body) {
      if (!canFullManage && !canReportUpdate) {
        throw new AppError("Only the reporter or a task manager can update due date", 403, "FORBIDDEN");
      }
      const val = body.due_date;
      if (val !== null && val !== undefined && val !== "") {
        if (!isValidDateString(val)) {
          throw new AppError("due_date must be in YYYY-MM-DD format or null", 400, "INVALID_DATE");
        }
        fieldsToUpdate.due_date = String(val).trim();
      } else {
        fieldsToUpdate.due_date = null;
      }
    }

    if ("assignee_id" in body) {
      const val = body.assignee_id;
      if (!canFullManage) {
        throw new AppError("You do not have permission to reassign tasks", 403, "FORBIDDEN");
      }
      if (val !== null && val !== undefined && val !== "") {
        if (!isValidUuid(val)) {
          throw new AppError("assignee_id must be a valid UUID or null", 400, "INVALID_UUID");
        }
        const targetUser = await userRepository.findById(val);
        if (!targetUser || !targetUser.is_active) {
          throw new AppError("Designated assignee does not exist or is inactive", 400, "USER_NOT_FOUND");
        }
        fieldsToUpdate.assignee_id = String(val).trim();
      } else {
        fieldsToUpdate.assignee_id = null;
      }
    }

    const updated = await taskRepository.update(taskId, fieldsToUpdate);
    if (!updated) {
      throw new AppError("Task not found", 404, "TASK_NOT_FOUND");
    }

    // 1. Notify new assignee if reassigned
    if (fieldsToUpdate.assignee_id && fieldsToUpdate.assignee_id !== task.assignee_id && fieldsToUpdate.assignee_id !== callerAuth.userId) {
      try {
        await notificationRepository.createNotification({
          user_id: fieldsToUpdate.assignee_id,
          type: "task_assigned",
          title: "Task Reassigned",
          message: `You have been assigned task "${updated.title}".`,
          reference_id: updated.id,
          reference_type: "task",
        });
      } catch (err) {
        console.warn("[NOTIFICATION] Could not dispatch task_assigned notification:", err);
      }
    }

    // 2. Notify on status transition (e.g. Review, Completed, or status change)
    if (fieldsToUpdate.status && fieldsToUpdate.status !== task.status) {
      try {
        const recipients = new Set<string>();
        if (task.reporter_id && task.reporter_id !== callerAuth.userId) {
          recipients.add(task.reporter_id);
        }
        if (task.assignee_id && task.assignee_id !== callerAuth.userId) {
          recipients.add(task.assignee_id);
        }

        // If completed or submitted for review, also notify Admins
        if (fieldsToUpdate.status === "Review" || fieldsToUpdate.status === "Completed") {
          const adminIds = await userRepository.getAdminUserIds();
          for (const aId of adminIds) {
            if (aId !== callerAuth.userId) recipients.add(aId);
          }
        }

        for (const recipientId of recipients) {
          await notificationRepository.createNotification({
            user_id: recipientId,
            type: "task_status_changed",
            title: `Task ${fieldsToUpdate.status}`,
            message: `Task "${updated.title}" status changed to ${fieldsToUpdate.status}.`,
            reference_id: updated.id,
            reference_type: "task",
          });
        }
      } catch (err) {
        console.warn("[NOTIFICATION] Could not dispatch task status notifications:", err);
      }
    }

    return this.formatTask(updated);
  }

  /**
   * Retrieves comments on a task.
   */
  async getComments(taskId: string, callerAuth: UserRoleInfo): Promise<TaskCommentRecord[]> {
    // Ensures task exists and caller is authorized to view it
    await this.getTaskById(taskId, callerAuth);

    return taskRepository.getComments(taskId);
  }

  /**
   * Adds a comment to a task.
   */
  async addComment(taskId: string, content: string, callerAuth: UserRoleInfo): Promise<TaskCommentRecord> {
    // Ensures task exists and caller is authorized to view/participate in it
    await this.getTaskById(taskId, callerAuth);

    if (typeof content !== "string" || content.trim().length === 0) {
      throw new AppError("Comment content is required and cannot be empty", 400, "INVALID_FIELD");
    }

    return taskRepository.addComment(taskId, callerAuth.userId, content.trim());
  }

  /**
   * Retrieves attachment metadata records for a task.
   */
  async getAttachments(taskId: string, callerAuth: UserRoleInfo): Promise<TaskAttachmentRecord[]> {
    // Ensures task exists and caller is authorized to view it
    await this.getTaskById(taskId, callerAuth);

    return taskRepository.getAttachments(taskId);
  }

  /**
   * Adds an attachment metadata record to a task.
   */
  async addAttachment(
    taskId: string,
    data: {
      file_name: string;
      storage_path: string;
      file_size?: number | null;
      file_type?: string | null;
    },
    callerAuth: UserRoleInfo
  ): Promise<TaskAttachmentRecord> {
    await this.getTaskById(taskId, callerAuth);

    if (!data.file_name || !data.file_name.trim()) {
      throw new AppError("Attachment file_name is required.", 400, "INVALID_FIELD");
    }
    if (!data.storage_path || !data.storage_path.trim()) {
      throw new AppError("Attachment storage_path is required.", 400, "INVALID_FIELD");
    }

    const attachment = await taskRepository.addAttachment({
      task_id: taskId,
      uploaded_by: callerAuth.userId,
      file_name: data.file_name.trim(),
      storage_path: data.storage_path.trim(),
      file_size: data.file_size || null,
      file_type: data.file_type || null,
    });

    await auditRepository.log({
      actor_id: callerAuth.userId,
      action: "TASK_ATTACHMENT_ADD",
      table_name: "task_attachments",
      record_id: attachment.id,
      new_value: { task_id: taskId, file_name: data.file_name, storage_path: data.storage_path },
    });

    return attachment;
  }

  /**
   * Deletes an attachment metadata record from a task.
   */
  async deleteAttachment(
    taskId: string,
    attachmentId: string,
    callerAuth: UserRoleInfo
  ): Promise<void> {
    await this.getTaskById(taskId, callerAuth);

    const attachment = await taskRepository.findAttachmentById(attachmentId);
    if (!attachment || attachment.task_id !== taskId) {
      throw new AppError("Attachment not found for this task.", 404, "ATTACHMENT_NOT_FOUND");
    }

    const isOwner = attachment.uploaded_by === callerAuth.userId;
    const isManagement =
      callerAuth.role === "SUPER_ADMIN" ||
      callerAuth.role === "ADMIN" ||
      callerAuth.role === "Super Admin" ||
      callerAuth.role === "Admin";

    if (!isOwner && !isManagement) {
      throw new AppError("You do not have permission to delete this attachment.", 403, "FORBIDDEN");
    }

    await taskRepository.deleteAttachment(attachmentId);

    await auditRepository.log({
      actor_id: callerAuth.userId,
      action: "TASK_ATTACHMENT_DELETE",
      table_name: "task_attachments",
      record_id: attachmentId,
      old_value: { task_id: taskId, file_name: attachment.file_name, storage_path: attachment.storage_path },
    });
  }
}

export const taskService = new TaskService();
