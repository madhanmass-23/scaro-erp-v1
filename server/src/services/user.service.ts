import { userRepository, UserProfileRecord, UserListFilter, PaginationOptions } from "../repositories/user.repository.js";
import { UserRoleInfo, rbacService } from "./rbac.service.js";
import { AppError } from "../types/api.types.js";
import { isValidUuid, isValidDateString } from "../utils/validation.util.js";

const SELF_ALLOWED_FIELDS = new Set(["full_name", "phone", "avatar_url", "linkedin", "github"]);

const MANAGEMENT_ALLOWED_FIELDS = new Set([
  "full_name",
  "phone",
  "avatar_url",
  "linkedin",
  "github",
  "designation",
  "department_id",
  "joining_date",
]);

export interface SafeUserProfile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  department_id: string | null;
  department: string | null;
  designation: string | null;
  joining_date: string | null;
  employment_status: string;
  is_active: boolean;
  linkedin: string | null;
  github: string | null;
  role: string;
  created_at: string;
  updated_at: string;
}

export class UserService {
  /**
   * Sanitizes a raw database profile record into a safe, client-facing profile payload.
   */
  private formatProfile(raw: UserProfileRecord): SafeUserProfile {
    return {
      id: raw.id,
      email: raw.email,
      full_name: raw.full_name,
      avatar_url: raw.avatar_url,
      phone: raw.phone,
      department_id: raw.department_id,
      department: raw.department_name,
      designation: raw.designation,
      joining_date: raw.joining_date
        ? (typeof raw.joining_date === "object" && raw.joining_date !== null && "toISOString" in raw.joining_date
            ? (raw.joining_date as Date).toISOString().split("T")[0]
            : String(raw.joining_date).split("T")[0])
        : null,
      employment_status: raw.employment_status,
      is_active: raw.is_active === 1,
      linkedin: raw.linkedin,
      github: raw.github,
      role: raw.role,
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
   * Retrieves the current authenticated user's profile.
   */
  async getCurrentUserProfile(userId: string): Promise<SafeUserProfile> {
    if (!userId || !isValidUuid(userId)) {
      throw new AppError("Invalid user identity", 401, "UNAUTHENTICATED");
    }

    const profile = await userRepository.findById(userId);
    if (!profile) {
      throw new AppError("User profile not found", 404, "USER_NOT_FOUND");
    }

    return this.formatProfile(profile);
  }

  /**
   * Retrieves a user profile by ID with IDOR protection.
   */
  async getUserById(targetUserId: string, callerAuth: UserRoleInfo): Promise<SafeUserProfile> {
    if (!targetUserId || !isValidUuid(targetUserId)) {
      throw new AppError("Invalid user ID format. Must be a valid UUID.", 400, "INVALID_UUID");
    }

    const isSelf = targetUserId === callerAuth.userId;
    const canView =
      isSelf ||
      callerAuth.isSuperAdmin ||
      rbacService.hasPermission(callerAuth, "users.view") ||
      rbacService.hasPermission(callerAuth, "users.manage");

    if (!canView) {
      throw new AppError(
        "You do not have permission to view this user's profile",
        403,
        "FORBIDDEN"
      );
    }

    const profile = await userRepository.findById(targetUserId);
    if (!profile) {
      throw new AppError("User profile not found", 404, "USER_NOT_FOUND");
    }

    return this.formatProfile(profile);
  }

  /**
   * Lists users with safe filtering and pagination for authorized callers.
   */
  async listUsers(
    filter: UserListFilter,
    pagination: PaginationOptions,
    callerAuth: UserRoleInfo
  ): Promise<{ users: SafeUserProfile[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const canList =
      callerAuth.isSuperAdmin ||
      rbacService.hasPermission(callerAuth, "users.view") ||
      rbacService.hasPermission(callerAuth, "users.manage");

    if (!canList) {
      throw new AppError(
        "You do not have permission to view the workforce user directory",
        403,
        "FORBIDDEN"
      );
    }

    const page = Math.max(1, Math.floor(pagination.page || 1));
    const limit = Math.max(1, Math.min(100, Math.floor(pagination.limit || 20)));

    const { users, total } = await userRepository.listUsers(filter, { page, limit });
    const formatted = users.map((u) => this.formatProfile(u));
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      users: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Updates the authenticated user's own profile fields (allow-list only).
   */
  async updateOwnProfile(userId: string, body: Record<string, any>): Promise<SafeUserProfile> {
    if (!userId || !isValidUuid(userId)) {
      throw new AppError("Invalid user identity", 401, "UNAUTHENTICATED");
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new AppError("Request body must be a valid JSON object", 400, "INVALID_REQUEST_BODY");
    }

    const providedKeys = Object.keys(body);
    if (providedKeys.length === 0) {
      return this.getCurrentUserProfile(userId);
    }

    // Strict reject for unknown or restricted fields
    for (const key of providedKeys) {
      if (!SELF_ALLOWED_FIELDS.has(key)) {
        throw new AppError(
          `Field '${key}' cannot be modified. You may only update: ${Array.from(SELF_ALLOWED_FIELDS).join(", ")}`,
          400,
          "RESTRICTED_OR_UNKNOWN_FIELD"
        );
      }
    }

    const fieldsToUpdate: Record<string, any> = {};

    if ("full_name" in body) {
      const val = body.full_name;
      if (typeof val !== "string" || val.trim().length === 0 || val.length > 255) {
        throw new AppError("full_name must be a non-empty string up to 255 characters", 400, "INVALID_FIELD");
      }
      fieldsToUpdate.full_name = val.trim();
    }

    if ("phone" in body) {
      const val = body.phone;
      if (val !== null && val !== undefined) {
        if (typeof val !== "string" || val.length > 50) {
          throw new AppError("phone must be a string up to 50 characters or null", 400, "INVALID_FIELD");
        }
        fieldsToUpdate.phone = val.trim() || null;
      } else {
        fieldsToUpdate.phone = null;
      }
    }

    if ("avatar_url" in body) {
      const val = body.avatar_url;
      if (val !== null && val !== undefined) {
        if (typeof val !== "string" || val.length > 2048) {
          throw new AppError("avatar_url must be a string up to 2048 characters or null", 400, "INVALID_FIELD");
        }
        fieldsToUpdate.avatar_url = val.trim() || null;
      } else {
        fieldsToUpdate.avatar_url = null;
      }
    }

    if ("linkedin" in body) {
      const val = body.linkedin;
      if (val !== null && val !== undefined) {
        if (typeof val !== "string" || val.length > 255) {
          throw new AppError("linkedin must be a string up to 255 characters or null", 400, "INVALID_FIELD");
        }
        fieldsToUpdate.linkedin = val.trim() || null;
      } else {
        fieldsToUpdate.linkedin = null;
      }
    }

    if ("github" in body) {
      const val = body.github;
      if (val !== null && val !== undefined) {
        if (typeof val !== "string" || val.length > 255) {
          throw new AppError("github must be a string up to 255 characters or null", 400, "INVALID_FIELD");
        }
        fieldsToUpdate.github = val.trim() || null;
      } else {
        fieldsToUpdate.github = null;
      }
    }

    const updated = await userRepository.update(userId, fieldsToUpdate);
    if (!updated) {
      throw new AppError("User profile not found", 404, "USER_NOT_FOUND");
    }

    return this.formatProfile(updated);
  }

  /**
   * Updates another user's profile (management operation).
   */
  async updateUserById(
    targetUserId: string,
    body: Record<string, any>,
    callerAuth: UserRoleInfo
  ): Promise<SafeUserProfile> {
    if (!targetUserId || !isValidUuid(targetUserId)) {
      throw new AppError("Invalid user ID format. Must be a valid UUID.", 400, "INVALID_UUID");
    }

    const canManage =
      callerAuth.isSuperAdmin || rbacService.hasPermission(callerAuth, "users.manage");

    if (!canManage) {
      throw new AppError(
        "You do not have permission to modify other users' profiles",
        403,
        "FORBIDDEN"
      );
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new AppError("Request body must be a valid JSON object", 400, "INVALID_REQUEST_BODY");
    }

    const targetUser = await userRepository.findById(targetUserId);
    if (!targetUser) {
      throw new AppError("User profile not found", 404, "USER_NOT_FOUND");
    }

    const providedKeys = Object.keys(body);
    if (providedKeys.length === 0) {
      return this.formatProfile(targetUser);
    }

    // Strict reject for unknown or non-management fields
    for (const key of providedKeys) {
      if (!MANAGEMENT_ALLOWED_FIELDS.has(key)) {
        throw new AppError(
          `Field '${key}' is read-only or unsupported in this endpoint. Allowed management fields: ${Array.from(MANAGEMENT_ALLOWED_FIELDS).join(", ")}`,
          400,
          "RESTRICTED_OR_UNKNOWN_FIELD"
        );
      }
    }

    const fieldsToUpdate: Record<string, any> = {};

    if ("full_name" in body) {
      const val = body.full_name;
      if (typeof val !== "string" || val.trim().length === 0 || val.length > 255) {
        throw new AppError("full_name must be a non-empty string up to 255 characters", 400, "INVALID_FIELD");
      }
      fieldsToUpdate.full_name = val.trim();
    }

    if ("phone" in body) {
      const val = body.phone;
      if (val !== null && val !== undefined) {
        if (typeof val !== "string" || val.length > 50) {
          throw new AppError("phone must be a string up to 50 characters or null", 400, "INVALID_FIELD");
        }
        fieldsToUpdate.phone = val.trim() || null;
      } else {
        fieldsToUpdate.phone = null;
      }
    }

    if ("avatar_url" in body) {
      const val = body.avatar_url;
      if (val !== null && val !== undefined) {
        if (typeof val !== "string" || val.length > 2048) {
          throw new AppError("avatar_url must be a string up to 2048 characters or null", 400, "INVALID_FIELD");
        }
        fieldsToUpdate.avatar_url = val.trim() || null;
      } else {
        fieldsToUpdate.avatar_url = null;
      }
    }

    if ("linkedin" in body) {
      const val = body.linkedin;
      if (val !== null && val !== undefined) {
        if (typeof val !== "string" || val.length > 255) {
          throw new AppError("linkedin must be a string up to 255 characters or null", 400, "INVALID_FIELD");
        }
        fieldsToUpdate.linkedin = val.trim() || null;
      } else {
        fieldsToUpdate.linkedin = null;
      }
    }

    if ("github" in body) {
      const val = body.github;
      if (val !== null && val !== undefined) {
        if (typeof val !== "string" || val.length > 255) {
          throw new AppError("github must be a string up to 255 characters or null", 400, "INVALID_FIELD");
        }
        fieldsToUpdate.github = val.trim() || null;
      } else {
        fieldsToUpdate.github = null;
      }
    }

    if ("designation" in body) {
      const val = body.designation;
      if (val !== null && val !== undefined) {
        if (typeof val !== "string" || val.length > 255) {
          throw new AppError("designation must be a string up to 255 characters or null", 400, "INVALID_FIELD");
        }
        fieldsToUpdate.designation = val.trim() || null;
      } else {
        fieldsToUpdate.designation = null;
      }
    }

    if ("department_id" in body) {
      const val = body.department_id;
      if (val !== null && val !== undefined && val !== "") {
        if (typeof val !== "string" || !isValidUuid(val)) {
          throw new AppError("department_id must be a valid UUID or null", 400, "INVALID_UUID");
        }
        const exists = await userRepository.departmentExists(val);
        if (!exists) {
          throw new AppError("Referenced department does not exist or is inactive", 400, "DEPARTMENT_NOT_FOUND");
        }
        fieldsToUpdate.department_id = val;
      } else {
        fieldsToUpdate.department_id = null;
      }
    }

    if ("joining_date" in body) {
      const val = body.joining_date;
      if (val !== null && val !== undefined && val !== "") {
        if (typeof val !== "string" || !isValidDateString(val)) {
          throw new AppError("joining_date must be a valid YYYY-MM-DD date or null", 400, "INVALID_DATE");
        }
        fieldsToUpdate.joining_date = val.trim();
      } else {
        fieldsToUpdate.joining_date = null;
      }
    }

    const updated = await userRepository.update(targetUserId, fieldsToUpdate);
    if (!updated) {
      throw new AppError("User profile not found", 404, "USER_NOT_FOUND");
    }

    return this.formatProfile(updated);
  }
}

export const userService = new UserService();
