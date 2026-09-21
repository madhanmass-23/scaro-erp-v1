import {
  departmentRepository,
  DepartmentRecord,
  DepartmentListFilter,
  DepartmentPaginationOptions,
} from "../repositories/department.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { authorizationService } from "./authorization.service.js";
import { UserRoleInfo } from "./rbac.service.js";
import { AppError } from "../types/api.types.js";
import { isValidUuid } from "../utils/validation.util.js";

export interface SafeDepartmentDto {
  id: string;
  name: string;
  description: string | null;
  manager: {
    id: string;
    full_name: string;
    email: string;
  } | null;
  is_active: boolean;
  member_count: number;
  created_at: string;
  updated_at: string;
}

export class DepartmentService {
  private formatDepartment(raw: DepartmentRecord): SafeDepartmentDto {
    return {
      id: raw.id,
      name: raw.name,
      description: raw.description || null,
      manager: raw.manager_id
        ? {
            id: raw.manager_id,
            full_name: raw.manager_name || "Unknown",
            email: raw.manager_email || "unknown@scaroerp.com",
          }
        : null,
      is_active: raw.is_active === 1 || raw.is_active === true,
      member_count: Number(raw.member_count) || 0,
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
   * Lists all departments with optional filters and pagination.
   */
  async listDepartments(
    filter: DepartmentListFilter,
    pagination: DepartmentPaginationOptions,
    callerAuth: UserRoleInfo
  ): Promise<{ departments: SafeDepartmentDto[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const authCheck = authorizationService.canViewDepartments(callerAuth);
    if (!authCheck.allowed) {
      throw new AppError(authCheck.reason || "Authentication required", 401, "UNAUTHENTICATED");
    }

    const page = Math.max(1, Math.floor(pagination.page || 1));
    const limit = Math.max(1, Math.min(100, Math.floor(pagination.limit || 20)));

    const { departments, total } = await departmentRepository.listDepartments(filter, { page, limit });
    const formatted = departments.map((d) => this.formatDepartment(d));
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      departments: formatted,
      pagination: { page, limit, total, totalPages },
    };
  }

  /**
   * Retrieves a single department by ID.
   */
  async getDepartmentById(id: string, callerAuth: UserRoleInfo): Promise<SafeDepartmentDto> {
    if (!isValidUuid(id)) {
      throw new AppError("Invalid department ID format. Expected UUID.", 400, "INVALID_UUID");
    }

    const authCheck = authorizationService.canViewDepartments(callerAuth);
    if (!authCheck.allowed) {
      throw new AppError(authCheck.reason || "Authentication required", 401, "UNAUTHENTICATED");
    }

    const department = await departmentRepository.findById(id);
    if (!department) {
      throw new AppError("Department not found", 404, "DEPARTMENT_NOT_FOUND");
    }

    return this.formatDepartment(department);
  }

  /**
   * Creates a new department. Restricted to Super Admin and Admin.
   */
  async createDepartment(
    payload: {
      name: string;
      description?: string | null;
      manager_id?: string | null;
      is_active?: boolean;
    },
    callerAuth: UserRoleInfo
  ): Promise<SafeDepartmentDto> {
    const authCheck = authorizationService.canManageDepartments(callerAuth);
    if (!authCheck.allowed) {
      throw new AppError(authCheck.reason || "Forbidden: Only management can create departments.", 403, "FORBIDDEN");
    }

    if (!payload.name || typeof payload.name !== "string" || !payload.name.trim()) {
      throw new AppError("Department name is required.", 400, "INVALID_NAME");
    }
    if (payload.name.trim().length > 255) {
      throw new AppError("Department name must not exceed 255 characters.", 400, "NAME_TOO_LONG");
    }

    const cleanName = payload.name.trim();

    let managerId: string | null = null;
    if (payload.manager_id) {
      if (!isValidUuid(payload.manager_id)) {
        throw new AppError("Invalid manager_id UUID format.", 400, "INVALID_UUID");
      }
      managerId = payload.manager_id.trim();
    }

    // Check unique name
    const existingName = await departmentRepository.findByName(cleanName);
    if (existingName) {
      throw new AppError("A department with this name already exists.", 409, "DUPLICATE_NAME");
    }

    if (managerId) {
      const managerUser = await userRepository.findById(managerId);
      if (!managerUser) {
        throw new AppError("Manager user profile not found.", 404, "MANAGER_NOT_FOUND");
      }
    }

    const created = await departmentRepository.createDepartment({
      name: cleanName,
      description: payload.description || null,
      manager_id: managerId,
      is_active: payload.is_active !== undefined ? payload.is_active : true,
    });

    // Record Audit Log
    await auditRepository.log({
      actor_id: callerAuth.userId,
      action: "INSERT",
      table_name: "departments",
      record_id: created.id,
      new_value: {
        name: created.name,
        manager_id: created.manager_id,
        is_active: created.is_active,
      },
    });

    return this.formatDepartment(created);
  }

  /**
   * Updates an existing department.
   */
  async updateDepartment(
    id: string,
    payload: {
      name?: string;
      description?: string | null;
      manager_id?: string | null;
      is_active?: boolean;
    },
    callerAuth: UserRoleInfo
  ): Promise<SafeDepartmentDto> {
    if (!isValidUuid(id)) {
      throw new AppError("Invalid department ID format. Expected UUID.", 400, "INVALID_UUID");
    }

    const authCheck = authorizationService.canManageDepartments(callerAuth);
    if (!authCheck.allowed) {
      throw new AppError(authCheck.reason || "Forbidden: Only management can update departments.", 403, "FORBIDDEN");
    }

    const existing = await departmentRepository.findById(id);
    if (!existing) {
      throw new AppError("Department not found", 404, "DEPARTMENT_NOT_FOUND");
    }

    const fieldsToUpdate: Record<string, any> = {};

    if (payload.name !== undefined) {
      if (typeof payload.name !== "string" || !payload.name.trim()) {
        throw new AppError("Department name cannot be empty.", 400, "INVALID_NAME");
      }
      if (payload.name.trim().length > 255) {
        throw new AppError("Department name must not exceed 255 characters.", 400, "NAME_TOO_LONG");
      }
      const cleanName = payload.name.trim();
      if (cleanName.toLowerCase() !== existing.name.toLowerCase()) {
        const duplicate = await departmentRepository.findByName(cleanName);
        if (duplicate && duplicate.id !== id) {
          throw new AppError("A department with this name already exists.", 409, "DUPLICATE_NAME");
        }
      }
      fieldsToUpdate.name = cleanName;
    }

    if (payload.description !== undefined) {
      fieldsToUpdate.description = payload.description ? payload.description.trim() : null;
    }

    if (payload.manager_id !== undefined) {
      if (payload.manager_id !== null) {
        if (!isValidUuid(payload.manager_id)) {
          throw new AppError("Invalid manager_id UUID format.", 400, "INVALID_UUID");
        }
        const managerUser = await userRepository.findById(payload.manager_id.trim());
        if (!managerUser) {
          throw new AppError("Manager user profile not found.", 404, "MANAGER_NOT_FOUND");
        }
        fieldsToUpdate.manager_id = payload.manager_id.trim();
      } else {
        fieldsToUpdate.manager_id = null;
      }
    }

    if (payload.is_active !== undefined) {
      fieldsToUpdate.is_active = payload.is_active ? 1 : 0;
    }

    const updated = await departmentRepository.updateDepartment(id, fieldsToUpdate);
    if (!updated) {
      throw new AppError("Failed to update department", 500, "UPDATE_FAILED");
    }

    // Record Audit Log
    await auditRepository.log({
      actor_id: callerAuth.userId,
      action: "UPDATE",
      table_name: "departments",
      record_id: id,
      old_value: {
        name: existing.name,
        manager_id: existing.manager_id,
        is_active: existing.is_active,
      },
      new_value: fieldsToUpdate,
    });

    return this.formatDepartment(updated);
  }
}

export const departmentService = new DepartmentService();
