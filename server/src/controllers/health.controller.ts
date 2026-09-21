import { Request, Response, NextFunction } from "express";
import { healthService } from "../services/health.service.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { config } from "../config/env.js";

export class HealthController {
  getHealth(_req: Request, res: Response): void {
    const health = healthService.getServiceHealth();
    sendSuccess(res, undefined, 200, {
      service: health.service,
      status: health.status,
    });
  }

  async getDatabaseHealth(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dbHealth = await healthService.getDatabaseHealth();
      sendSuccess(res, undefined, 200, {
        database: dbHealth.database,
        ...(config.NODE_ENV !== "production" && dbHealth.version ? { version: dbHealth.version } : {}),
      });
    } catch (err) {
      next(err);
    }
  }
}

export const healthController = new HealthController();
