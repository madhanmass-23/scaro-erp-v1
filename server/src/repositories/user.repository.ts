import { query, queryOne, execute } from "../utils/database.util.js";

export interface UserProfileRecord {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  department_id: string | null;
  department_name: string | null;
  designation: string | null;
  joining_date: string | null;
  employment_status: "Employee" | "Intern";
  is_active: number;
  linkedin: string | null;
  github: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  role: string;
}

export interface UserListFilter {
  role?: string;
  department_id?: string;
  employment_status?: string;
  is_active?: boolean;
  search?: string;
}

export interface PaginationOptions {
  page: number;
  limit: number;
}

export class UserRepository {
  /**
   * Retrieves a single user profile with joined role and department by User ID.
   */
  async findById(id: string): Promise<UserProfileRecord | null> {
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
        p.joining_date,
        p.employment_status,
        p.is_active,
        p.linkedin,
        p.github,
        p.created_at,
        p.updated_at,
        COALESCE(r.name, 'Unknown') AS role
      FROM profiles p
      LEFT JOIN departments d ON p.department_id = d.id
      LEFT JOIN user_roles ur ON p.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE p.id = ?
      LIMIT 1
    `;
    return queryOne<UserProfileRecord>(sql, [id]);
  }

  /**
   * Retrieves a single user profile with joined role and department by Email.
   */
  async findByEmail(email: string): Promise<UserProfileRecord | null> {
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
        p.joining_date,
        p.employment_status,
        p.is_active,
        p.linkedin,
        p.github,
        p.created_at,
        p.updated_at,
        COALESCE(r.name, 'Unknown') AS role
      FROM profiles p
      LEFT JOIN departments d ON p.department_id = d.id
      LEFT JOIN user_roles ur ON p.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE p.email = ?
      LIMIT 1
    `;
    return queryOne<UserProfileRecord>(sql, [email]);
  }

  /**
   * Lists users with safe parameterized filtering and pagination.
   */
  async listUsers(
    filter: UserListFilter,
    pagination: PaginationOptions
  ): Promise<{ users: UserProfileRecord[]; total: number }> {
    const conditions: string[] = [];
    const params: (string | number | boolean)[] = [];

    // Safe filtering on explicit allow-list
    if (filter.role) {
      conditions.push("r.name = ?");
      params.push(filter.role);
    }

    if (filter.department_id) {
      conditions.push("p.department_id = ?");
      params.push(filter.department_id);
    }

    if (filter.employment_status) {
      conditions.push("p.employment_status = ?");
      params.push(filter.employment_status);
    }

    if (filter.is_active !== undefined) {
      conditions.push("p.is_active = ?");
      params.push(filter.is_active ? 1 : 0);
    }

    if (filter.search && filter.search.trim().length > 0) {
      const searchTerm = `%${filter.search.trim()}%`;
      conditions.push("(p.full_name LIKE ? OR p.email LIKE ? OR p.phone LIKE ?)");
      params.push(searchTerm, searchTerm, searchTerm);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // 1. Get total count
    const countSql = `
      SELECT COUNT(DISTINCT p.id) AS total
      FROM profiles p
      LEFT JOIN departments d ON p.department_id = d.id
      LEFT JOIN user_roles ur ON p.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      ${whereClause}
    `;
    const countRow = await queryOne<{ total: number }>(countSql, params);
    const total = countRow ? Number(countRow.total) : 0;

    // 2. Fetch paginated rows
    const page = Math.max(1, pagination.page);
    const limit = Math.max(1, Math.min(100, pagination.limit));
    const offset = (page - 1) * limit;

    const dataSql = `
      SELECT 
        p.id,
        p.email,
        p.full_name,
        p.avatar_url,
        p.phone,
        p.department_id,
        d.name AS department_name,
        p.designation,
        p.joining_date,
        p.employment_status,
        p.is_active,
        p.linkedin,
        p.github,
        p.created_at,
        p.updated_at,
        COALESCE(r.name, 'Unknown') AS role
      FROM profiles p
      LEFT JOIN departments d ON p.department_id = d.id
      LEFT JOIN user_roles ur ON p.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      ${whereClause}
      ORDER BY p.full_name ASC
      LIMIT ? OFFSET ?
    `;

    const dataParams = [...params, limit, offset];
    const users = await query<UserProfileRecord>(dataSql, dataParams);

    return { users, total };
  }

  /**
   * Updates permitted profile fields for a user.
   */
  async update(id: string, fields: Record<string, any>): Promise<UserProfileRecord | null> {
    const keys = Object.keys(fields);
    if (keys.length === 0) {
      return this.findById(id);
    }

    const setClauses: string[] = [];
    const params: any[] = [];

    for (const key of keys) {
      setClauses.push(`\`${key}\` = ?`);
      params.push(fields[key]);
    }

    setClauses.push("`updated_at` = CURRENT_TIMESTAMP(6)");
    params.push(id);

    const updateSql = `UPDATE profiles SET ${setClauses.join(", ")} WHERE id = ?`;
    await execute(updateSql, params);

    return this.findById(id);
  }

  /**
   * Checks if an active department exists by ID.
   */
  async departmentExists(departmentId: string): Promise<boolean> {
    const row = await queryOne<{ id: string }>(
      "SELECT id FROM departments WHERE id = ? AND is_active = 1 LIMIT 1",
      [departmentId]
    );
    return !!row;
  }
}

export const userRepository = new UserRepository();
