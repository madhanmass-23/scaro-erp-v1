import { query, queryOne, execute, withTransaction } from "../utils/database.util.js";
import crypto from "crypto";

export interface ProjectRecord {
  id: string;
  name: string;
  description: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  owner_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  created_by: string;
  creator_name: string | null;
  creator_email: string | null;
  member_count: number;
  task_count: number;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface ProjectMemberRecord {
  project_id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  created_at: Date | string;
}

export interface ProjectListFilter {
  status?: string;
  owner_id?: string;
  search?: string;
}

export interface ProjectPaginationOptions {
  page: number;
  limit: number;
}

export class ProjectRepository {
  /**
   * Retrieves a single project by ID with joined owner, creator, and counts.
   */
  async findById(id: string): Promise<ProjectRecord | null> {
    const sql = `
      SELECT 
        p.id,
        p.name,
        p.description,
        p.status,
        p.start_date,
        p.end_date,
        p.owner_id,
        o.full_name AS owner_name,
        o.email AS owner_email,
        p.created_by,
        c.full_name AS creator_name,
        c.email AS creator_email,
        (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) AS member_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
        p.created_at,
        p.updated_at
      FROM projects p
      LEFT JOIN profiles o ON p.owner_id = o.id
      LEFT JOIN profiles c ON p.created_by = c.id
      WHERE p.id = ?
      LIMIT 1
    `;
    return queryOne<ProjectRecord>(sql, [id]);
  }

  /**
   * Checks if a user is a member, owner, or creator of a project.
   */
  async isUserAssociatedWithProject(projectId: string, userId: string): Promise<boolean> {
    const sql = `
      SELECT 1 FROM projects p
      LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = ?
      WHERE p.id = ? AND (p.owner_id = ? OR p.created_by = ? OR pm.user_id IS NOT NULL)
      LIMIT 1
    `;
    const row = await queryOne<{ 1: number }>(sql, [userId, projectId, userId, userId]);
    return !!row;
  }

  /**
   * Checks if a specific user is explicitly enrolled in project_members.
   */
  async isProjectMember(projectId: string, userId: string): Promise<boolean> {
    const sql = `
      SELECT 1 FROM project_members
      WHERE project_id = ? AND user_id = ?
      LIMIT 1
    `;
    const row = await queryOne<{ 1: number }>(sql, [projectId, userId]);
    return !!row;
  }

  /**
   * Lists projects with filtering, pagination, and optional membership scoping.
   */
  async listProjects(
    filter: ProjectListFilter,
    pagination: ProjectPaginationOptions,
    scopedUserProjectIds?: string[] | null
  ): Promise<{ projects: ProjectRecord[]; total: number }> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    // If scoped to member projects (for non-admin users)
    if (scopedUserProjectIds !== null && scopedUserProjectIds !== undefined) {
      if (scopedUserProjectIds.length === 0) {
        return { projects: [], total: 0 };
      }
      const placeholders = scopedUserProjectIds.map(() => "?").join(", ");
      conditions.push(`p.id IN (${placeholders})`);
      params.push(...scopedUserProjectIds);
    }

    if (filter.status) {
      conditions.push("p.status = ?");
      params.push(filter.status);
    }

    if (filter.owner_id) {
      conditions.push("p.owner_id = ?");
      params.push(filter.owner_id);
    }

    if (filter.search && filter.search.trim().length > 0) {
      const term = `%${filter.search.trim()}%`;
      conditions.push("(p.name LIKE ? OR p.description LIKE ?)");
      params.push(term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // 1. Total count
    const countSql = `
      SELECT COUNT(DISTINCT p.id) AS total
      FROM projects p
      ${whereClause}
    `;
    const countRow = await queryOne<{ total: number }>(countSql, params);
    const total = countRow ? Number(countRow.total) : 0;

    // 2. Paginated rows
    const page = Math.max(1, pagination.page);
    const limit = Math.max(1, Math.min(100, pagination.limit));
    const offset = (page - 1) * limit;

    const dataSql = `
      SELECT 
        p.id,
        p.name,
        p.description,
        p.status,
        p.start_date,
        p.end_date,
        p.owner_id,
        o.full_name AS owner_name,
        o.email AS owner_email,
        p.created_by,
        c.full_name AS creator_name,
        c.email AS creator_email,
        (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) AS member_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
        p.created_at,
        p.updated_at
      FROM projects p
      LEFT JOIN profiles o ON p.owner_id = o.id
      LEFT JOIN profiles c ON p.created_by = c.id
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...params, limit, offset];
    const projects = await query<ProjectRecord>(dataSql, dataParams);

    return { projects, total };
  }

  /**
   * Gets all project IDs that a user is associated with (as member, owner, or creator).
   */
  async getUserAssociatedProjectIds(userId: string): Promise<string[]> {
    const sql = `
      SELECT DISTINCT p.id
      FROM projects p
      LEFT JOIN project_members pm ON p.id = pm.project_id
      WHERE pm.user_id = ? OR p.owner_id = ? OR p.created_by = ?
    `;
    const rows = await query<{ id: string }>(sql, [userId, userId, userId]);
    return rows.map((r) => r.id);
  }

  /**
   * Creates a project and automatically assigns the creator as the first member.
   */
  async createProject(data: {
    id?: string;
    name: string;
    description?: string | null;
    status?: string;
    start_date?: string | null;
    end_date?: string | null;
    owner_id?: string | null;
    created_by: string;
  }): Promise<ProjectRecord> {
    const projectId = data.id || crypto.randomUUID();
    const status = data.status || "Active";

    return withTransaction(async (conn) => {
      const insertProjectSql = `
        INSERT INTO projects (
          id, name, description, status, start_date, end_date, owner_id, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6))
      `;
      await conn.execute(insertProjectSql, [
        projectId,
        data.name,
        data.description || null,
        status,
        data.start_date || null,
        data.end_date || null,
        data.owner_id || null,
        data.created_by,
      ]);

      // Automatically add creator into project_members
      const insertMemberSql = `
        INSERT IGNORE INTO project_members (project_id, user_id, created_at)
        VALUES (?, ?, CURRENT_TIMESTAMP(6))
      `;
      await conn.execute(insertMemberSql, [projectId, data.created_by]);

      // If owner is designated and differs from creator, also add owner
      if (data.owner_id && data.owner_id !== data.created_by) {
        await conn.execute(insertMemberSql, [projectId, data.owner_id]);
      }

      // Fetch newly created record
      const [rows] = await conn.query<any[]>(
        `
        SELECT 
          p.id, p.name, p.description, p.status, p.start_date, p.end_date,
          p.owner_id, o.full_name AS owner_name, o.email AS owner_email,
          p.created_by, c.full_name AS creator_name, c.email AS creator_email,
          (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) AS member_count,
          (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
          p.created_at, p.updated_at
        FROM projects p
        LEFT JOIN profiles o ON p.owner_id = o.id
        LEFT JOIN profiles c ON p.created_by = c.id
        WHERE p.id = ?
        LIMIT 1
      `,
        [projectId]
      );

      return rows[0] as ProjectRecord;
    });
  }

  /**
   * Updates permitted project fields.
   */
  async update(id: string, fields: Record<string, any>): Promise<ProjectRecord | null> {
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

    const updateSql = `UPDATE projects SET ${setClauses.join(", ")} WHERE id = ?`;
    await execute(updateSql, params);

    return this.findById(id);
  }

  /**
   * Retrieves members belonging to a project.
   */
  async getMembers(projectId: string): Promise<ProjectMemberRecord[]> {
    const sql = `
      SELECT 
        pm.project_id,
        pm.user_id,
        p.full_name,
        p.email,
        COALESCE(r.name, 'Employee') AS role,
        p.avatar_url,
        pm.created_at
      FROM project_members pm
      JOIN profiles p ON pm.user_id = p.id
      LEFT JOIN user_roles ur ON p.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE pm.project_id = ?
      ORDER BY p.full_name ASC
    `;
    return query<ProjectMemberRecord>(sql, [projectId]);
  }

  /**
   * Adds a user to project_members.
   */
  async addMember(projectId: string, userId: string): Promise<void> {
    const sql = `
      INSERT INTO project_members (project_id, user_id, created_at)
      VALUES (?, ?, CURRENT_TIMESTAMP(6))
    `;
    await execute(sql, [projectId, userId]);
  }

  /**
   * Removes a user from project_members.
   */
  async removeMember(projectId: string, userId: string): Promise<boolean> {
    const sql = `
      DELETE FROM project_members
      WHERE project_id = ? AND user_id = ?
    `;
    const result = await execute(sql, [projectId, userId]);
    return result.affectedRows > 0;
  }
}

export const projectRepository = new ProjectRepository();
