import { Request, Response, NextFunction } from "express";
import { projectService } from "../services/project.service.js";
import { rbacService, UserRoleInfo } from "../services/rbac.service.js";
import { sendSuccess, sendPaginatedSuccess } from "../utils/apiResponse.js";
import { AppError } from "../types/api.types.js";
import { ProjectListFilter } from "../repositories/project.repository.js";

export class ProjectController {
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
   * GET /api/v1/projects
   */
  async getProjects(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);

      const filter: ProjectListFilter = {};
      if (typeof req.query.status === "string" && req.query.status.trim()) {
        filter.status = req.query.status.trim();
      }
      if (typeof req.query.owner_id === "string" && req.query.owner_id.trim()) {
        filter.owner_id = req.query.owner_id.trim();
      }
      if (typeof req.query.search === "string" && req.query.search.trim()) {
        filter.search = req.query.search.trim();
      }

      const page = parseInt(String(req.query.page || "1"), 10) || 1;
      const limit = parseInt(String(req.query.limit || "20"), 10) || 20;

      const result = await projectService.listProjects(filter, { page, limit }, auth);
      sendPaginatedSuccess(res, result.projects, result.pagination);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/projects/:id
   */
  async getProjectById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const projectId = String(req.params.id);

      const project = await projectService.getProjectById(projectId, auth);
      sendSuccess(res, project);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/projects
   */
  async createProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const created = await projectService.createProject(req.body, auth);
      sendSuccess(res, created, 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/projects/:id
   */
  async updateProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const projectId = String(req.params.id);

      const updated = await projectService.updateProject(projectId, req.body, auth);
      sendSuccess(res, updated);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/projects/:id/members
   */
  async getMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const projectId = String(req.params.id);

      const members = await projectService.getProjectMembers(projectId, auth);
      sendSuccess(res, members);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/projects/:id/members
   */
  async addMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const projectId = String(req.params.id);
      const targetUserId = req.body?.user_id;

      const members = await projectService.addProjectMember(projectId, targetUserId, auth);
      sendSuccess(res, members, 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/v1/projects/:id/members/:userId
   */
  async removeMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await this.getAuthContext(req);
      const projectId = String(req.params.id);
      const targetUserId = String(req.params.userId);

      const result = await projectService.removeProjectMember(projectId, targetUserId, auth);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
}

export const projectController = new ProjectController();
