import { query, queryOne } from "../utils/database.util.js";

export interface ManagementDashboardData {
  workforce: {
    total_active: number;
    super_admins: number;
    admins: number;
    employees: number;
    interns: number;
  };
  attendance_today: {
    present: number;
    half_day: number;
    absent: number;
    total_logged: number;
  };
  tasks: {
    total: number;
    todo: number;
    in_progress: number;
    in_review: number;
    completed: number;
    blocked: number;
  };
  projects: {
    total: number;
  };
  meetings: {
    today: number;
    upcoming: number;
  };
  leave_requests: {
    pending: number;
  };
  announcements: {
    total: number;
  };
}

export interface PersonalDashboardData {
  tasks: {
    total_assigned: number;
    todo: number;
    in_progress: number;
    completed: number;
  };
  attendance_today: {
    logged: boolean;
    status: string | null;
    clock_in_time: string | null;
    clock_out_time: string | null;
  };
  daily_report_today: {
    submitted: boolean;
    status: string | null;
    submitted_at: string | null;
  };
  meetings: {
    upcoming_count: number;
  };
  leave_requests: {
    pending_count: number;
  };
  notifications: {
    unread_count: number;
  };
  messages: {
    unread_count: number;
  };
}

export class DashboardRepository {
  /**
   * Aggregates organization-wide management metrics dynamically from MariaDB.
   */
  async getManagementStats(): Promise<ManagementDashboardData> {
    // 1. Workforce distribution
    const workforceRows = await query<{ role_name: string; user_count: number }>(`
      SELECT 
        r.name AS role_name,
        COUNT(p.id) AS user_count
      FROM roles r
      LEFT JOIN user_roles ur ON r.id = ur.role_id
      LEFT JOIN profiles p ON ur.user_id = p.id AND p.is_active = 1
      GROUP BY r.name
    `);

    let superAdmins = 0;
    let admins = 0;
    let employees = 0;
    let interns = 0;
    let totalActive = 0;

    for (const row of workforceRows) {
      const count = Number(row.user_count) || 0;
      totalActive += count;
      if (row.role_name === "Super Admin") superAdmins = count;
      else if (row.role_name === "Admin") admins = count;
      else if (row.role_name === "Employee") employees = count;
      else if (row.role_name === "Intern") interns = count;
    }

    // 2. Attendance today
    const attRows = await query<{ status: string; count: number }>(`
      SELECT status, COUNT(*) AS count
      FROM attendance_sessions
      WHERE session_date = CURRENT_DATE()
      GROUP BY status
    `);

    let present = 0;
    let halfDay = 0;
    let absent = 0;
    let totalLogged = 0;

    for (const row of attRows) {
      const count = Number(row.count) || 0;
      totalLogged += count;
      if (row.status === "Present") present = count;
      else if (row.status === "Half Day") halfDay = count;
      else if (row.status === "Absent") absent = count;
    }

    // 3. Tasks distribution
    const taskRows = await query<{ status: string; count: number }>(`
      SELECT status, COUNT(*) AS count
      FROM tasks
      GROUP BY status
    `);

    let totalTasks = 0;
    let todo = 0;
    let inProgress = 0;
    let inReview = 0;
    let completed = 0;
    let blocked = 0;

    for (const row of taskRows) {
      const count = Number(row.count) || 0;
      totalTasks += count;
      if (row.status === "To Do") todo = count;
      else if (row.status === "In Progress") inProgress = count;
      else if (row.status === "In Review") inReview = count;
      else if (row.status === "Completed") completed = count;
      else if (row.status === "Blocked") blocked = count;
    }

    // 4. Projects count
    const projRow = await queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM projects`);
    const totalProjects = projRow ? Number(projRow.total) : 0;

    // 5. Meetings today & upcoming
    const meetTodayRow = await queryOne<{ count: number }>(`
      SELECT COUNT(*) AS count FROM meetings WHERE meeting_date = CURRENT_DATE()
    `);
    const meetUpcomingRow = await queryOne<{ count: number }>(`
      SELECT COUNT(*) AS count FROM meetings WHERE meeting_date > CURRENT_DATE()
    `);

    // 6. Pending leave requests
    const leaveRow = await queryOne<{ count: number }>(`
      SELECT COUNT(*) AS count FROM leave_requests WHERE status = 'Pending'
    `);

    // 7. Announcements
    const annRow = await queryOne<{ count: number }>(`
      SELECT COUNT(*) AS count FROM announcements
    `);

    return {
      workforce: {
        total_active: totalActive,
        super_admins: superAdmins,
        admins: admins,
        employees,
        interns,
      },
      attendance_today: {
        present,
        half_day: halfDay,
        absent,
        total_logged: totalLogged,
      },
      tasks: {
        total: totalTasks,
        todo,
        in_progress: inProgress,
        in_review: inReview,
        completed,
        blocked,
      },
      projects: {
        total: totalProjects,
      },
      meetings: {
        today: meetTodayRow ? Number(meetTodayRow.count) : 0,
        upcoming: meetUpcomingRow ? Number(meetUpcomingRow.count) : 0,
      },
      leave_requests: {
        pending: leaveRow ? Number(leaveRow.count) : 0,
      },
      announcements: {
        total: annRow ? Number(annRow.count) : 0,
      },
    };
  }

  /**
   * Aggregates personal user metrics.
   */
  async getPersonalStats(userId: string): Promise<PersonalDashboardData> {
    // 1. Personal tasks
    const taskRows = await query<{ status: string; count: number }>(`
      SELECT status, COUNT(*) AS count
      FROM tasks
      WHERE assignee_id = ?
      GROUP BY status
    `, [userId]);

    let totalAssigned = 0;
    let todo = 0;
    let inProgress = 0;
    let completed = 0;

    for (const row of taskRows) {
      const count = Number(row.count) || 0;
      totalAssigned += count;
      if (row.status === "To Do") todo = count;
      else if (row.status === "In Progress") inProgress = count;
      else if (row.status === "Completed") completed = count;
    }

    // 2. Personal attendance today
    const attRow = await queryOne<{
      status: string;
      clock_in_time: Date | string;
      clock_out_time: Date | string | null;
    }>(`
      SELECT status, clock_in_time, clock_out_time
      FROM attendance_sessions
      WHERE user_id = ? AND session_date = CURRENT_DATE()
      LIMIT 1
    `, [userId]);

    // 3. Personal daily report today
    const reportRow = await queryOne<{
      status: string;
      submitted_at: Date | string | null;
    }>(`
      SELECT status, submitted_at
      FROM daily_reports
      WHERE user_id = ? AND report_date = CURRENT_DATE()
      LIMIT 1
    `, [userId]);

    // 4. Upcoming enrolled meetings
    const meetRow = await queryOne<{ count: number }>(`
      SELECT COUNT(*) AS count
      FROM meeting_participants mp
      JOIN meetings m ON mp.meeting_id = m.id
      WHERE mp.participant_id = ? AND m.meeting_date >= CURRENT_DATE()
    `, [userId]);

    // 5. Personal pending leave requests
    const leaveRow = await queryOne<{ count: number }>(`
      SELECT COUNT(*) AS count
      FROM leave_requests
      WHERE user_id = ? AND status = 'Pending'
    `, [userId]);

    // 6. Unread notifications count
    const notifRow = await queryOne<{ count: number }>(`
      SELECT COUNT(*) AS count
      FROM notifications
      WHERE user_id = ? AND is_read = 0
    `, [userId]);

    // 7. Unread direct messages count
    const msgRow = await queryOne<{ count: number }>(`
      SELECT COUNT(*) AS count
      FROM messages
      WHERE recipient_id = ? AND is_read = 0
    `, [userId]);

    return {
      tasks: {
        total_assigned: totalAssigned,
        todo,
        in_progress: inProgress,
        completed,
      },
      attendance_today: {
        logged: Boolean(attRow),
        status: attRow ? attRow.status : null,
        clock_in_time: attRow && attRow.clock_in_time ? String(attRow.clock_in_time) : null,
        clock_out_time: attRow && attRow.clock_out_time ? String(attRow.clock_out_time) : null,
      },
      daily_report_today: {
        submitted: Boolean(reportRow && reportRow.submitted_at),
        status: reportRow ? reportRow.status : "Not Submitted",
        submitted_at: reportRow && reportRow.submitted_at ? String(reportRow.submitted_at) : null,
      },
      meetings: {
        upcoming_count: meetRow ? Number(meetRow.count) : 0,
      },
      leave_requests: {
        pending_count: leaveRow ? Number(leaveRow.count) : 0,
      },
      notifications: {
        unread_count: notifRow ? Number(notifRow.count) : 0,
      },
      messages: {
        unread_count: msgRow ? Number(msgRow.count) : 0,
      },
    };
  }
}

export const dashboardRepository = new DashboardRepository();
