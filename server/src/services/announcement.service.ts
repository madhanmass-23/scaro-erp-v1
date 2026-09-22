import {
  announcementRepository,
  AnnouncementRecord,
  AnnouncementListFilter,
  AnnouncementPaginationOptions,
  UserAudienceScope,
} from "../repositories/announcement.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { notificationRepository } from "../repositories/notification.repository.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { authorizationService } from "./authorization.service.js";
import { UserRoleInfo } from "./rbac.service.js";
import { AppError } from "../types/api.types.js";
import { isValidUuid } from "../utils/validation.util.js";

export interface SafeAnnouncementDto {
  id: string;
  author: {
    id: string;
    full_name: string;
    email: string;
    avatar_url: string | null;
    role: string;
  };
  title: string;
  content: string;
  priority: string;
  audience: "Everyone" | "Employees" | "Interns" | "Department";
  department_id: string | null;
  department_name: string | null;
  published_at: string;
  created_at: string;
  updated_at: string;
}

export class AnnouncementService {
  private formatAnnouncement(raw: AnnouncementRecord): SafeAnnouncementDto {
    return {
      id: raw.id,
      author: {
        id: raw.author_id,
        full_name: raw.author_name || "Unknown",
        email: raw.author_email || "unknown@scaroerp.com",
        avatar_url: raw.author_avatar || null,
        role: raw.author_role || "Admin",
      },
      title: raw.title,
      content: raw.content,
      priority: raw.priority,
      audience: raw.audience,
      department_id: raw.department_id || null,
      department_name: raw.department_name || null,
      published_at:
        typeof raw.published_at === "object" && raw.published_at !== null && "toISOString" in raw.published_at
          ? (raw.published_at as Date).toISOString()
          : String(raw.published_at),
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
   * Lists announcements accessible by the caller based on role and audience scopes.
   */
  async listAnnouncements(
    filter: AnnouncementListFilter,
    pagination: AnnouncementPaginationOptions,
    callerAuth: UserRoleInfo
  ): Promise<{ announcements: SafeAnnouncementDto[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const callerProfile = await userRepository.findById(callerAuth.userId);

    const userScope: UserAudienceScope = {
      isSuperAdmin: callerAuth.isSuperAdmin,
      isAdmin: callerAuth.isAdmin,
      isEmployee: callerAuth.isEmployee,
      isIntern: callerAuth.isIntern,
      departmentId: callerProfile?.department_id || null,
    };

    const page = Math.max(1, Math.floor(pagination.page || 1));
    const limit = Math.max(1, Math.min(100, Math.floor(pagination.limit || 20)));

    const { announcements, total } = await announcementRepository.listAnnouncements(
      filter,
      { page, limit },
      userScope
    );

    const formatted = announcements.map((a) => this.formatAnnouncement(a));
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      announcements: formatted,
      pagination: { page, limit, total, totalPages },
    };
  }

  /**
   * Retrieves a single announcement by ID with audience authorization check.
   */
  async getAnnouncementById(id: string, callerAuth: UserRoleInfo): Promise<SafeAnnouncementDto> {
    if (!isValidUuid(id)) {
      throw new AppError("Invalid announcement ID format. Expected UUID.", 400, "INVALID_UUID");
    }

    const announcement = await announcementRepository.findById(id);
    if (!announcement) {
      throw new AppError("Announcement not found", 404, "ANNOUNCEMENT_NOT_FOUND");
    }

    const callerProfile = await userRepository.findById(callerAuth.userId);
    const authCheck = authorizationService.canViewAnnouncement(
      callerAuth,
      announcement.audience,
      announcement.department_id,
      callerProfile?.department_id || null
    );

    if (!authCheck.allowed) {
      throw new AppError(authCheck.reason || "Forbidden: You are not authorized to view this announcement.", 403, "FORBIDDEN");
    }

    return this.formatAnnouncement(announcement);
  }

  /**
   * Creates an announcement. Restricted to Super Admin and Admin.
   */
  async createAnnouncement(
    payload: {
      title: string;
      content: string;
      priority?: string;
      audience?: "Everyone" | "Employees" | "Interns" | "Department";
      department_id?: string | null;
      published_at?: string;
    },
    callerAuth: UserRoleInfo
  ): Promise<SafeAnnouncementDto> {
    const authCheck = authorizationService.canCreateAnnouncement(callerAuth);
    if (!authCheck.allowed) {
      throw new AppError(authCheck.reason || "Forbidden: Only management can create announcements.", 403, "FORBIDDEN");
    }

    // Validation
    if (!payload.title || typeof payload.title !== "string" || !payload.title.trim()) {
      throw new AppError("Announcement title is required.", 400, "INVALID_TITLE");
    }
    if (payload.title.trim().length > 255) {
      throw new AppError("Announcement title must not exceed 255 characters.", 400, "TITLE_TOO_LONG");
    }
    if (!payload.content || typeof payload.content !== "string" || !payload.content.trim()) {
      throw new AppError("Announcement content is required.", 400, "INVALID_CONTENT");
    }

    const validPriorities = ["Low", "Normal", "High", "Urgent"];
    const priority = payload.priority && validPriorities.includes(payload.priority) ? payload.priority : "Normal";

    const validAudiences = ["Everyone", "Employees", "Interns", "Department"];
    const audience = payload.audience && validAudiences.includes(payload.audience)
      ? (payload.audience as "Everyone" | "Employees" | "Interns" | "Department")
      : "Everyone";

    let departmentId: string | null = null;
    if (audience === "Department") {
      if (!payload.department_id || !isValidUuid(payload.department_id)) {
        throw new AppError("A valid department_id is required when audience is set to 'Department'.", 400, "DEPARTMENT_REQUIRED");
      }
      departmentId = payload.department_id.trim();
    }

    let publishedAt: string | undefined = undefined;
    if (payload.published_at) {
      const parsedDate = new Date(payload.published_at);
      if (isNaN(parsedDate.getTime())) {
        throw new AppError("Invalid published_at date format.", 400, "INVALID_DATE");
      }
      publishedAt = parsedDate.toISOString().slice(0, 19).replace("T", " ");
    }

    const created = await announcementRepository.createAnnouncement({
      author_id: callerAuth.userId,
      title: payload.title.trim(),
      content: payload.content.trim(),
      priority,
      audience,
      department_id: departmentId,
      published_at: publishedAt,
    });

    // Audit Log
    await auditRepository.log({
      actor_id: callerAuth.userId,
      action: "INSERT",
      table_name: "announcements",
      record_id: created.id,
      new_value: {
        title: created.title,
        priority: created.priority,
        audience: created.audience,
        department_id: created.department_id,
      },
    });

    // Notify audience members
    try {
      const targetUserIds = await userRepository.getUserIdsByAudience(
        created.audience,
        created.department_id
      );

      for (const targetId of targetUserIds) {
        if (targetId !== callerAuth.userId) {
          await notificationRepository.createNotification({
            user_id: targetId,
            type: "announcement",
            title: `Announcement: ${created.title}`,
            message: created.content.length > 120 ? `${created.content.substring(0, 117)}...` : created.content,
            reference_id: created.id,
            reference_type: "announcement",
          });
        }
      }
    } catch (err) {
      console.warn("[NOTIFICATION] Could not dispatch announcement notifications:", err);
    }

    return this.formatAnnouncement(created);
  }

  /**
   * Updates an announcement. Restricted to Super Admin, Admin, or Author.
   */
  async updateAnnouncement(
    id: string,
    payload: {
      title?: string;
      content?: string;
      priority?: string;
      audience?: "Everyone" | "Employees" | "Interns" | "Department";
      department_id?: string | null;
      published_at?: string;
    },
    callerAuth: UserRoleInfo
  ): Promise<SafeAnnouncementDto> {
    if (!isValidUuid(id)) {
      throw new AppError("Invalid announcement ID format. Expected UUID.", 400, "INVALID_UUID");
    }

    const existing = await announcementRepository.findById(id);
    if (!existing) {
      throw new AppError("Announcement not found", 404, "ANNOUNCEMENT_NOT_FOUND");
    }

    const authCheck = authorizationService.canManageAnnouncement(callerAuth, existing.author_id);
    if (!authCheck.allowed) {
      throw new AppError(authCheck.reason || "Forbidden: You cannot modify this announcement.", 403, "FORBIDDEN");
    }

    const fieldsToUpdate: Record<string, any> = {};

    if (payload.title !== undefined) {
      if (typeof payload.title !== "string" || !payload.title.trim()) {
        throw new AppError("Announcement title cannot be empty.", 400, "INVALID_TITLE");
      }
      if (payload.title.trim().length > 255) {
        throw new AppError("Announcement title must not exceed 255 characters.", 400, "TITLE_TOO_LONG");
      }
      fieldsToUpdate.title = payload.title.trim();
    }

    if (payload.content !== undefined) {
      if (typeof payload.content !== "string" || !payload.content.trim()) {
        throw new AppError("Announcement content cannot be empty.", 400, "INVALID_CONTENT");
      }
      fieldsToUpdate.content = payload.content.trim();
    }

    if (payload.priority !== undefined) {
      const validPriorities = ["Low", "Normal", "High", "Urgent"];
      if (!validPriorities.includes(payload.priority)) {
        throw new AppError("Invalid priority value.", 400, "INVALID_PRIORITY");
      }
      fieldsToUpdate.priority = payload.priority;
    }

    if (payload.audience !== undefined) {
      const validAudiences = ["Everyone", "Employees", "Interns", "Department"];
      if (!validAudiences.includes(payload.audience)) {
        throw new AppError("Invalid audience value.", 400, "INVALID_AUDIENCE");
      }
      fieldsToUpdate.audience = payload.audience;
    }

    if (payload.department_id !== undefined) {
      if (payload.department_id !== null && !isValidUuid(payload.department_id)) {
        throw new AppError("Invalid department_id UUID format.", 400, "INVALID_UUID");
      }
      fieldsToUpdate.department_id = payload.department_id;
    }

    if (payload.published_at !== undefined) {
      const parsedDate = new Date(payload.published_at);
      if (isNaN(parsedDate.getTime())) {
        throw new AppError("Invalid published_at date format.", 400, "INVALID_DATE");
      }
      fieldsToUpdate.published_at = parsedDate.toISOString().slice(0, 19).replace("T", " ");
    }

    const updated = await announcementRepository.updateAnnouncement(id, fieldsToUpdate);
    if (!updated) {
      throw new AppError("Failed to update announcement", 500, "UPDATE_FAILED");
    }

    // Audit Log
    await auditRepository.log({
      actor_id: callerAuth.userId,
      action: "UPDATE",
      table_name: "announcements",
      record_id: id,
      old_value: {
        title: existing.title,
        priority: existing.priority,
        audience: existing.audience,
        department_id: existing.department_id,
      },
      new_value: fieldsToUpdate,
    });

    return this.formatAnnouncement(updated);
  }
}

export const announcementService = new AnnouncementService();
