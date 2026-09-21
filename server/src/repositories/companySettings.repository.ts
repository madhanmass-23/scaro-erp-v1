import { queryOne, execute } from "../utils/database.util.js";

export interface CompanySettingsRecord {
  id: string;
  company_name: string;
  timezone: string;
  working_days: any;
  work_start_time: string;
  work_end_time: string;
  daily_report_reminder_time: string;
  late_threshold_minutes: number;
  is_singleton: number | boolean;
  updated_at: Date | string;
}

export class CompanySettingsRepository {
  /**
   * Retrieves the singleton company settings record.
   */
  async getSettings(): Promise<CompanySettingsRecord | null> {
    const sql = `
      SELECT 
        id,
        company_name,
        timezone,
        working_days,
        work_start_time,
        work_end_time,
        daily_report_reminder_time,
        late_threshold_minutes,
        is_singleton,
        updated_at
      FROM company_settings
      WHERE is_singleton = 1
      LIMIT 1
    `;
    return queryOne<CompanySettingsRecord>(sql);
  }

  /**
   * Updates the singleton company settings record with provided fields.
   */
  async updateSettings(fields: Record<string, any>): Promise<CompanySettingsRecord | null> {
    const keys = Object.keys(fields);
    if (keys.length === 0) {
      return this.getSettings();
    }

    const setClauses: string[] = [];
    const params: any[] = [];

    for (const key of keys) {
      setClauses.push(`\`${key}\` = ?`);
      params.push(fields[key]);
    }

    setClauses.push("`updated_at` = CURRENT_TIMESTAMP(6)");

    const sql = `UPDATE company_settings SET ${setClauses.join(", ")} WHERE is_singleton = 1`;
    await execute(sql, params);

    return this.getSettings();
  }
}

export const companySettingsRepository = new CompanySettingsRepository();
