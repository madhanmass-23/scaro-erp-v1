/**
 * System API Service for SCARO ERP Frontend.
 * 
 * Interacts with Node.js/Express `/api/v1/system` endpoints backed by MariaDB.
 */

import { api } from '../../lib/api';

export interface SafeSystemInfoDto {
  app_name: string;
  version: string;
  environment: string;
  api_prefix: string;
  server_time: string;
  uptime_seconds: number;
  status: string;
}

export const systemApi = {
  /**
   * Retrieves non-sensitive system runtime and environment metadata.
   * Calls GET /api/v1/system/info
   */
  async getSystemInfo(): Promise<SafeSystemInfoDto> {
    return api.get<SafeSystemInfoDto>('/system/info');
  },
};
