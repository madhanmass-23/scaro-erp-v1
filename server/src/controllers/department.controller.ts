import { Request, Response, NextFunction } from "express";
import { departmentService } from "../services/department.service.js";
import { rbacService, UserRoleInfo } from "../services/rbac.service.js";
import { sendSuccess, sendPaginatedSuccess } from "../utils/apiResponse.js";
import { AppError } from "../types/api.types.js";
import { DepartmentListFilter } from "../repositories/department.repository.js";

export class DepartmentController {
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
   * GET /api/v1/departments
   */
  listDepartments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await this.getAuthContext(req);

      const filter: DepartmentListFilter = {};
      if (req.query.is_active !== undefined) {
        if (req.query.is_active === "true" || req.query.is_active === "1") {
          filter.is_active = true;
        } else if (req.query.is_active === "false" || req.query.is_active === "0") {
          filter.is_active = false;
        }
      }
      if (typeof req.query.search === "string" && req.query.search.trim()) {
        filter.search = req.query.search.trim();
      }

      const page = parseInt(String(req.query.page || "1"), 10) || 1;
      const limit = parseInt(String(req.query.limit || "20"), 10) || 20;

      const result = await departmentService.listDepartments(filter, { page, limit }, auth);
      sendPaginatedSuccess(res, result.departments, result.pagination);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/departments/:id
   */
  getDepartmentById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id || "");
      const department = await departmentService.getDepartmentById(id, auth);
      sendSuccess(res, department);
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/departments
   */
  createDepartment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await this.getAuthContext(req);
      const { name, description, manager_id, is_active } = req.body;

      const department = await departmentService.createDepartment(
        {
          name,
          description,
          manager_id,
          is_active,
        },
        auth
      );

      sendSuccess(res, department, 201);
    } catch (err) {
      next(err);
    }
  };

  /**
   * PATCH /api/v1/departments/:id
   */
  updateDepartment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await this.getAuthContext(req);
      const id = String(req.params.id || "");
      const { name, description, manager_id, is_active } = req.body;

      const department = await departmentService.updateDepartment(
        id,
        {
          name,
          description,
          manager_id,
          is_active,
        },
        auth
      );

      sendSuccess(res, department);
    } catch (err) {
      next(err);
    }
  };
}

export const departmentController = new DepartmentController();
