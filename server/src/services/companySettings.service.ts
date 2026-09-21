import {
  companySettingsRepository,
  CompanySettingsRecord,
} from "../repositories/companySettings.repository.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { authorizationService } from "./authorization.service.js";
import { UserRoleInfo } from "./rbac.service.js";
import { AppError } from "../types/api.types.js";

export interface SafeCompanySettingsDto {
  id: string;
  company_name: string;
  timezone: string;
  working_days: string[];
  work_start_time: string;
  work_end_time: string;
  daily_report_reminder_time: string;
  late_threshold_minutes: number;
  updated_at: string;
}

export class CompanySettingsService {
  private formatSettings(raw: CompanySettingsRecord): SafeCompanySettingsDto {
    let workingDays: string[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    if (raw.working_days) {
      if (Array.isArray(raw.working_days)) {
        workingDays = raw.working_days;
      } else if (typeof raw.working_days === "string") {
        try {
          workingDays = JSON.parse(raw.working_days);
        } catch {
          workingDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
        }
      }
    }

    return {
      id: raw.id,
      company_name: raw.company_name,
      timezone: raw.timezone,
      working_days: workingDays,
      work_start_time: String(raw.work_start_time),
      work_end_time: String(raw.work_end_time),
      daily_report_reminder_time: String(raw.daily_report_reminder_time),
      late_threshold_minutes: Number(raw.late_threshold_minutes) || 15,
      updated_at:
        typeof raw.updated_at === "object" && raw.updated_at !== null && "toISOString" in raw.updated_at
          ? (raw.updated_at as Date).toISOString()
          : String(raw.updated_at),
    };
  }

  /**
   * Retrieves company settings.
   */
  async getSettings(callerAuth: UserRoleInfo): Promise<SafeCompanySettingsDto> {
    const authCheck = authorizationService.canViewCompanySettings(callerAuth);
    if (!authCheck.allowed) {
      throw new AppError(authCheck.reason || "Authentication required", 401, "UNAUTHENTICATED");
    }

    const settings = await companySettingsRepository.getSettings();
    if (!settings) {
      throw new AppError("Company settings record not found", 404, "SETTINGS_NOT_FOUND");
    }

    return this.formatSettings(settings);
  }

  /**
   * Updates singleton company settings. Restricted to Super Admin and Admin.
   */
  async updateSettings(
    payload: {
      company_name?: string;
      timezone?: string;
      working_days?: string[];
      work_start_time?: string;
      work_end_time?: string;
      daily_report_reminder_time?: string;
      late_threshold_minutes?: number;
    },
    callerAuth: UserRoleInfo
  ): Promise<SafeCompanySettingsDto> {
    const authCheck = authorizationService.canManageCompanySettings(callerAuth);
    if (!authCheck.allowed) {
      throw new AppError(authCheck.reason || "Forbidden: Only management can modify company settings.", 403, "FORBIDDEN");
    }

    const fieldsToUpdate: Record<string, any> = {};

    if (payload.company_name !== undefined) {
      if (typeof payload.company_name !== "string" || !payload.company_name.trim()) {
        throw new AppError("Company name cannot be empty.", 400, "INVALID_COMPANY_NAME");
      }
      if (payload.company_name.trim().length > 255) {
        throw new AppError("Company name must not exceed 255 characters.", 400, "NAME_TOO_LONG");
      }
      fieldsToUpdate.company_name = payload.company_name.trim();
    }

    if (payload.timezone !== undefined) {
      if (typeof payload.timezone !== "string" || !payload.timezone.trim()) {
        throw new AppError("Timezone cannot be empty.", 400, "INVALID_TIMEZONE");
      }
      fieldsToUpdate.timezone = payload.timezone.trim();
    }

    if (payload.working_days !== undefined) {
      if (!Array.isArray(payload.working_days) || payload.working_days.length === 0) {
        throw new AppError("Working days must be a non-empty array of day names.", 400, "INVALID_WORKING_DAYS");
      }
      fieldsToUpdate.working_days = JSON.stringify(payload.working_days);
    }

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;

    if (payload.work_start_time !== undefined) {
      if (typeof payload.work_start_time !== "string" || !timeRegex.test(payload.work_start_time.trim())) {
        throw new AppError("Invalid work_start_time format. Expected HH:MM:SS or HH:MM.", 400, "INVALID_TIME_FORMAT");
      }
      fieldsToUpdate.work_start_time = payload.work_start_time.trim();
    }

    if (payload.work_end_time !== undefined) {
      if (typeof payload.work_end_time !== "string" || !timeRegex.test(payload.work_end_time.trim())) {
        throw new AppError("Invalid work_end_time format. Expected HH:MM:SS or HH:MM.", 400, "INVALID_TIME_FORMAT");
      }
      fieldsToUpdate.work_end_time = payload.work_end_time.trim();
    }

    if (payload.daily_report_reminder_time !== undefined) {
      if (typeof payload.daily_report_reminder_time !== "string" || !timeRegex.test(payload.daily_report_reminder_time.trim())) {
        throw new AppError("Invalid daily_report_reminder_time format. Expected HH:MM:SS or HH:MM.", 400, "INVALID_TIME_FORMAT");
      }
      fieldsToUpdate.daily_report_reminder_time = payload.daily_report_reminder_time.trim();
    }

    if (payload.late_threshold_minutes !== undefined) {
      const threshold = Number(payload.late_threshold_minutes);
      if (isNaN(threshold) || threshold < 0 || threshold > 180) {
        throw new AppError("Late threshold minutes must be a positive number between 0 and 180.", 400, "INVALID_THRESHOLD");
      }
      fieldsToUpdate.late_threshold_minutes = Math.floor(threshold);
    }

    const existing = await companySettingsRepository.getSettings();
    if (!existing) {
      throw new AppError("Company settings record not found", 404, "SETTINGS_NOT_FOUND");
    }

    const updated = await companySettingsRepository.updateSettings(fieldsToUpdate);
    if (!updated) {
      throw new AppError("Failed to update company settings", 500, "UPDATE_FAILED");
    }

    // Record Audit Log
    await auditRepository.log({
      actor_id: callerAuth.userId,
      action: "UPDATE",
      table_name: "company_settings",
      record_id: updated.id,
      old_value: {
        company_name: existing.company_name,
        timezone: existing.timezone,
        work_start_time: existing.work_start_time,
        work_end_time: existing.work_end_time,
      },
      new_value: fieldsToUpdate,
    });

    return this.formatSettings(updated);
  }
}

export const companySettingsService = new CompanySettingsService();
