import { Request, Response, NextFunction } from "express";
import { rbacService, UserRoleInfo } from "../services/rbac.service.js";
import { AppError } from "../types/api.types.js";

declare global {
  namespace Express {
    interface Request {
      auth?: UserRoleInfo;
    }
  }
}

/**
 * Middleware factory enforcing granular RBAC permission.
 * Fails closed if the user lacks the permission.
 */
export function requirePermission(permission: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new AppError("Authentication required", 401, "UNAUTHENTICATED");
      }

      const roleInfo = await rbacService.getUserRoleAndPermissions(req.user.id);
      req.auth = roleInfo;

      if (!rbacService.hasPermission(roleInfo, permission)) {
        throw new AppError(
          "You do not have permission to perform this action",
          403,
          "FORBIDDEN"
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Middleware factory enforcing role membership.
 */
export function requireRole(...allowedRoles: string[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new AppError("Authentication required", 401, "UNAUTHENTICATED");
      }

      const roleInfo = await rbacService.getUserRoleAndPermissions(req.user.id);
      req.auth = roleInfo;

      if (!rbacService.hasAnyRole(roleInfo, allowedRoles)) {
        throw new AppError(
          "You do not have the required role to access this resource",
          403,
          "FORBIDDEN"
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Middleware factory allowing access if the user owns the target resource
 * OR has the required management permission.
 */
export function requireSelfOrPermission(
  targetUserIdExtractor: (req: Request) => string | undefined,
  permission: string
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new AppError("Authentication required", 401, "UNAUTHENTICATED");
      }

      const roleInfo = await rbacService.getUserRoleAndPermissions(req.user.id);
      req.auth = roleInfo;

      const targetUserId = targetUserIdExtractor(req);
      const isSelf = targetUserId && targetUserId === req.user.id;

      if (isSelf) {
        return next();
      }

      if (!rbacService.hasPermission(roleInfo, permission)) {
        throw new AppError(
          "You do not have permission to access another user's resource",
          403,
          "FORBIDDEN"
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
