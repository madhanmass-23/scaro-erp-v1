import {
  dashboardRepository,
  ManagementDashboardData,
  PersonalDashboardData,
} from "../repositories/dashboard.repository.js";
import { UserRoleInfo } from "./rbac.service.js";
import { AppError } from "../types/api.types.js";

export interface DashboardResponseDto {
  role_type: "management" | "personal";
  user_role: string;
  data: ManagementDashboardData | PersonalDashboardData;
}

export class DashboardService {
  /**
   * Retrieves role-scoped dashboard metrics dynamically from MariaDB.
   */
  async getDashboardSummary(callerAuth: UserRoleInfo): Promise<DashboardResponseDto> {
    if (!callerAuth || !callerAuth.userId) {
      throw new AppError("Authentication required to access dashboard", 401, "UNAUTHENTICATED");
    }

    if (callerAuth.isSuperAdmin || callerAuth.isAdmin) {
      const managementData = await dashboardRepository.getManagementStats();
      return {
        role_type: "management",
        user_role: callerAuth.role,
        data: managementData,
      };
    }

    // Normal users (Employee, Intern) receive personalized workforce metrics
    const personalData = await dashboardRepository.getPersonalStats(callerAuth.userId);
    return {
      role_type: "personal",
      user_role: callerAuth.role,
      data: personalData,
    };
  }
}

export const dashboardService = new DashboardService();
