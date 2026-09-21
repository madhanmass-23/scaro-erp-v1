import { Request, Response, NextFunction } from "express";
import { taskService } from "../services/task.service.js";
import { rbacService, UserRoleInfo } from "../services/rbac.service.js";
import { sendSuccess, sendPaginatedSuccess } from "../utils/apiResponse.js";
import { AppError } from "../types/api.types.js";
import { TaskListFilter } from "../repositories/task.repository.js";

export class TaskController {
  private async getAuthContext(req: Request): Promise<UserRoleInfo> {
    if (req.auth) {
      return req.auth;
    }
    if (!req.user?.id) {
      throw new AppError("Authentication required", 401, "UNAUTHENTICATED");
    }
    const roleInfo = await rbacService.getUserRoleAndPermissions(req.user.id);
    req.auth = roleInfo;
    return roleInfo;
  }

  /**
   * GET /api/v1/tasks
   */
  async getTasks(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);

      const filter: TaskListFilter = {};
      if (typeof req.query.project_id === "string" && req.query.project_id.trim()) {
        filter.project_id = req.query.project_id.trim();
      }
      if (typeof req.query.status === "string" && req.query.status.trim()) {
        filter.status = req.query.status.trim();
      }
      if (typeof req.query.priority === "string" && req.query.priority.trim()) {
        filter.priority = req.query.priority.trim();
      }
      if (typeof req.query.assignee_id === "string" && req.query.assignee_id.trim()) {
        filter.assignee_id = req.query.assignee_id.trim();
      }
      if (typeof req.query.reporter_id === "string" && req.query.reporter_id.trim()) {
        filter.reporter_id = req.query.reporter_id.trim();
      }
      if (typeof req.query.search === "string" && req.query.search.trim()) {
        filter.search = req.query.search.trim();
      }

      const scope = typeof req.query.scope === "string" ? req.query.scope.trim() : undefined;
      const page = parseInt(String(req.query.page || "1"), 10) || 1;
      const limit = parseInt(String(req.query.limit || "20"), 10) || 20;

      const result = await taskService.listTasks(filter, { page, limit }, auth, scope);
      sendPaginatedSuccess(res, result.tasks, result.pagination);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/tasks/:id
   */
  async getTaskById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const taskId = String(req.params.id);

      const task = await taskService.getTaskById(taskId, auth);
      sendSuccess(res, task);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/tasks
   */
  async createTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const created = await taskService.createTask(req.body, auth);
      sendSuccess(res, created, 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/tasks/:id
   */
  async updateTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const taskId = String(req.params.id);

      const updated = await taskService.updateTask(taskId, req.body, auth);
      sendSuccess(res, updated);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/tasks/:id/comments
   */
  async getComments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const taskId = String(req.params.id);

      const comments = await taskService.getComments(taskId, auth);
      sendSuccess(res, comments);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/tasks/:id/comments
   */
  async addComment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const taskId = String(req.params.id);
      const content = req.body?.content;

      const comment = await taskService.addComment(taskId, content, auth);
      sendSuccess(res, comment, 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/tasks/:id/attachments
   */
  async getAttachments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const taskId = String(req.params.id);

      const attachments = await taskService.getAttachments(taskId, auth);
      sendSuccess(res, attachments);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/tasks/:id/attachments
   */
  async addAttachment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const taskId = String(req.params.id);
      const { file_name, storage_path, file_size, file_type } = req.body;

      const attachment = await taskService.addAttachment(
        taskId,
        { file_name, storage_path, file_size, file_type },
        auth
      );
      sendSuccess(res, attachment, 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/v1/tasks/:id/attachments/:attachmentId
   */
  async deleteAttachment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const taskId = String(req.params.id);
      const attachmentId = String(req.params.attachmentId);

      await taskService.deleteAttachment(taskId, attachmentId, auth);
      sendSuccess(res, { deleted: true }, 200);
    } catch (err) {
      next(err);
    }
  }
}

export const taskController = new TaskController();
