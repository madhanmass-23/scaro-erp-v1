import { dashboardApi, type ManagementDashboardData } from './api/dashboardApi';
import { userApi, type SafeUserProfile } from './api/userApi';
import { attendanceApi, type SafeManagementAttendanceDto } from './api/attendanceApi';
import { dailyReportApi, type SafeDailyReportDto } from './api/dailyReportApi';
import { taskApi, type SafeTaskDto } from './api/taskApi';
import { projectApi, type SafeProjectDto } from './api/projectApi';
import { leaveApi, type SafeLeaveRequestDto } from './api/leaveApi';
import { meetingApi, type SafeMeetingDto } from './api/meetingApi';
import { evaluateWorkforceCorrelationStatus } from '../utils/workforceLogic';
import type {
  ManagementMetrics,
  AttendanceReportCorrelationItem,
  ReportedBlockerItem,
  ReportedRequirementItem,
  SyncHealthSummary,
  ManagementReportItem,
  ManagementReportTask,
  ReportFilterParams,
  PersonProjectContribution,
  PersonMeetingItem,
  PersonLeaveItem,
  WorkHistoryItem,
  OperationalAlert,
  TeamWorkloadMember,
  WorkActivityTrendPoint,
  WorkforceTrendsResult,
  PersonWorkIntelligence,
} from '../types/management';

export { evaluateWorkforceCorrelationStatus } from '../utils/workforceLogic';

/**
 * Shared Management Intelligence Data Service
 * Reads authoritative data using Node.js / Express REST API endpoints backed by MariaDB.
 */

export async function fetchManagementMetrics(): Promise<ManagementMetrics> {
  const today = new Date().toISOString().split('T')[0];

  const [dashboardSummary, todayReports, todayAttendance] = await Promise.all([
    dashboardApi.getSummary().catch(() => null),
    dailyReportApi.listReports({ date: today, limit: 100 }).catch(() => [] as SafeDailyReportDto[]),
    attendanceApi.getManagementAttendance({ date: today, limit: 100 }).catch(() => [] as SafeManagementAttendanceDto[]),
  ]);

  if (dashboardSummary && dashboardSummary.role_type === 'management') {
    const data = dashboardSummary.data as ManagementDashboardData;

    const submittedReports = todayReports.filter((r: SafeDailyReportDto) => r.status?.toLowerCase() === 'submitted');
    const blockersCount = submittedReports.filter((r: SafeDailyReportDto) => r.blockers && r.blockers.trim() !== '').length;

    const checkedInCount = data.attendance_today?.total_logged ?? todayAttendance.filter((a: SafeManagementAttendanceDto) => !!a.clock_in_time).length;
    const reportsDone = submittedReports.length;
    const reportsPending = Math.max(0, checkedInCount - reportsDone);

    return {
      totalEmployees: data.workforce?.employees || 0,
      totalInterns: data.workforce?.interns || 0,
      totalAdmins: data.workforce?.admins || 0,
      totalSuperAdmins: data.workforce?.super_admins || 0,
      activeUsers: data.workforce?.total_active || 0,
      checkedInToday: checkedInCount,
      reportsSubmittedToday: reportsDone,
      reportsPendingToday: reportsPending,
      reportedBlockersCount: blockersCount,
      activeProjects: data.projects?.total || 0,
      activeTasks: (data.tasks?.total || 0) - (data.tasks?.completed || 0),
    };
  }

  // Fallback computation from entity lists
  const users = await userApi.getUsers({ is_active: true, limit: 100 }).catch(() => [] as SafeUserProfile[]);
  const employees = users.filter((u: SafeUserProfile) => u.role === 'Employee').length;
  const interns = users.filter((u: SafeUserProfile) => u.role === 'Intern').length;
  const admins = users.filter((u: SafeUserProfile) => u.role === 'Admin').length;
  const superAdmins = users.filter((u: SafeUserProfile) => u.role === 'Super Admin').length;

  const submittedReports = todayReports.filter((r: SafeDailyReportDto) => r.status?.toLowerCase() === 'submitted');
  const blockersCount = submittedReports.filter((r: SafeDailyReportDto) => r.blockers && r.blockers.trim() !== '').length;
  const checkedInCount = todayAttendance.filter((a: SafeManagementAttendanceDto) => !!a.clock_in_time).length;

  return {
    totalEmployees: employees,
    totalInterns: interns,
    totalAdmins: admins,
    totalSuperAdmins: superAdmins,
    activeUsers: users.length,
    checkedInToday: checkedInCount,
    reportsSubmittedToday: submittedReports.length,
    reportsPendingToday: Math.max(0, checkedInCount - submittedReports.length),
    reportedBlockersCount: blockersCount,
    activeProjects: 0,
    activeTasks: 0,
  };
}

export async function fetchAttendanceReportCorrelation(dateString?: string): Promise<AttendanceReportCorrelationItem[]> {
  const targetDate = dateString || new Date().toISOString().split('T')[0];

  const [users, sessions, reports, approvedLeaves] = await Promise.all([
    userApi.getUsers({ is_active: true, limit: 100 }).catch(() => [] as SafeUserProfile[]),
    attendanceApi.getManagementAttendance({ date: targetDate, limit: 100 }).catch(() => [] as SafeManagementAttendanceDto[]),
    dailyReportApi.listReports({ date: targetDate, limit: 100 }).catch(() => [] as SafeDailyReportDto[]),
    leaveApi.getLeaveRequests({ status: 'Approved', from: targetDate, to: targetDate, limit: 100 }).catch(() => [] as SafeLeaveRequestDto[]),
  ]);

  const sessionMap = new Map<string, SafeManagementAttendanceDto>();
  sessions.forEach((s: SafeManagementAttendanceDto) => {
    if (!sessionMap.has(s.user_id)) {
      sessionMap.set(s.user_id, s);
    }
  });

  const reportMap = new Map<string, SafeDailyReportDto>();
  reports.forEach((r: SafeDailyReportDto) => {
    reportMap.set(r.user_id, r);
  });

  const approvedLeaveUserIds = new Set(approvedLeaves.map((l: SafeLeaveRequestDto) => l.user_id));

  const correlationList: AttendanceReportCorrelationItem[] = [];

  users.forEach((u: SafeUserProfile) => {
    if (u.role === 'Super Admin' || u.role === 'Admin') return;
    if (u.role !== 'Employee' && u.role !== 'Intern') return;

    const session = sessionMap.get(u.id);
    const report = reportMap.get(u.id);

    const isPresent = !!(session && session.clock_in_time);
    const isSubmitted = report?.status?.toLowerCase() === 'submitted';
    const isApprovedLeave = approvedLeaveUserIds.has(u.id);

    const { status } = evaluateWorkforceCorrelationStatus(isPresent, isSubmitted, isApprovedLeave);

    correlationList.push({
      userId: u.id,
      fullName: u.full_name,
      email: u.email,
      avatarUrl: u.avatar_url || undefined,
      role: u.role,
      departmentName: u.department || 'General',
      status,
      clockInTime: session?.clock_in_time || null,
      clockOutTime: session?.clock_out_time || null,
      reportId: report?.id || null,
      reportStatus: report?.status || null,
    });
  });

  return correlationList;
}

export async function fetchReportedBlockers(limit = 15): Promise<ReportedBlockerItem[]> {
  const reports = await dailyReportApi.listReports({ status: 'Submitted', limit: 50 }).catch(() => [] as SafeDailyReportDto[]);

  return reports
    .filter((r: SafeDailyReportDto) => r.blockers && r.blockers.trim() !== '')
    .slice(0, limit)
    .map((r: SafeDailyReportDto) => ({
      reportId: r.id,
      reportDate: r.report_date,
      userId: r.user_id,
      userName: r.user_name || 'Unknown',
      role: r.role || 'Team Member',
      departmentName: 'General',
      blockerText: r.blockers!,
      submittedAt: r.submitted_at,
    }));
}

export async function fetchReportedRequirements(limit = 15): Promise<ReportedRequirementItem[]> {
  const reports = await dailyReportApi.listReports({ status: 'Submitted', limit: 50 }).catch(() => [] as SafeDailyReportDto[]);

  return reports
    .filter((r: SafeDailyReportDto) => r.company_requirements && r.company_requirements.trim() !== '')
    .slice(0, limit)
    .map((r: SafeDailyReportDto) => ({
      reportId: r.id,
      reportDate: r.report_date,
      userId: r.user_id,
      userName: r.user_name || 'Unknown',
      role: r.role || 'Team Member',
      departmentName: 'General',
      requirementText: r.company_requirements!,
      submittedAt: r.submitted_at,
    }));
}

export async function fetchSyncHealth(): Promise<SyncHealthSummary> {
  const reports = await dailyReportApi.listReports({ limit: 100 }).catch(() => [] as SafeDailyReportDto[]);

  let synced = 0;
  let pending = 0;
  let failed = 0;
  let permanentlyFailed = 0;
  const failedRecords: SyncHealthSummary['failedRecords'] = [];

  reports.forEach((r: SafeDailyReportDto) => {
    if (!r.sync) return;
    const s = r.sync;
    if (s.status === 'synced') synced++;
    else if (s.status === 'pending' || s.status === 'processing') pending++;
    else if (s.status === 'failed') {
      failed++;
      failedRecords.push({
        reportId: r.id,
        reportDate: r.report_date,
        userName: r.user_name || 'Unknown',
        attemptCount: s.attempt_count,
        lastAttemptAt: s.last_attempt_at,
        errorMessage: s.error_message,
      });
    } else if (s.status === 'permanently_failed') {
      permanentlyFailed++;
      failedRecords.push({
        reportId: r.id,
        reportDate: r.report_date,
        userName: r.user_name || 'Unknown',
        attemptCount: s.attempt_count,
        lastAttemptAt: s.last_attempt_at,
        errorMessage: s.error_message,
      });
    }
  });

  return {
    synced,
    pending,
    failed,
    permanentlyFailed,
    failedRecords,
  };
}

export async function fetchManagementReports(params: ReportFilterParams): Promise<{
  reports: ManagementReportItem[];
  totalCount: number;
}> {
  const filter: any = {};
  if (params.preset === 'today') {
    filter.date = new Date().toISOString().split('T')[0];
  } else if (params.preset === 'this_week') {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    filter.from = startOfWeek.toISOString().split('T')[0];
  } else if (params.preset === 'this_month') {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    filter.from = startOfMonth.toISOString().split('T')[0];
  } else if (params.startDate && params.endDate) {
    filter.from = params.startDate;
    filter.to = params.endDate;
  } else if (params.startDate) {
    filter.date = params.startDate;
  }

  if (params.status) {
    filter.status = params.status;
  }
  if (params.userId) {
    filter.user_id = params.userId;
  }

  filter.page = params.page;
  filter.limit = params.pageSize;

  const reportList = await dailyReportApi.listReports(filter);

  let reportItems: ManagementReportItem[] = reportList.map((item: SafeDailyReportDto) => {
    const tasks: ManagementReportTask[] = (item.tasks || []).map((t) => ({
      id: t.id,
      taskId: t.task_id || null,
      taskTitle: t.task_title || t.custom_task_title || 'General Task',
      projectName: t.project_name || undefined,
      timeSpentMinutes: t.time_spent_minutes || 0,
      completionPercentage: t.completion_percentage || 0,
      taskStatus: t.task_status || 'In Progress',
    }));

    const totalTimeSpentMinutes = tasks.reduce((sum, t) => sum + t.timeSpentMinutes, 0);
    const avgCompletionPercentage = tasks.length > 0
      ? Math.round(tasks.reduce((sum, t) => sum + t.completionPercentage, 0) / tasks.length)
      : 0;

    const syncStatus = item.sync?.status === 'processing' ? 'pending' : (item.sync?.status || null);

    return {
      id: item.id,
      userId: item.user_id,
      userName: item.user_name || 'Unknown',
      avatarUrl: undefined,
      role: item.role || 'Employee',
      departmentName: 'General',
      reportDate: item.report_date,
      status: item.status.toLowerCase(),
      submittedAt: item.submitted_at,
      blockers: item.blockers,
      companyRequirements: item.company_requirements,
      tomorrowPlan: item.tomorrow_plan,
      notes: item.notes,
      taskCount: item.task_count || tasks.length,
      avgCompletionPercentage,
      totalTimeSpentMinutes,
      syncStatus,
      syncError: item.sync?.error_message || null,
      tasks,
    };
  });

  // Client-side filtering on joined properties if specified
  if (params.role) {
    reportItems = reportItems.filter(r => r.role.toLowerCase() === params.role!.toLowerCase());
  }
  if (params.syncStatus) {
    reportItems = reportItems.filter(r => r.syncStatus === params.syncStatus);
  }
  if (params.search) {
    const q = params.search.toLowerCase();
    reportItems = reportItems.filter(r =>
      r.userName.toLowerCase().includes(q) ||
      (r.blockers && r.blockers.toLowerCase().includes(q)) ||
      (r.notes && r.notes.toLowerCase().includes(q))
    );
  }

  return {
    reports: reportItems,
    totalCount: reportItems.length,
  };
}

export async function fetchPersonWorkProfile(userId: string) {
  const [profile, reports, attendance, assignedTasks] = await Promise.all([
    userApi.getUserById(userId),
    dailyReportApi.listReports({ user_id: userId, limit: 10 }).catch(() => [] as SafeDailyReportDto[]),
    attendanceApi.getManagementAttendance({ user_id: userId, limit: 14 }).catch(() => [] as SafeManagementAttendanceDto[]),
    taskApi.getTasks({ assignee_id: userId, limit: 10 }).catch(() => [] as SafeTaskDto[]),
  ]);

  return {
    profile: {
      ...profile,
      role: profile.role || 'Team Member',
      departmentName: profile.department || 'General',
    },
    recentReports: reports,
    recentAttendance: attendance,
    assignedTasks: assignedTasks,
  };
}

export async function fetchPersonWorkIntelligence(userId: string, timeRangeDays = 30): Promise<PersonWorkIntelligence> {
  const today = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - timeRangeDays * 86400000).toISOString().split('T')[0];

  const [
    profile,
    allTasks,
    projects,
    reports,
    attendance,
    leaves,
    meetingItems,
  ] = await Promise.all([
    userApi.getUserById(userId),
    taskApi.getTasks({ assignee_id: userId }).catch(() => [] as SafeTaskDto[]),
    projectApi.getProjects().catch(() => [] as SafeProjectDto[]),
    dailyReportApi.listReports({ user_id: userId, from: startDate, limit: 100 }).catch(() => [] as SafeDailyReportDto[]),
    attendanceApi.getManagementAttendance({ user_id: userId, from: startDate, limit: 100 }).catch(() => [] as SafeManagementAttendanceDto[]),
    leaveApi.getLeaveRequests({ user_id: userId, from: startDate, limit: 100 }).catch(() => [] as SafeLeaveRequestDto[]),
    meetingApi.getMeetings().catch(() => [] as SafeMeetingDto[]),
  ]);

  const roleName = profile.role || 'Team Member';

  // Workload calculations
  let activeTasksCount = 0;
  let inProgressCount = 0;
  let reviewCount = 0;
  let needsRevisionCount = 0;
  let onHoldCount = 0;
  let overdueCount = 0;
  let completedCount = 0;

  const activeTasksList: PersonWorkIntelligence['activeTasks'] = [];
  const projectTasksMap = new Map<string, { assigned: number; completed: number; open: number; overdue: number; name: string; status: string }>();

  allTasks.forEach((t: SafeTaskDto) => {
    const isCompleted = t.status === 'Completed';
    const isCancelled = t.status === 'Cancelled';
    const isOverdue = !isCompleted && !isCancelled && !!t.due_date && t.due_date < today;

    if (t.status === 'In Progress') inProgressCount++;
    else if (t.status === 'Review') reviewCount++;
    else if (t.status === 'Needs Revision') needsRevisionCount++;
    else if (t.status === 'On Hold') onHoldCount++;
    else if (t.status === 'Completed') completedCount++;

    if (!isCompleted && !isCancelled) {
      activeTasksCount++;
      activeTasksList.push({
        id: t.id,
        projectId: t.project_id,
        projectName: t.project_name || 'General',
        title: t.title,
        status: t.status,
        priority: t.priority,
        progress: t.progress || 0,
        dueDate: t.due_date,
        isOverdue,
        estimatedHours: Number(t.estimated_hours) || 0,
      });
    }

    if (isOverdue) overdueCount++;

    const pId = t.project_id;
    const existing = projectTasksMap.get(pId) || {
      assigned: 0,
      completed: 0,
      open: 0,
      overdue: 0,
      name: t.project_name || 'Unknown Project',
      status: 'Active',
    };
    existing.assigned++;
    if (isCompleted) existing.completed++;
    else existing.open++;
    if (isOverdue) existing.overdue++;
    projectTasksMap.set(pId, existing);
  });

  // Project contributions
  const projectsList: PersonProjectContribution[] = projects.map((p: SafeProjectDto) => {
    const stats = projectTasksMap.get(p.id);
    const hasTasks = stats && stats.assigned > 0;
    return {
      projectId: p.id,
      projectName: p.name,
      projectStatus: p.status,
      isEnrolledMember: !!hasTasks,
      assignedTasksCount: stats?.assigned || 0,
      completedTasksCount: stats?.completed || 0,
      openTasksCount: stats?.open || 0,
      overdueTasksCount: stats?.overdue || 0,
    };
  });

  // Work History mapping
  const workHistory: WorkHistoryItem[] = [];
  const reportedBlockers: PersonWorkIntelligence['reportedBlockers'] = [];

  reports.forEach((r: SafeDailyReportDto) => {
    if (r.blockers && r.blockers.trim() !== '') {
      reportedBlockers.push({
        reportId: r.id,
        reportDate: r.report_date,
        blockerText: r.blockers,
      });
    }

    if (r.tasks && r.tasks.length > 0) {
      r.tasks.forEach((drt) => {
        workHistory.push({
          id: drt.id,
          reportId: r.id,
          reportDate: r.report_date,
          projectName: drt.project_name || undefined,
          taskTitle: drt.task_title || drt.custom_task_title || 'General Activity',
          timeSpentMinutes: drt.time_spent_minutes || 0,
          completionPercentage: drt.completion_percentage || 0,
          taskStatus: drt.task_status || undefined,
          tomorrowPlan: r.tomorrow_plan || undefined,
          blockers: r.blockers || undefined,
          companyRequirements: r.company_requirements || undefined,
        });
      });
    } else {
      workHistory.push({
        id: r.id,
        reportId: r.id,
        reportDate: r.report_date,
        taskTitle: 'Daily Log Entry',
        timeSpentMinutes: 0,
        completionPercentage: 100,
        taskStatus: r.status,
        tomorrowPlan: r.tomorrow_plan || undefined,
        blockers: r.blockers || undefined,
        companyRequirements: r.company_requirements || undefined,
      });
    }
  });

  // Meetings
  const meetingsList: PersonMeetingItem[] = meetingItems.map((m: SafeMeetingDto) => ({
    id: m.id,
    title: m.title,
    meetingDate: m.meeting_date,
    startTime: m.start_time,
    endTime: m.end_time,
    status: m.status || 'Scheduled',
    meetingType: m.meeting_type || undefined,
  }));

  // Leaves
  const leavesList: PersonLeaveItem[] = leaves.map((l: SafeLeaveRequestDto) => {
    const s = new Date(l.start_date);
    const e = new Date(l.end_date);
    const days = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
    return {
      id: l.id,
      type: l.type,
      startDate: l.start_date,
      endDate: l.end_date,
      status: l.status,
      daysCount: days,
    };
  });

  // Operational Alerts
  const alerts: OperationalAlert[] = [];
  if (overdueCount > 0) {
    alerts.push({
      id: `alert-overdue-${userId}`,
      type: 'overdue_task',
      severity: 'danger',
      title: `${overdueCount} Overdue Task${overdueCount > 1 ? 's' : ''}`,
      description: `Action required on assigned task deadlines past target date.`,
    });
  }

  const urgentTasksCount = activeTasksList.filter(t => t.priority === 'Urgent').length;
  if (urgentTasksCount >= 3) {
    alerts.push({
      id: `alert-urgent-${userId}`,
      type: 'urgent_backlog',
      severity: 'warning',
      title: `High Urgent Workload (${urgentTasksCount} Tasks)`,
      description: `Assigned multiple concurrent urgent priority tasks.`,
    });
  }

  if (reportedBlockers.length > 0) {
    alerts.push({
      id: `alert-blocker-${userId}`,
      type: 'active_blocker',
      severity: 'warning',
      title: `Reported Operational Blocker`,
      description: reportedBlockers[0].blockerText,
    });
  }

  const activeProjectsCount = projectsList.filter(p => p.projectStatus?.toLowerCase() === 'active').length;

  return {
    profile: {
      id: profile.id,
      fullName: profile.full_name,
      email: profile.email,
      avatarUrl: profile.avatar_url || undefined,
      role: roleName,
      departmentName: profile.department || 'General',
      designation: profile.designation || undefined,
      joiningDate: profile.joining_date || undefined,
      isActive: profile.is_active,
    },
    workload: {
      activeTasks: activeTasksCount,
      inProgressTasks: inProgressCount,
      reviewTasks: reviewCount,
      needsRevisionTasks: needsRevisionCount,
      onHoldTasks: onHoldCount,
      overdueTasks: overdueCount,
      completedTasks: completedCount,
      activeProjects: activeProjectsCount,
    },
    activeTasks: activeTasksList,
    projects: projectsList,
    recentReports: reports,
    workHistory,
    attendanceSessions: attendance,
    leaves: leavesList,
    meetings: meetingsList,
    reportedBlockers,
    alerts,
  };
}

export async function fetchTeamWorkloadIntelligence(): Promise<TeamWorkloadMember[]> {
  const today = new Date().toISOString().split('T')[0];

  const [
    users,
    allTasks,
    todayAttendance,
    todayReports,
    todayLeaves,
  ] = await Promise.all([
    userApi.getUsers({ is_active: true, limit: 100 }).catch(() => [] as SafeUserProfile[]),
    taskApi.getTasks({ limit: 100 }).catch(() => [] as SafeTaskDto[]),
    attendanceApi.getManagementAttendance({ date: today, limit: 100 }).catch(() => [] as SafeManagementAttendanceDto[]),
    dailyReportApi.listReports({ date: today, limit: 100 }).catch(() => [] as SafeDailyReportDto[]),
    leaveApi.getLeaveRequests({ status: 'Approved', from: today, to: today, limit: 100 }).catch(() => [] as SafeLeaveRequestDto[]),
  ]);

  const checkedInUserIds = new Set(todayAttendance.filter((a: SafeManagementAttendanceDto) => !!a.clock_in_time).map((a: SafeManagementAttendanceDto) => a.user_id));
  const submittedReportMap = new Map<string, SafeDailyReportDto>();
  todayReports.forEach((r: SafeDailyReportDto) => {
    if (r.status?.toLowerCase() === 'submitted') {
      submittedReportMap.set(r.user_id, r);
    }
  });
  const approvedLeaveUserIds = new Set(todayLeaves.map((l: SafeLeaveRequestDto) => l.user_id));

  // User task stats map
  const taskStatsMap = new Map<string, {
    active: number;
    inProgress: number;
    review: number;
    onHold: number;
    overdue: number;
    completed: number;
    activeProjects: Set<string>;
  }>();

  allTasks.forEach((t: SafeTaskDto) => {
    if (!t.assignee?.id) return;
    const stats = taskStatsMap.get(t.assignee.id) || {
      active: 0,
      inProgress: 0,
      review: 0,
      onHold: 0,
      overdue: 0,
      completed: 0,
      activeProjects: new Set<string>(),
    };

    const isCompleted = t.status === 'Completed';
    const isCancelled = t.status === 'Cancelled';
    const isOverdue = !isCompleted && !isCancelled && !!t.due_date && t.due_date < today;

    if (!isCompleted && !isCancelled) stats.active++;
    if (t.status === 'In Progress') stats.inProgress++;
    else if (t.status === 'Review') stats.review++;
    else if (t.status === 'On Hold') stats.onHold++;
    else if (isCompleted) stats.completed++;

    if (isOverdue) stats.overdue++;

    stats.activeProjects.add(t.project_id);
    taskStatsMap.set(t.assignee.id, stats);
  });

  const result: TeamWorkloadMember[] = [];

  users.forEach((u: SafeUserProfile) => {
    if (u.role === 'Super Admin' || u.role === 'Admin') return;
    if (u.role !== 'Employee' && u.role !== 'Intern') return;

    const isPresent = checkedInUserIds.has(u.id);
    const isSubmitted = submittedReportMap.has(u.id);
    const isApprovedLeave = approvedLeaveUserIds.has(u.id);

    const { status, isPending } = evaluateWorkforceCorrelationStatus(isPresent, isSubmitted, isApprovedLeave);
    const taskStats = taskStatsMap.get(u.id) || {
      active: 0,
      inProgress: 0,
      review: 0,
      onHold: 0,
      overdue: 0,
      completed: 0,
      activeProjects: new Set<string>(),
    };

    const report = submittedReportMap.get(u.id);
    const hasBlocker = !!(report && report.blockers && report.blockers.trim() !== '');

    result.push({
      userId: u.id,
      fullName: u.full_name,
      email: u.email,
      avatarUrl: u.avatar_url || undefined,
      role: u.role,
      departmentName: u.department || 'General',
      designation: u.designation || undefined,
      todayStatus: status,
      activeTasksCount: taskStats.active,
      inProgressCount: taskStats.inProgress,
      reviewCount: taskStats.review,
      onHoldCount: taskStats.onHold,
      overdueCount: taskStats.overdue,
      completedCount: taskStats.completed,
      activeProjectsCount: taskStats.activeProjects.size,
      hasPendingReportToday: isPending,
      hasReportedBlockerToday: hasBlocker,
    });
  });

  return result;
}

export async function fetchWorkforceTrends(
  options: number | { startDate: string; endDate: string } = 14
): Promise<WorkforceTrendsResult> {
  const getLocalDate = (d: Date = new Date()) => {
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
  };

  let startDate: string;
  let endDate: string;

  if (typeof options === 'object' && options.startDate && options.endDate) {
    startDate = options.startDate;
    endDate = options.endDate;
    if (startDate > endDate) {
      const temp = startDate;
      startDate = endDate;
      endDate = temp;
    }
  } else {
    const days = typeof options === 'number' ? options : 14;
    const now = new Date();
    endDate = getLocalDate(now);
    const startObj = new Date(now.getTime() - (days - 1) * 86400000);
    startDate = getLocalDate(startObj);
  }

  const dates: string[] = [];
  const curr = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  while (curr <= end) {
    dates.push(getLocalDate(curr));
    curr.setDate(curr.getDate() + 1);
  }

  const [reports, attendance, allTasks] = await Promise.all([
    dailyReportApi.listReports({ from: startDate, to: endDate, status: 'Submitted', limit: 100 }).catch(() => [] as SafeDailyReportDto[]),
    attendanceApi.getManagementAttendance({ from: startDate, to: endDate, limit: 100 }).catch(() => [] as SafeManagementAttendanceDto[]),
    taskApi.getTasks({ limit: 100 }).catch(() => [] as SafeTaskDto[]),
  ]);

  const reportMap = new Map<string, number>();
  reports.forEach((r: SafeDailyReportDto) => {
    reportMap.set(r.report_date, (reportMap.get(r.report_date) || 0) + 1);
  });

  const attendanceMap = new Map<string, number>();
  attendance.forEach((a: SafeManagementAttendanceDto) => {
    if (a.clock_in_time) {
      attendanceMap.set(a.session_date, (attendanceMap.get(a.session_date) || 0) + 1);
    }
  });

  const taskMap = new Map<string, number>();
  let completedCount = 0;
  let inProgressCount = 0;
  let pendingCount = 0;

  allTasks.forEach((t: SafeTaskDto) => {
    const isCompleted = t.status === 'Completed';
    const isInProgress = t.status === 'In Progress';
    const isPending = t.status === 'Todo' || t.status === 'Review' || t.status === 'Needs Revision' || t.status === 'On Hold';

    if (isCompleted) {
      completedCount++;
      const updatedDate = t.updated_at ? t.updated_at.split('T')[0] : '';
      if (updatedDate >= startDate && updatedDate <= endDate) {
        taskMap.set(updatedDate, (taskMap.get(updatedDate) || 0) + 1);
      }
    } else if (isInProgress) {
      inProgressCount++;
    } else if (isPending) {
      pendingCount++;
    }
  });

  const totalTasks = completedCount + inProgressCount + pendingCount;
  const totalReports = reports.length;
  const totalAttendance = attendance.filter((a: SafeManagementAttendanceDto) => !!a.clock_in_time).length;
  const totalTasksCompletedInRange = Array.from(taskMap.values()).reduce((sum, n) => sum + n, 0);

  const timeline: WorkActivityTrendPoint[] = dates.map(d => ({
    date: d,
    reportsSubmitted: reportMap.get(d) || 0,
    attendanceCheckins: attendanceMap.get(d) || 0,
    tasksCompleted: taskMap.get(d) || 0,
  }));

  return {
    timeline,
    taskDistribution: {
      completed: completedCount,
      inProgress: inProgressCount,
      pending: pendingCount,
      total: totalTasks,
    },
    totalReports,
    totalTasksCompleted: totalTasksCompletedInRange,
    totalAttendance,
  };
}
