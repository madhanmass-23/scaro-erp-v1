import { query, queryOne, execute } from "../utils/database.util.js";
import crypto from "crypto";

export interface AnnouncementRecord {
  id: string;
  author_id: string;
  author_name?: string;
  author_email?: string;
  author_avatar?: string | null;
  author_role?: string;
  title: string;
  content: string;
  priority: string;
  audience: "Everyone" | "Employees" | "Interns" | "Department";
  department_id: string | null;
  department_name?: string | null;
  published_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface AnnouncementListFilter {
  audience?: string;
  priority?: string;
  department_id?: string;
  search?: string;
}

export interface AnnouncementPaginationOptions {
  page: number;
  limit: number;
}

export interface UserAudienceScope {
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isEmployee: boolean;
  isIntern: boolean;
  departmentId?: string | null;
}

export class AnnouncementRepository {
  /**
   * Finds an announcement by ID with author and department info.
   */
  async findById(id: string): Promise<AnnouncementRecord | null> {
    const sql = `
      SELECT 
        a.id,
        a.author_id,
        p.full_name AS author_name,
        p.email AS author_email,
        p.avatar_url AS author_avatar,
        COALESCE(r.name, 'Admin') AS author_role,
        a.title,
        a.content,
        a.priority,
        a.audience,
        a.department_id,
        d.name AS department_name,
        a.published_at,
        a.created_at,
        a.updated_at
      FROM announcements a
      JOIN profiles p ON a.author_id = p.id
      LEFT JOIN user_roles ur ON p.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      LEFT JOIN departments d ON a.department_id = d.id
      WHERE a.id = ?
      LIMIT 1
    `;
    return queryOne<AnnouncementRecord>(sql, [id]);
  }

  /**
   * Lists announcements with audience-based filtering and pagination.
   */
  async listAnnouncements(
    filter: AnnouncementListFilter,
    pagination: AnnouncementPaginationOptions,
    userScope: UserAudienceScope
  ): Promise<{ announcements: AnnouncementRecord[]; total: number }> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    // Audience filtering based on role and department
    if (!userScope.isSuperAdmin && !userScope.isAdmin) {
      if (userScope.isEmployee) {
        if (userScope.departmentId) {
          conditions.push("(a.audience = 'Everyone' OR a.audience = 'Employees' OR (a.audience = 'Department' AND a.department_id = ?))");
          params.push(userScope.departmentId);
        } else {
          conditions.push("(a.audience = 'Everyone' OR a.audience = 'Employees')");
        }
      } else if (userScope.isIntern) {
        if (userScope.departmentId) {
          conditions.push("(a.audience = 'Everyone' OR a.audience = 'Interns' OR (a.audience = 'Department' AND a.department_id = ?))");
          params.push(userScope.departmentId);
        } else {
          conditions.push("(a.audience = 'Everyone' OR a.audience = 'Interns')");
        }
      }
    }

    if (filter.audience) {
      conditions.push("a.audience = ?");
      params.push(filter.audience);
    }
    if (filter.priority) {
      conditions.push("a.priority = ?");
      params.push(filter.priority);
    }
    if (filter.department_id) {
      conditions.push("a.department_id = ?");
      params.push(filter.department_id);
    }
    if (filter.search) {
      conditions.push("(a.title LIKE ? OR a.content LIKE ?)");
      const term = `%${filter.search}%`;
      params.push(term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countSql = `SELECT COUNT(*) AS total FROM announcements a ${whereClause}`;
    const countRow = await queryOne<{ total: number }>(countSql, params);
    const total = countRow ? Number(countRow.total) : 0;

    const page = Math.max(1, pagination.page);
    const limit = Math.max(1, Math.min(100, pagination.limit));
    const offset = (page - 1) * limit;

    const dataSql = `
      SELECT 
        a.id,
        a.author_id,
        p.full_name AS author_name,
        p.email AS author_email,
        p.avatar_url AS author_avatar,
        COALESCE(r.name, 'Admin') AS author_role,
        a.title,
        a.content,
        a.priority,
        a.audience,
        a.department_id,
        d.name AS department_name,
        a.published_at,
        a.created_at,
        a.updated_at
      FROM announcements a
      JOIN profiles p ON a.author_id = p.id
      LEFT JOIN user_roles ur ON p.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      LEFT JOIN departments d ON a.department_id = d.id
      ${whereClause}
      ORDER BY a.published_at DESC
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...params, limit, offset];
    const announcements = await query<AnnouncementRecord>(dataSql, dataParams);

    return { announcements, total };
  }

  /**
   * Creates a new announcement.
   */
  async createAnnouncement(data: {
    id?: string;
    author_id: string;
    title: string;
    content: string;
    priority?: string;
    audience?: "Everyone" | "Employees" | "Interns" | "Department";
    department_id?: string | null;
    published_at?: Date | string;
  }): Promise<AnnouncementRecord> {
    const id = data.id || crypto.randomUUID();
    const priority = data.priority || "Normal";
    const audience = data.audience || "Everyone";

    const sql = `
      INSERT INTO announcements (
        id, author_id, title, content, priority, audience, department_id,
        published_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP(6)), CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6))
    `;

    await execute(sql, [
      id,
      data.author_id,
      data.title,
      data.content,
      priority,
      audience,
      data.department_id || null,
      data.published_at || null,
    ]);

    const created = await this.findById(id);
    if (!created) {
      throw new Error("Failed to retrieve created announcement");
    }
    return created;
  }

  /**
   * Updates an announcement.
   */
  async updateAnnouncement(id: string, fields: Record<string, any>): Promise<AnnouncementRecord | null> {
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

    const updateSql = `UPDATE announcements SET ${setClauses.join(", ")} WHERE id = ?`;
    await execute(updateSql, params);

    return this.findById(id);
  }
}

export const announcementRepository = new AnnouncementRepository();
