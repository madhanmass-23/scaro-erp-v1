import { queryOne, execute, withTransaction } from "../utils/database.util.js";

export interface UserProfileAuthRow {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  department_id: string | null;
  department_name: string | null;
  designation: string | null;
  employment_status: "Employee" | "Intern";
  is_active: number;
  role_id: string | null;
  role_name: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserAuthRow {
  id: string;
  user_id: string;
  password_hash: string;
  password_changed_at: Date | null;
  failed_login_attempts: number;
  locked_until: Date | null;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface AuthSessionRow {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  expires_at: Date;
  created_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
  user_agent: string | null;
  ip_address: string | null;
}

export interface AuthInitTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

export class AuthRepository {
  /**
   * Finds a user profile by normalized email address.
   */
  async findProfileByEmail(email: string): Promise<UserProfileAuthRow | null> {
    const sql = `
      SELECT 
        p.id,
        p.email,
        p.full_name,
        p.avatar_url,
        p.phone,
        p.department_id,
        d.name AS department_name,
        p.designation,
        p.employment_status,
        p.is_active,
        ur.role_id,
        r.name AS role_name,
        p.created_at,
        p.updated_at
      FROM profiles p
      LEFT JOIN departments d ON p.department_id = d.id
      LEFT JOIN user_roles ur ON p.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE LOWER(p.email) = LOWER(?)
      LIMIT 1
    `;
    return queryOne<UserProfileAuthRow>(sql, [email.trim()]);
  }

  /**
   * Finds a user profile by unique profile ID.
   */
  async findProfileById(userId: string): Promise<UserProfileAuthRow | null> {
    const sql = `
      SELECT 
        p.id,
        p.email,
        p.full_name,
        p.avatar_url,
        p.phone,
        p.department_id,
        d.name AS department_name,
        p.designation,
        p.employment_status,
        p.is_active,
        ur.role_id,
        r.name AS role_name,
        p.created_at,
        p.updated_at
      FROM profiles p
      LEFT JOIN departments d ON p.department_id = d.id
      LEFT JOIN user_roles ur ON p.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE p.id = ?
      LIMIT 1
    `;
    return queryOne<UserProfileAuthRow>(sql, [userId]);
  }

  /**
   * Finds credential metadata for a user.
   */
  async findUserAuthByUserId(userId: string): Promise<UserAuthRow | null> {
    const sql = `
      SELECT 
        id,
        user_id,
        password_hash,
        password_changed_at,
        failed_login_attempts,
        locked_until,
        last_login_at,
        created_at,
        updated_at
      FROM user_auth
      WHERE user_id = ?
      LIMIT 1
    `;
    return queryOne<UserAuthRow>(sql, [userId]);
  }

  /**
   * Inserts an initial password record for a user.
   */
  async createUserAuth(userId: string, passwordHash: string): Promise<void> {
    const sql = `
      INSERT INTO user_auth (id, user_id, password_hash, password_changed_at)
      VALUES (UUID(), ?, ?, CURRENT_TIMESTAMP(6))
    `;
    await execute(sql, [userId, passwordHash]);
  }

  /**
   * Updates a user's password and resets failed attempts.
   */
  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    const sql = `
      UPDATE user_auth
      SET 
        password_hash = ?,
        password_changed_at = CURRENT_TIMESTAMP(6),
        failed_login_attempts = 0,
        locked_until = NULL,
        updated_at = CURRENT_TIMESTAMP(6)
      WHERE user_id = ?
    `;
    await execute(sql, [passwordHash, userId]);
  }

  /**
   * Records a successful login event.
   */
  async recordLoginSuccess(userId: string): Promise<void> {
    const sql = `
      UPDATE user_auth
      SET 
        last_login_at = CURRENT_TIMESTAMP(6),
        failed_login_attempts = 0,
        locked_until = NULL,
        updated_at = CURRENT_TIMESTAMP(6)
      WHERE user_id = ?
    `;
    await execute(sql, [userId]);
  }

  /**
   * Records a failed login attempt and applies progressive lockout.
   */
  async recordLoginFailure(userId: string, currentAttempts: number): Promise<void> {
    const newAttempts = currentAttempts + 1;
    let lockSql = "NULL";
    if (newAttempts >= 5) {
      // Lock account for 15 minutes after 5 consecutive failed attempts
      lockSql = "DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL 15 MINUTE)";
    }

    const sql = `
      UPDATE user_auth
      SET 
        failed_login_attempts = ?,
        locked_until = ${lockSql},
        updated_at = CURRENT_TIMESTAMP(6)
      WHERE user_id = ?
    `;
    await execute(sql, [newAttempts, userId]);
  }

  /**
   * Creates a new hashed refresh token session.
   */
  async createSession(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    userAgent?: string,
    ipAddress?: string
  ): Promise<string> {
    const sessionId = (await queryOne<{ id: string }>("SELECT UUID() AS id"))?.id || "";
    const sql = `
      INSERT INTO auth_sessions (
        id,
        user_id,
        refresh_token_hash,
        expires_at,
        user_agent,
        ip_address
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;
    await execute(sql, [
      sessionId,
      userId,
      tokenHash,
      expiresAt,
      userAgent || null,
      ipAddress || null,
    ]);
    return sessionId;
  }

  /**
   * Finds an active refresh token session by token hash.
   */
  async findSessionByTokenHash(tokenHash: string): Promise<AuthSessionRow | null> {
    const sql = `
      SELECT 
        id,
        user_id,
        refresh_token_hash,
        expires_at,
        created_at,
        last_used_at,
        revoked_at,
        user_agent,
        ip_address
      FROM auth_sessions
      WHERE refresh_token_hash = ?
      LIMIT 1
    `;
    return queryOne<AuthSessionRow>(sql, [tokenHash]);
  }

  /**
   * Revokes a specific session.
   */
  async revokeSession(sessionId: string): Promise<void> {
    const sql = `
      UPDATE auth_sessions
      SET revoked_at = CURRENT_TIMESTAMP(6)
      WHERE id = ?
    `;
    await execute(sql, [sessionId]);
  }

  /**
   * Revokes all active refresh sessions for a user (e.g. on password change).
   */
  async revokeAllUserSessions(userId: string, exceptSessionId?: string): Promise<void> {
    let sql = `
      UPDATE auth_sessions
      SET revoked_at = CURRENT_TIMESTAMP(6)
      WHERE user_id = ? AND revoked_at IS NULL
    `;
    const params: (string | number | boolean | Date | null | undefined)[] = [userId];

    if (exceptSessionId) {
      sql += " AND id != ?";
      params.push(exceptSessionId);
    }

    await execute(sql, params);
  }

  /**
   * Creates a single-use initialization token for initial password setup.
   */
  async createInitToken(userId: string, tokenHash: string, expiresAt: Date): Promise<string> {
    const tokenId = (await queryOne<{ id: string }>("SELECT UUID() AS id"))?.id || "";
    const sql = `
      INSERT INTO auth_init_tokens (id, user_id, token_hash, expires_at)
      VALUES (?, ?, ?, ?)
    `;
    await execute(sql, [tokenId, userId, tokenHash, expiresAt]);
    return tokenId;
  }

  /**
   * Finds an unused, unexpired initialization token by its SHA-256 hash.
   */
  async findValidInitTokenByHash(tokenHash: string): Promise<AuthInitTokenRow | null> {
    const sql = `
      SELECT id, user_id, token_hash, expires_at, used_at, created_at
      FROM auth_init_tokens
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP(6)
      LIMIT 1
    `;
    return queryOne<AuthInitTokenRow>(sql, [tokenHash]);
  }

  /**
   * Marks an initialization token as used.
   */
  async markInitTokenUsed(tokenId: string): Promise<void> {
    const sql = `
      UPDATE auth_init_tokens
      SET used_at = CURRENT_TIMESTAMP(6)
      WHERE id = ?
    `;
    await execute(sql, [tokenId]);
  }

  /**
   * Atomically sets a user's initial password and consumes the token.
   */
  async setInitialPasswordWithToken(
    userId: string,
    tokenId: string,
    passwordHash: string
  ): Promise<void> {
    await withTransaction(async (conn) => {
      await conn.execute(
        `
        INSERT INTO user_auth (id, user_id, password_hash, password_changed_at)
        VALUES (UUID(), ?, ?, CURRENT_TIMESTAMP(6))
        ON DUPLICATE KEY UPDATE 
          password_hash = VALUES(password_hash),
          password_changed_at = CURRENT_TIMESTAMP(6),
          failed_login_attempts = 0,
          locked_until = NULL
      `,
        [userId, passwordHash]
      );

      await conn.execute(
        `
        UPDATE auth_init_tokens
        SET used_at = CURRENT_TIMESTAMP(6)
        WHERE id = ?
      `,
        [tokenId]
      );
    });
  }
}

export const authRepository = new AuthRepository();
