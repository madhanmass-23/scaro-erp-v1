import { StorageBucket } from "../storage/drivers/storage.driver.interface.js";
import { UserRoleInfo } from "./rbac.service.js";
import { queryOne } from "../utils/database.util.js";

export interface StorageAccessResult {
  allowed: boolean;
  reason?: string;
}

export class StorageAuthService {
  private isManagement(callerAuth: UserRoleInfo): boolean {
    return (
      callerAuth.role === "SUPER_ADMIN" ||
      callerAuth.role === "ADMIN" ||
      callerAuth.role === "Super Admin" ||
      callerAuth.role === "Admin"
    );
  }

  /**
   * Verifies upload authorization for a bucket.
   */
  async canUpload(
    bucket: StorageBucket,
    entityId: string | undefined,
    callerAuth: UserRoleInfo
  ): Promise<StorageAccessResult> {
    if (this.isManagement(callerAuth)) {
      return { allowed: true };
    }

    if (bucket === "avatars") {
      // Users can only upload their own avatar unless management
      if (entityId && entityId !== callerAuth.userId) {
        return {
          allowed: false,
          reason: "You are only permitted to upload your own user avatar.",
        };
      }
      return { allowed: true };
    }

    if (bucket === "task-attachments") {
      if (!entityId) {
        return { allowed: true }; // Standalone upload before linking
      }
      try {
        const sql = `SELECT assignee_id, reporter_id FROM tasks WHERE id = ? LIMIT 1`;
        const task = await queryOne<{ assignee_id: string | null; reporter_id: string }>(sql, [entityId]);
        if (!task) {
          return { allowed: false, reason: "Target task does not exist." };
        }
        if (task.assignee_id === callerAuth.userId || task.reporter_id === callerAuth.userId) {
          return { allowed: true };
        }
        return {
          allowed: false,
          reason: "You are not an assignee or reporter on this task.",
        };
      } catch {
        return { allowed: true };
      }
    }

    if (bucket === "daily-evidence") {
      if (!entityId) {
        return { allowed: true };
      }
      try {
        const sql = `SELECT user_id FROM daily_reports WHERE id = ? LIMIT 1`;
        const report = await queryOne<{ user_id: string }>(sql, [entityId]);
        if (!report) {
          return { allowed: false, reason: "Target daily report does not exist." };
        }
        if (report.user_id === callerAuth.userId) {
          return { allowed: true };
        }
        return {
          allowed: false,
          reason: "You are only permitted to upload evidence to your own daily reports.",
        };
      } catch {
        return { allowed: true };
      }
    }

    if (bucket === "temp" || bucket === "thumbnails") {
      return { allowed: true };
    }

    return { allowed: false, reason: "Unauthorized bucket access." };
  }

  /**
   * Verifies read/download authorization for a stored file.
   */
  async canDownload(
    bucket: StorageBucket,
    filename: string,
    callerAuth: UserRoleInfo
  ): Promise<StorageAccessResult> {
    // Management has universal storage access
    if (this.isManagement(callerAuth)) {
      return { allowed: true };
    }

    if (bucket === "avatars" || bucket === "thumbnails" || bucket === "temp") {
      // Avatars and UI thumbnails are visible to all authenticated ERP members
      return { allowed: true };
    }

    if (bucket === "task-attachments") {
      try {
        const sql = `
          SELECT ta.uploaded_by, t.assignee_id, t.reporter_id
          FROM task_attachments ta
          JOIN tasks t ON ta.task_id = t.id
          WHERE ta.storage_path LIKE ? OR ta.file_name = ?
          LIMIT 1
        `;
        const row = await queryOne<{
          uploaded_by: string;
          assignee_id: string | null;
          reporter_id: string;
        }>(sql, [`%${filename}%`, filename]);

        if (!row) {
          return { allowed: true };
        }

        if (
          row.uploaded_by === callerAuth.userId ||
          row.assignee_id === callerAuth.userId ||
          row.reporter_id === callerAuth.userId
        ) {
          return { allowed: true };
        }

        return {
          allowed: false,
          reason: "Access denied: You are not authorized to view this task attachment.",
        };
      } catch {
        return { allowed: true };
      }
    }

    if (bucket === "daily-evidence") {
      try {
        const sql = `
          SELECT dra.uploaded_by, dr.user_id AS report_user_id
          FROM daily_report_attachments dra
          JOIN daily_reports dr ON dra.report_id = dr.id
          WHERE dra.storage_path LIKE ? OR dra.file_name = ?
          LIMIT 1
        `;
        const row = await queryOne<{
          uploaded_by: string;
          report_user_id: string;
        }>(sql, [`%${filename}%`, filename]);

        if (!row) {
          return { allowed: true };
        }

        if (row.uploaded_by === callerAuth.userId || row.report_user_id === callerAuth.userId) {
          return { allowed: true };
        }

        return {
          allowed: false,
          reason: "Access denied: You cannot view evidence from another user's daily report.",
        };
      } catch {
        return { allowed: true };
      }
    }

    return { allowed: false, reason: "Access denied to requested file." };
  }

  /**
   * Verifies deletion authorization for a stored file.
   */
  async canDelete(
    bucket: StorageBucket,
    filename: string,
    callerAuth: UserRoleInfo
  ): Promise<StorageAccessResult> {
    if (this.isManagement(callerAuth)) {
      return { allowed: true };
    }

    if (bucket === "avatars") {
      try {
        const sql = `SELECT id FROM profiles WHERE avatar_url LIKE ? LIMIT 1`;
        const profile = await queryOne<{ id: string }>(sql, [`%${filename}%`]);
        if (profile && profile.id !== callerAuth.userId) {
          return {
            allowed: false,
            reason: "You cannot delete another user's avatar.",
          };
        }
        return { allowed: true };
      } catch {
        return { allowed: true };
      }
    }

    if (bucket === "task-attachments") {
      try {
        const sql = `SELECT uploaded_by FROM task_attachments WHERE storage_path LIKE ? LIMIT 1`;
        const att = await queryOne<{ uploaded_by: string }>(sql, [`%${filename}%`]);
        if (att && att.uploaded_by !== callerAuth.userId) {
          return {
            allowed: false,
            reason: "You can only delete task attachments that you uploaded.",
          };
        }
        return { allowed: true };
      } catch {
        return { allowed: true };
      }
    }

    if (bucket === "daily-evidence") {
      try {
        const sql = `
          SELECT dra.uploaded_by, dr.user_id, dr.status
          FROM daily_report_attachments dra
          JOIN daily_reports dr ON dra.report_id = dr.id
          WHERE dra.storage_path LIKE ? LIMIT 1
        `;
        const row = await queryOne<{ uploaded_by: string; user_id: string; status: string }>(sql, [
          `%${filename}%`,
        ]);
        if (row) {
          if (row.uploaded_by !== callerAuth.userId && row.user_id !== callerAuth.userId) {
            return {
              allowed: false,
              reason: "You can only delete evidence from your own daily reports.",
            };
          }
        }
        return { allowed: true };
      } catch {
        return { allowed: true };
      }
    }

    return { allowed: false, reason: "Unauthorized deletion attempt." };
  }
}

export const storageAuthService = new StorageAuthService();
