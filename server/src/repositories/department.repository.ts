import { query, queryOne, execute } from "../utils/database.util.js";
import crypto from "crypto";

export interface DepartmentRecord {
  id: string;
  name: string;
  description: string | null;
  manager_id: string | null;
  manager_name?: string | null;
  manager_email?: string | null;
  is_active: number | boolean;
  member_count?: number;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface DepartmentListFilter {
  is_active?: boolean;
  search?: string;
}

export interface DepartmentPaginationOptions {
  page: number;
  limit: number;
}

export class DepartmentRepository {
  /**
   * Finds a department by ID with joined manager information.
   */
  async findById(id: string): Promise<DepartmentRecord | null> {
    const sql = `
      SELECT 
        d.id,
        d.name,
        d.description,
        d.manager_id,
        m.full_name AS manager_name,
        m.email AS manager_email,
        d.is_active,
        (SELECT COUNT(*) FROM profiles p WHERE p.department_id = d.id AND p.is_active = 1) AS member_count,
        d.created_at,
        d.updated_at
      FROM departments d
      LEFT JOIN profiles m ON d.manager_id = m.id
      WHERE d.id = ?
      LIMIT 1
    `;
    return queryOne<DepartmentRecord>(sql, [id]);
  }

  /**
   * Finds a department by unique name.
   */
  async findByName(name: string): Promise<DepartmentRecord | null> {
    const sql = `
      SELECT 
        d.id,
        d.name,
        d.description,
        d.manager_id,
        m.full_name AS manager_name,
        m.email AS manager_email,
        d.is_active,
        (SELECT COUNT(*) FROM profiles p WHERE p.department_id = d.id AND p.is_active = 1) AS member_count,
        d.created_at,
        d.updated_at
      FROM departments d
      LEFT JOIN profiles m ON d.manager_id = m.id
      WHERE LOWER(d.name) = LOWER(?)
      LIMIT 1
    `;
    return queryOne<DepartmentRecord>(sql, [name.trim()]);
  }

  /**
   * Lists departments with filters and pagination.
   */
  async listDepartments(
    filter: DepartmentListFilter,
    pagination: DepartmentPaginationOptions
  ): Promise<{ departments: DepartmentRecord[]; total: number }> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filter.is_active !== undefined) {
      conditions.push("d.is_active = ?");
      params.push(filter.is_active ? 1 : 0);
    }
    if (filter.search) {
      conditions.push("(d.name LIKE ? OR d.description LIKE ?)");
      const term = `%${filter.search}%`;
      params.push(term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countSql = `SELECT COUNT(*) AS total FROM departments d ${whereClause}`;
    const countRow = await queryOne<{ total: number }>(countSql, params);
    const total = countRow ? Number(countRow.total) : 0;

    const page = Math.max(1, pagination.page);
    const limit = Math.max(1, Math.min(100, pagination.limit));
    const offset = (page - 1) * limit;

    const dataSql = `
      SELECT 
        d.id,
        d.name,
        d.description,
        d.manager_id,
        m.full_name AS manager_name,
        m.email AS manager_email,
        d.is_active,
        (SELECT COUNT(*) FROM profiles p WHERE p.department_id = d.id AND p.is_active = 1) AS member_count,
        d.created_at,
        d.updated_at
      FROM departments d
      LEFT JOIN profiles m ON d.manager_id = m.id
      ${whereClause}
      ORDER BY d.name ASC
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...params, limit, offset];
    const departments = await query<DepartmentRecord>(dataSql, dataParams);

    return { departments, total };
  }

  /**
   * Creates a new department.
   */
  async createDepartment(data: {
    id?: string;
    name: string;
    description?: string | null;
    manager_id?: string | null;
    is_active?: boolean;
  }): Promise<DepartmentRecord> {
    const id = data.id || crypto.randomUUID();
    const isActive = data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1;

    const sql = `
      INSERT INTO departments (
        id, name, description, manager_id, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6))
    `;

    await execute(sql, [
      id,
      data.name.trim(),
      data.description ? data.description.trim() : null,
      data.manager_id || null,
      isActive,
    ]);

    const created = await this.findById(id);
    if (!created) {
      throw new Error("Failed to retrieve created department");
    }
    return created;
  }

  /**
   * Updates an existing department.
   */
  async updateDepartment(id: string, fields: Record<string, any>): Promise<DepartmentRecord | null> {
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

    const updateSql = `UPDATE departments SET ${setClauses.join(", ")} WHERE id = ?`;
    await execute(updateSql, params);

    return this.findById(id);
  }
}

export const departmentRepository = new DepartmentRepository();
