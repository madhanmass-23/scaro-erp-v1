import { Request, Response, NextFunction } from "express";
import { authService } from "../services/auth.service.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { config } from "../config/env.js";
import { AppError } from "../types/api.types.js";

function setRefreshCookie(res: Response, rawRefreshToken: string, expiresAt: Date): void {
  res.cookie(config.AUTH_COOKIE_NAME, rawRefreshToken, {
    httpOnly: true,
    secure: config.AUTH_COOKIE_SECURE,
    sameSite: config.AUTH_COOKIE_SAME_SITE,
    expires: expiresAt,
    path: `${config.API_PREFIX}/auth`,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(config.AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: config.AUTH_COOKIE_SECURE,
    sameSite: config.AUTH_COOKIE_SAME_SITE,
    path: `${config.API_PREFIX}/auth`,
  });
}

export class AuthController {
  /**
   * POST /auth/login
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body || {};
      const userAgent = req.headers["user-agent"];
      const ipAddress = req.ip || req.socket.remoteAddress;

      const result = await authService.login(email, password, userAgent, ipAddress);

      setRefreshCookie(res, result.rawRefreshToken, result.refreshExpiresAt);

      sendSuccess(res, {
        user: result.user,
        accessToken: result.accessToken,
        expiresIn: config.JWT_ACCESS_EXPIRES_IN,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /auth/refresh
   */
  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawRefreshToken = req.cookies?.[config.AUTH_COOKIE_NAME] || req.body?.refreshToken;
      const userAgent = req.headers["user-agent"];
      const ipAddress = req.ip || req.socket.remoteAddress;

      const result = await authService.refresh(rawRefreshToken, userAgent, ipAddress);

      setRefreshCookie(res, result.newRawRefreshToken, result.refreshExpiresAt);

      sendSuccess(res, {
        accessToken: result.accessToken,
        expiresIn: config.JWT_ACCESS_EXPIRES_IN,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /auth/logout
   */
  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawRefreshToken = req.cookies?.[config.AUTH_COOKIE_NAME] || req.body?.refreshToken;

      await authService.logout(rawRefreshToken);
      clearRefreshCookie(res);

      sendSuccess(res, { message: "Logged out successfully" });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /auth/me
   */
  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.id) {
        throw new AppError("Authentication required", 401, "UNAUTHENTICATED");
      }

      const user = await authService.getMe(req.user.id);
      sendSuccess(res, user);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /auth/change-password
   */
  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.id) {
        throw new AppError("Authentication required", 401, "UNAUTHENTICATED");
      }

      const { currentPassword, newPassword } = req.body || {};
      await authService.changePassword(req.user.id, currentPassword, newPassword);

      // Clear existing refresh cookie as other sessions have been revoked
      clearRefreshCookie(res);

      sendSuccess(res, {
        message: "Password updated successfully. Please log in again with your new password.",
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /auth/set-initial-password
   */
  async setInitialPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, password } = req.body || {};
      await authService.setInitialPassword(token, password);

      sendSuccess(res, {
        message: "Password initialized successfully. You may now log in.",
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /auth/permissions
   */
  async getPermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.id) {
        throw new AppError("Authentication required", 401, "UNAUTHENTICATED");
      }

      const { rbacService } = await import("../services/rbac.service.js");
      const roleInfo = await rbacService.getUserRoleAndPermissions(req.user.id);

      sendSuccess(res, {
        role: roleInfo.role,
        permissions: roleInfo.permissions,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const authController = new AuthController();
