import { query, queryOne } from "../utils/database.util.js";
import { AppError } from "../types/api.types.js";

export interface UserRoleInfo {
  userId: string;
  roleId: string | null;
  role: string;
  permissions: string[];
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isEmployee: boolean;
  isIntern: boolean;
}

interface UserRoleDbRow {
  user_id: string;
  role_id: string;
  role_name: string;
}

interface PermissionDbRow {
  permission_name: string;
}

export class RbacService {
  /**
   * Resolves the authoritative role and permissions for a user from MariaDB.
   * Fails closed if user or role cannot be resolved.
   */
  async getUserRoleAndPermissions(userId: string): Promise<UserRoleInfo> {
    if (!userId) {
      throw new AppError("User ID is required for authorization", 401, "UNAUTHENTICATED");
    }

    // 1. Fetch user role assignment
    const roleSql = `
      SELECT ur.user_id, ur.role_id, r.name AS role_name
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = ?
      LIMIT 1
    `;
    const roleRow = await queryOne<UserRoleDbRow>(roleSql, [userId]);

    if (!roleRow || !roleRow.role_name) {
      // Fail closed: User has no assigned role
      throw new AppError(
        "User has no assigned role. Access denied.",
        403,
        "FORBIDDEN_NO_ROLE"
      );
    }

    const roleName = roleRow.role_name;
    const isSuperAdmin = roleName === "Super Admin";
    const isAdmin = roleName === "Admin";
    const isEmployee = roleName === "Employee";
    const isIntern = roleName === "Intern";

    // 2. Fetch associated permissions
    let permissions: string[] = [];

    if (isSuperAdmin) {
      // Super Admin has all registered system permissions
      const allPerms = await query<PermissionDbRow>("SELECT name AS permission_name FROM permissions");
      permissions = allPerms.map((p) => p.permission_name);
      permissions.push("*"); // Wildcard permission token
    } else {
      const permSql = `
        SELECT p.name AS permission_name
        FROM role_permissions rp
        JOIN permissions p ON rp.permission_id = p.id
        WHERE rp.role_id = ?
      `;
      const permRows = await query<PermissionDbRow>(permSql, [roleRow.role_id]);
      permissions = permRows.map((p) => p.permission_name);
    }

    return {
      userId,
      roleId: roleRow.role_id,
      role: roleName,
      permissions,
      isSuperAdmin,
      isAdmin,
      isEmployee,
      isIntern,
    };
  }

  /**
   * Checks if the user has a specific permission.
   */
  hasPermission(userRoleInfo: UserRoleInfo, requiredPermission: string): boolean {
    if (!userRoleInfo) return false;
    if (userRoleInfo.isSuperAdmin) return true;
    if (userRoleInfo.permissions.includes("*")) return true;
    return userRoleInfo.permissions.includes(requiredPermission);
  }

  /**
   * Checks if the user has any of the specified roles.
   */
  hasAnyRole(userRoleInfo: UserRoleInfo, allowedRoles: string[]): boolean {
    if (!userRoleInfo) return false;
    if (userRoleInfo.isSuperAdmin) return true;
    return allowedRoles.includes(userRoleInfo.role);
  }
}

export const rbacService = new RbacService();
