import { authRepository, UserProfileAuthRow } from "../repositories/auth.repository.js";
import { hashPassword, verifyPassword, validatePasswordStrength } from "../utils/password.js";
import { signAccessToken, generateOpaqueToken, hashToken } from "../utils/jwt.js";
import { config } from "../config/env.js";
import { AppError } from "../types/api.types.js";

// Dummy hash for timing-safe comparison on non-existent users
const DUMMY_HASH = "$2a$12$e8YdY6n61N1YFq7l99M6kO79g7m8H9o1p2q3r4s5t6u7v8w9x0y1z";

export interface SafeUser {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  department: string | null;
  designation: string | null;
  employment_status: "Employee" | "Intern";
  role: string | null;
}

export interface LoginResult {
  user: SafeUser;
  accessToken: string;
  rawRefreshToken: string;
  refreshExpiresAt: Date;
}

export interface RefreshResult {
  accessToken: string;
  newRawRefreshToken: string;
  refreshExpiresAt: Date;
}

function sanitizeUser(p: UserProfileAuthRow): SafeUser {
  return {
    id: p.id,
    email: p.email,
    full_name: p.full_name,
    avatar_url: p.avatar_url,
    phone: p.phone,
    department: p.department_name,
    designation: p.designation,
    employment_status: p.employment_status,
    role: p.role_name || "Employee",
  };
}

export class AuthService {
  /**
   * Authenticates a user with email and password, issuing access & refresh tokens.
   */
  async login(
    email?: string,
    password?: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<LoginResult> {
    if (!email || typeof email !== "string" || !email.trim()) {
      throw new AppError("Email is required", 400, "INVALID_INPUT");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      throw new AppError("Invalid email format", 400, "INVALID_INPUT");
    }

    if (!password || typeof password !== "string") {
      throw new AppError("Password is required", 400, "INVALID_INPUT");
    }

    const profile = await authRepository.findProfileByEmail(email.trim());

    if (!profile) {
      // Timing attack mitigation
      await verifyPassword(password, DUMMY_HASH);
      throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }

    if (!profile.is_active) {
      throw new AppError(
        "Account is deactivated. Please contact an administrator.",
        403,
        "ACCOUNT_INACTIVE"
      );
    }

    const userAuth = await authRepository.findUserAuthByUserId(profile.id);

    if (!userAuth || !userAuth.password_hash) {
      // User exists in profiles but initial password has not been established
      await verifyPassword(password, DUMMY_HASH);
      throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }

    // Check account lockout
    if (userAuth.locked_until && new Date(userAuth.locked_until) > new Date()) {
      throw new AppError(
        "Account is temporarily locked due to multiple failed attempts. Please try again later.",
        423,
        "ACCOUNT_LOCKED"
      );
    }

    const isMatch = await verifyPassword(password, userAuth.password_hash);

    if (!isMatch) {
      await authRepository.recordLoginFailure(profile.id, userAuth.failed_login_attempts || 0);
      throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }

    // Record login success and reset attempts
    await authRepository.recordLoginSuccess(profile.id);

    // Issue access token
    const accessToken = signAccessToken(profile.id, profile.email);

    // Issue opaque refresh token
    const { rawToken, tokenHash } = generateOpaqueToken();
    const refreshExpiresAt = new Date(
      Date.now() + config.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000
    );

    await authRepository.createSession(
      profile.id,
      tokenHash,
      refreshExpiresAt,
      userAgent,
      ipAddress
    );

    return {
      user: sanitizeUser(profile),
      accessToken,
      rawRefreshToken: rawToken,
      refreshExpiresAt,
    };
  }

  /**
   * Rotates a refresh token session and issues a new access token.
   */
  async refresh(
    rawRefreshToken?: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<RefreshResult> {
    if (!rawRefreshToken || typeof rawRefreshToken !== "string") {
      throw new AppError("Refresh token is required", 401, "UNAUTHENTICATED");
    }

    const tokenHash = hashToken(rawRefreshToken);
    const session = await authRepository.findSessionByTokenHash(tokenHash);

    if (!session || session.revoked_at !== null) {
      throw new AppError("Invalid or revoked refresh session", 401, "INVALID_REFRESH_TOKEN");
    }

    if (new Date(session.expires_at) < new Date()) {
      throw new AppError("Refresh session has expired", 401, "REFRESH_TOKEN_EXPIRED");
    }

    const profile = await authRepository.findProfileById(session.user_id);
    if (!profile || !profile.is_active) {
      await authRepository.revokeSession(session.id);
      throw new AppError("User account is inactive or not found", 401, "ACCOUNT_INACTIVE");
    }

    // Refresh token rotation: Revoke old session and generate new session
    await authRepository.revokeSession(session.id);

    const { rawToken: newRawToken, tokenHash: newTokenHash } = generateOpaqueToken();
    const refreshExpiresAt = new Date(
      Date.now() + config.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000
    );

    await authRepository.createSession(
      profile.id,
      newTokenHash,
      refreshExpiresAt,
      userAgent,
      ipAddress
    );

    const accessToken = signAccessToken(profile.id, profile.email);

    return {
      accessToken,
      newRawRefreshToken: newRawToken,
      refreshExpiresAt,
    };
  }

  /**
   * Revokes the active refresh token session.
   */
  async logout(rawRefreshToken?: string): Promise<void> {
    if (rawRefreshToken && typeof rawRefreshToken === "string") {
      const tokenHash = hashToken(rawRefreshToken);
      const session = await authRepository.findSessionByTokenHash(tokenHash);
      if (session && session.revoked_at === null) {
        await authRepository.revokeSession(session.id);
      }
    }
  }

  /**
   * Retrieves profile details for the authenticated user identity.
   */
  async getMe(userId: string): Promise<SafeUser> {
    const profile = await authRepository.findProfileById(userId);
    if (!profile) {
      throw new AppError("User profile not found", 404, "USER_NOT_FOUND");
    }

    if (!profile.is_active) {
      throw new AppError("Account is inactive", 403, "ACCOUNT_INACTIVE");
    }

    return sanitizeUser(profile);
  }

  /**
   * Changes the authenticated user's password and revokes other active sessions.
   */
  async changePassword(
    userId: string,
    currentPassword?: string,
    newPassword?: string
  ): Promise<void> {
    if (!currentPassword || !newPassword) {
      throw new AppError(
        "Current password and new password are required",
        400,
        "INVALID_INPUT"
      );
    }

    const validation = validatePasswordStrength(newPassword);
    if (!validation.valid) {
      throw new AppError(validation.message || "Invalid password", 400, "WEAK_PASSWORD");
    }

    const userAuth = await authRepository.findUserAuthByUserId(userId);
    if (!userAuth) {
      throw new AppError("Authentication record not found", 404, "AUTH_RECORD_NOT_FOUND");
    }

    const isMatch = await verifyPassword(currentPassword, userAuth.password_hash);
    if (!isMatch) {
      throw new AppError("Current password is incorrect", 400, "INVALID_CURRENT_PASSWORD");
    }

    if (currentPassword === newPassword) {
      throw new AppError(
        "New password must be different from current password",
        400,
        "SAME_PASSWORD"
      );
    }

    const newHash = await hashPassword(newPassword);
    await authRepository.updatePassword(userId, newHash);

    // Revoke all existing sessions for this user so re-login is required on other devices
    await authRepository.revokeAllUserSessions(userId);
  }

  /**
   * Sets initial password using a one-time setup token.
   */
  async setInitialPassword(token?: string, password?: string): Promise<void> {
    if (!token || typeof token !== "string" || !token.trim()) {
      throw new AppError("Initialization token is required", 400, "INVALID_TOKEN");
    }

    const validation = validatePasswordStrength(password || "");
    if (!validation.valid) {
      throw new AppError(validation.message || "Invalid password", 400, "WEAK_PASSWORD");
    }

    const tokenHash = hashToken(token.trim());
    const initToken = await authRepository.findValidInitTokenByHash(tokenHash);

    if (!initToken) {
      throw new AppError(
        "Initialization token is invalid, used, or expired",
        400,
        "INVALID_INIT_TOKEN"
      );
    }

    const newHash = await hashPassword(password!);
    await authRepository.setInitialPasswordWithToken(initToken.user_id, initToken.id, newHash);
  }

  /**
   * Generates a single-use setup token for administrative onboarding.
   */
  async generateInitialSetupToken(userId: string): Promise<{ rawToken: string; expiresAt: Date }> {
    const profile = await authRepository.findProfileById(userId);
    if (!profile) {
      throw new AppError("Profile not found", 404, "USER_NOT_FOUND");
    }

    const { rawToken, tokenHash } = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await authRepository.createInitToken(userId, tokenHash, expiresAt);
    return { rawToken, expiresAt };
  }
}

export const authService = new AuthService();
