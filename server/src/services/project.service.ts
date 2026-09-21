import { projectRepository, ProjectRecord, ProjectMemberRecord, ProjectListFilter, ProjectPaginationOptions } from "../repositories/project.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { UserRoleInfo, rbacService } from "./rbac.service.js";
import { AppError } from "../types/api.types.js";
import { isValidUuid, isValidDateString } from "../utils/validation.util.js";

const PROJECT_ALLOWED_UPDATE_FIELDS = new Set([
  "name",
  "description",
  "status",
  "start_date",
  "end_date",
  "owner_id",
]);

export interface SafeProjectDto {
  id: string;
  name: string;
  description: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  owner: {
    id: string | null;
    full_name: string | null;
    email: string | null;
  } | null;
  creator: {
    id: string;
    full_name: string | null;
    email: string | null;
  };
  member_count: number;
  task_count: number;
  created_at: string;
  updated_at: string;
}

export class ProjectService {
  private formatProject(raw: ProjectRecord): SafeProjectDto {
    return {
      id: raw.id,
      name: raw.name,
      description: raw.description,
      status: raw.status,
      start_date: raw.start_date ? String(raw.start_date).split("T")[0] : null,
      end_date: raw.end_date ? String(raw.end_date).split("T")[0] : null,
      owner: raw.owner_id
        ? {
            id: raw.owner_id,
            full_name: raw.owner_name,
            email: raw.owner_email,
          }
        : null,
      creator: {
        id: raw.created_by,
        full_name: raw.creator_name,
        email: raw.creator_email,
      },
      member_count: Number(raw.member_count) || 0,
      task_count: Number(raw.task_count) || 0,
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
   * Lists projects with RBAC scoping and pagination.
   */
  async listProjects(
    filter: ProjectListFilter,
    pagination: ProjectPaginationOptions,
    callerAuth: UserRoleInfo
  ): Promise<{ projects: SafeProjectDto[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const hasBroadView =
      callerAuth.isSuperAdmin ||
      rbacService.hasPermission(callerAuth, "projects.view") ||
      rbacService.hasPermission(callerAuth, "projects.manage");

    let scopedProjectIds: string[] | null = null;
    if (!hasBroadView) {
      scopedProjectIds = await projectRepository.getUserAssociatedProjectIds(callerAuth.userId);
    }

    const page = Math.max(1, Math.floor(pagination.page || 1));
    const limit = Math.max(1, Math.min(100, Math.floor(pagination.limit || 20)));

    const { projects, total } = await projectRepository.listProjects(filter, { page, limit }, scopedProjectIds);
    const formatted = projects.map((p) => this.formatProject(p));
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      projects: formatted,
      pagination: { page, limit, total, totalPages },
    };
  }

  /**
   * Retrieves a single project by ID with IDOR protection.
   */
  async getProjectById(projectId: string, callerAuth: UserRoleInfo): Promise<SafeProjectDto> {
    if (!projectId || !isValidUuid(projectId)) {
      throw new AppError("Invalid project ID format. Must be a valid UUID.", 400, "INVALID_UUID");
    }

    const project = await projectRepository.findById(projectId);
    if (!project) {
      throw new AppError("Project not found", 404, "PROJECT_NOT_FOUND");
    }

    const hasBroadView =
      callerAuth.isSuperAdmin ||
      rbacService.hasPermission(callerAuth, "projects.view") ||
      rbacService.hasPermission(callerAuth, "projects.manage");

    if (!hasBroadView) {
      const isAssociated = await projectRepository.isUserAssociatedWithProject(projectId, callerAuth.userId);
      if (!isAssociated) {
        throw new AppError("You do not have permission to view this project", 403, "FORBIDDEN");
      }
    }

    return this.formatProject(project);
  }

  /**
   * Creates a new project.
   */
  async createProject(body: Record<string, any>, callerAuth: UserRoleInfo): Promise<SafeProjectDto> {
    const canCreate =
      callerAuth.isSuperAdmin || rbacService.hasPermission(callerAuth, "projects.manage");

    if (!canCreate) {
      throw new AppError("You do not have permission to create projects", 403, "FORBIDDEN");
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new AppError("Request body must be a valid JSON object", 400, "INVALID_REQUEST_BODY");
    }

    const { name, description, status, start_date, end_date, owner_id } = body;

    if (typeof name !== "string" || name.trim().length === 0 || name.length > 255) {
      throw new AppError("Project name is required and must be between 1 and 255 characters", 400, "INVALID_FIELD");
    }

    if (owner_id) {
      if (typeof owner_id !== "string" || !isValidUuid(owner_id)) {
        throw new AppError("owner_id must be a valid UUID", 400, "INVALID_UUID");
      }
      const ownerExists = await userRepository.findById(owner_id);
      if (!ownerExists) {
        throw new AppError("Designated project owner does not exist", 400, "USER_NOT_FOUND");
      }
    }

    if (start_date && !isValidDateString(start_date)) {
      throw new AppError("start_date must be in YYYY-MM-DD format", 400, "INVALID_DATE");
    }

    if (end_date && !isValidDateString(end_date)) {
      throw new AppError("end_date must be in YYYY-MM-DD format", 400, "INVALID_DATE");
    }

    const created = await projectRepository.createProject({
      name: name.trim(),
      description: typeof description === "string" ? description.trim() : null,
      status: typeof status === "string" ? status.trim() : "Active",
      start_date: start_date ? String(start_date).trim() : null,
      end_date: end_date ? String(end_date).trim() : null,
      owner_id: owner_id ? String(owner_id).trim() : null,
      created_by: callerAuth.userId,
    });

    return this.formatProject(created);
  }

  /**
   * Updates an existing project.
   */
  async updateProject(
    projectId: string,
    body: Record<string, any>,
    callerAuth: UserRoleInfo
  ): Promise<SafeProjectDto> {
    if (!projectId || !isValidUuid(projectId)) {
      throw new AppError("Invalid project ID format. Must be a valid UUID.", 400, "INVALID_UUID");
    }

    const project = await projectRepository.findById(projectId);
    if (!project) {
      throw new AppError("Project not found", 404, "PROJECT_NOT_FOUND");
    }

    const canManage =
      callerAuth.isSuperAdmin ||
      rbacService.hasPermission(callerAuth, "projects.manage") ||
      project.owner_id === callerAuth.userId;

    if (!canManage) {
      throw new AppError("You do not have permission to update this project", 403, "FORBIDDEN");
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new AppError("Request body must be a valid JSON object", 400, "INVALID_REQUEST_BODY");
    }

    const providedKeys = Object.keys(body);
    if (providedKeys.length === 0) {
      return this.formatProject(project);
    }

    for (const key of providedKeys) {
      if (!PROJECT_ALLOWED_UPDATE_FIELDS.has(key)) {
        throw new AppError(
          `Field '${key}' cannot be updated. Allowed fields: ${Array.from(PROJECT_ALLOWED_UPDATE_FIELDS).join(", ")}`,
          400,
          "RESTRICTED_OR_UNKNOWN_FIELD"
        );
      }
    }

    const fieldsToUpdate: Record<string, any> = {};

    if ("name" in body) {
      const val = body.name;
      if (typeof val !== "string" || val.trim().length === 0 || val.length > 255) {
        throw new AppError("name must be a non-empty string up to 255 characters", 400, "INVALID_FIELD");
      }
      fieldsToUpdate.name = val.trim();
    }

    if ("description" in body) {
      const val = body.description;
      fieldsToUpdate.description = typeof val === "string" ? val.trim() : null;
    }

    if ("status" in body) {
      const val = body.status;
      if (typeof val !== "string" || val.trim().length === 0 || val.length > 50) {
        throw new AppError("status must be a string up to 50 characters", 400, "INVALID_FIELD");
      }
      fieldsToUpdate.status = val.trim();
    }

    if ("start_date" in body) {
      const val = body.start_date;
      if (val !== null && val !== undefined && val !== "") {
        if (!isValidDateString(val)) {
          throw new AppError("start_date must be in YYYY-MM-DD format or null", 400, "INVALID_DATE");
        }
        fieldsToUpdate.start_date = String(val).trim();
      } else {
        fieldsToUpdate.start_date = null;
      }
    }

    if ("end_date" in body) {
      const val = body.end_date;
      if (val !== null && val !== undefined && val !== "") {
        if (!isValidDateString(val)) {
          throw new AppError("end_date must be in YYYY-MM-DD format or null", 400, "INVALID_DATE");
        }
        fieldsToUpdate.end_date = String(val).trim();
      } else {
        fieldsToUpdate.end_date = null;
      }
    }

    if ("owner_id" in body) {
      const val = body.owner_id;
      if (val !== null && val !== undefined && val !== "") {
        if (!isValidUuid(val)) {
          throw new AppError("owner_id must be a valid UUID or null", 400, "INVALID_UUID");
        }
        const ownerExists = await userRepository.findById(val);
        if (!ownerExists) {
          throw new AppError("Designated project owner does not exist", 400, "USER_NOT_FOUND");
        }
        fieldsToUpdate.owner_id = String(val).trim();
      } else {
        fieldsToUpdate.owner_id = null;
      }
    }

    const updated = await projectRepository.update(projectId, fieldsToUpdate);
    if (!updated) {
      throw new AppError("Project not found", 404, "PROJECT_NOT_FOUND");
    }

    return this.formatProject(updated);
  }

  /**
   * Retrieves members for a project.
   */
  async getProjectMembers(projectId: string, callerAuth: UserRoleInfo): Promise<ProjectMemberRecord[]> {
    if (!projectId || !isValidUuid(projectId)) {
      throw new AppError("Invalid project ID format. Must be a valid UUID.", 400, "INVALID_UUID");
    }

    // Ensure user is authorized to view project
    await this.getProjectById(projectId, callerAuth);

    return projectRepository.getMembers(projectId);
  }

  /**
   * Adds a member to a project.
   */
  async addProjectMember(
    projectId: string,
    targetUserId: string,
    callerAuth: UserRoleInfo
  ): Promise<ProjectMemberRecord[]> {
    if (!projectId || !isValidUuid(projectId)) {
      throw new AppError("Invalid project ID format. Must be a valid UUID.", 400, "INVALID_UUID");
    }
    if (!targetUserId || !isValidUuid(targetUserId)) {
      throw new AppError("Invalid target user ID format. Must be a valid UUID.", 400, "INVALID_UUID");
    }

    const project = await projectRepository.findById(projectId);
    if (!project) {
      throw new AppError("Project not found", 404, "PROJECT_NOT_FOUND");
    }

    const canManage =
      callerAuth.isSuperAdmin ||
      rbacService.hasPermission(callerAuth, "projects.manage") ||
      project.owner_id === callerAuth.userId;

    if (!canManage) {
      throw new AppError("You do not have permission to manage members for this project", 403, "FORBIDDEN");
    }

    const targetUser = await userRepository.findById(targetUserId);
    if (!targetUser) {
      throw new AppError("Target user does not exist", 404, "USER_NOT_FOUND");
    }

    const isAlreadyMember = await projectRepository.isProjectMember(projectId, targetUserId);
    if (!isAlreadyMember) {
      await projectRepository.addMember(projectId, targetUserId);
    }

    return projectRepository.getMembers(projectId);
  }

  /**
   * Removes a member from a project.
   */
  async removeProjectMember(
    projectId: string,
    targetUserId: string,
    callerAuth: UserRoleInfo
  ): Promise<{ message: string }> {
    if (!projectId || !isValidUuid(projectId)) {
      throw new AppError("Invalid project ID format. Must be a valid UUID.", 400, "INVALID_UUID");
    }
    if (!targetUserId || !isValidUuid(targetUserId)) {
      throw new AppError("Invalid target user ID format. Must be a valid UUID.", 400, "INVALID_UUID");
    }

    const project = await projectRepository.findById(projectId);
    if (!project) {
      throw new AppError("Project not found", 404, "PROJECT_NOT_FOUND");
    }

    const canManage =
      callerAuth.isSuperAdmin ||
      rbacService.hasPermission(callerAuth, "projects.manage") ||
      project.owner_id === callerAuth.userId;

    if (!canManage) {
      throw new AppError("You do not have permission to manage members for this project", 403, "FORBIDDEN");
    }

    const removed = await projectRepository.removeMember(projectId, targetUserId);
    if (!removed) {
      throw new AppError("User is not a member of this project", 404, "MEMBER_NOT_FOUND");
    }

    return { message: "Member removed from project successfully" };
  }
}

export const projectService = new ProjectService();
