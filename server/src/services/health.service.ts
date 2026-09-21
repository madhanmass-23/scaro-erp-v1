import { healthRepository } from "../repositories/health.repository.js";
import { AppError } from "../types/api.types.js";

export class HealthService {
  getServiceHealth(): { service: string; status: string } {
    return {
      service: "SCARO ERP API",
      status: "healthy",
    };
  }

  async getDatabaseHealth(): Promise<{ database: string; version?: string }> {
    const result = await healthRepository.ping();
    if (!result.ok) {
      throw new AppError("Database unavailable", 503, "DB_UNAVAILABLE");
    }
    return {
      database: "connected",
      version: result.version,
    };
  }
}

export const healthService = new HealthService();
