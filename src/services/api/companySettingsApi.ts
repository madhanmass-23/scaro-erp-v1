/**
 * Company Settings API Service for SCARO ERP Frontend.
 * 
 * Interacts with Node.js/Express `/api/v1/company-settings` singleton endpoints backed by MariaDB.
 */

import { api } from '../../lib/api';

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

export interface UpdateCompanySettingsPayload {
  company_name?: string;
  timezone?: string;
  working_days?: string[];
  work_start_time?: string;
  work_end_time?: string;
  daily_report_reminder_time?: string;
  late_threshold_minutes?: number;
}

export const companySettingsApi = {
  /**
   * Retrieves singleton company operational settings.
   * Calls GET /api/v1/company-settings
   */
  async getSettings(): Promise<SafeCompanySettingsDto> {
    return api.get<SafeCompanySettingsDto>('/company-settings');
  },

  /**
   * Updates singleton company settings (Management only).
   * Calls PATCH /api/v1/company-settings
   */
  async updateSettings(payload: UpdateCompanySettingsPayload): Promise<SafeCompanySettingsDto> {
    return api.patch<SafeCompanySettingsDto>('/company-settings', payload);
  },
};
