import { config } from "../config/env.js";
import { UserRoleInfo } from "./rbac.service.js";
import { AppError } from "../types/api.types.js";

export interface SafeSystemInfoDto {
  app_name: string;
  version: string;
  environment: string;
  api_prefix: string;
  server_time: string;
  uptime_seconds: number;
  status: string;
}

export class SystemService {
  /**
   * Retrieves non-sensitive system application metadata.
   */
  getSystemInfo(callerAuth: UserRoleInfo): SafeSystemInfoDto {
    if (!callerAuth || !callerAuth.userId) {
      throw new AppError("Authentication required", 401, "UNAUTHENTICATED");
    }

    return {
      app_name: "SCARO ERP",
      version: "1.0.0",
      environment: config.NODE_ENV,
      api_prefix: config.API_PREFIX,
      server_time: new Date().toISOString(),
      uptime_seconds: Math.floor(process.uptime()),
      status: "operational",
    };
  }
}

export const systemService = new SystemService();
