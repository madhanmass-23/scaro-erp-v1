import { UserRoleInfo, rbacService } from "./rbac.service.js";

export class AuthorizationService {
  /**
   * Evaluates directional messaging permissions between user roles.
   * Rules:
   *  - Employee <-> Employee: ALLOWED
   *  - Employee <-> Intern: ALLOWED
   *  - Intern <-> Intern: ALLOWED
   *  - Admin / Super Admin -> Intern: ALLOWED
   *  - Intern -> Admin: BLOCKED (403)
   *  - Intern -> Super Admin: BLOCKED (403)
   *  - Admin -> Admin / Employee / Super Admin: ALLOWED
   *  - Super Admin -> Any: ALLOWED
   */
  canSendMessage(senderRole: string, recipientRole: string): { allowed: boolean; reason?: string } {
    if (senderRole === "Super Admin" || senderRole === "Admin" || senderRole === "Employee") {
      return { allowed: true };
    }

    if (senderRole === "Intern") {
      if (recipientRole === "Admin" || recipientRole === "Super Admin") {
        return {
          allowed: false,
          reason: "Interns are not permitted to initiate messages to Management (Admin / Super Admin).",
        };
      }
      return { allowed: true };
    }

    return { allowed: false, reason: "Unauthorized message sender role" };
  }

  /**
   * Evaluates task creation and assignment rules.
   * Rules:
   *  - Employee / Intern can create tasks assigned to themselves.
   *  - Employee / Intern cannot assign tasks to other arbitrary users without 'tasks.create' / 'tasks.manage' permission.
   *  - Admin / Super Admin can assign tasks to any active user.
   */
  canCreateTask(
    userAuth: UserRoleInfo,
    assigneeId?: string | null
  ): { allowed: boolean; reason?: string } {
    if (userAuth.isSuperAdmin || rbacService.hasPermission(userAuth, "tasks.create")) {
      return { allowed: true };
    }

    // Normal Employee / Intern can create tasks assigned to themselves
    if (!assigneeId || assigneeId === userAuth.userId) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: "You do not have permission to assign tasks to other users.",
    };
  }

  /**
   * Evaluates task update and modification rules.
   */
  canUpdateTask(
    userAuth: UserRoleInfo,
    taskReporterId: string,
    taskAssigneeId?: string | null
  ): { allowed: boolean; reason?: string } {
    if (
      userAuth.isSuperAdmin ||
      rbacService.hasPermission(userAuth, "tasks.manage") ||
      rbacService.hasPermission(userAuth, "tasks.update")
    ) {
      return { allowed: true };
    }

    // User is the assignee or reporter of the task
    if (taskAssigneeId === userAuth.userId || taskReporterId === userAuth.userId) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: "You are not authorized to update this task.",
    };
  }

  /**
   * Evaluates attendance session management rules.
   * Rules:
   *  - Users can manage their own work sessions (clock in / out).
   *  - Modifying another user's attendance requires 'attendance.manage' permission.
   */
  canManageAttendance(
    userAuth: UserRoleInfo,
    targetUserId: string
  ): { allowed: boolean; reason?: string } {
    if (targetUserId === userAuth.userId) {
      return { allowed: true };
    }

    if (userAuth.isSuperAdmin || rbacService.hasPermission(userAuth, "attendance.manage")) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: "You cannot modify another user's attendance records.",
    };
  }

  /**
   * Evaluates daily report access and modification rules.
   */
  canAccessDailyReport(
    userAuth: UserRoleInfo,
    reportOwnerId: string
  ): { allowed: boolean; reason?: string } {
    if (reportOwnerId === userAuth.userId) {
      return { allowed: true };
    }

    if (
      userAuth.isSuperAdmin ||
      rbacService.hasPermission(userAuth, "reports.view") ||
      rbacService.hasPermission(userAuth, "reports.manage")
    ) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: "You do not have permission to view other users' daily reports.",
    };
  }

  /**
   * Evaluates leave request review rules.
   * Rules:
   *  - Management (Super Admin, Admin, or users with 'leave.manage') can approve/reject leave requests.
   *  - Normal Employee / Intern cannot approve their own leave request under any circumstances.
   */
  canReviewLeaveRequest(
    userAuth: UserRoleInfo,
    requesterId: string
  ): { allowed: boolean; reason?: string } {
    const hasLeaveManage =
      userAuth.isSuperAdmin ||
      userAuth.isAdmin ||
      rbacService.hasPermission(userAuth, "leave.manage");

    if (!hasLeaveManage) {
      return {
        allowed: false,
        reason: "You do not have permission to review leave requests.",
      };
    }

    // Self-approval protection: Even if an employee/intern has special privileges, they cannot approve their own leave
    if (requesterId === userAuth.userId && !userAuth.isSuperAdmin) {
      return {
        allowed: false,
        reason: "You cannot approve or reject your own leave request.",
      };
    }

    return { allowed: true };
  }

  /**
   * Evaluates meeting access rules.
   * Rules:
   *  - Management (Super Admin, Admin, or users with 'meetings.view' / 'meetings.manage') can view any meeting.
   *  - Normal users can view meetings where they are the organizer or an enrolled participant.
   */
  canAccessMeeting(
    userAuth: UserRoleInfo,
    organizerId: string,
    isParticipant: boolean
  ): { allowed: boolean; reason?: string } {
    if (
      userAuth.isSuperAdmin ||
      userAuth.isAdmin ||
      rbacService.hasPermission(userAuth, "meetings.view") ||
      rbacService.hasPermission(userAuth, "meetings.manage")
    ) {
      return { allowed: true };
    }

    if (organizerId === userAuth.userId || isParticipant) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: "You are not authorized to access this meeting.",
    };
  }

  /**
   * Evaluates meeting management rules (updating meeting details, adding/removing participants).
   * Rules:
   *  - Meeting organizer or Management (Super Admin, Admin, or users with 'meetings.manage') can manage the meeting.
   */
  canManageMeeting(
    userAuth: UserRoleInfo,
    organizerId: string
  ): { allowed: boolean; reason?: string } {
    if (
      userAuth.isSuperAdmin ||
      userAuth.isAdmin ||
      rbacService.hasPermission(userAuth, "meetings.manage")
    ) {
      return { allowed: true };
    }

    if (organizerId === userAuth.userId) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: "Only the meeting organizer or management can modify this meeting.",
    };
  }

  /**
   * Evaluates meeting attendance marking/updating rules.
   * Rules:
   *  - Users can mark/update their own attendance if they are enrolled as a participant.
   *  - Meeting organizer or Management can record/update attendance for any enrolled participant.
   */
  canManageMeetingAttendance(
    userAuth: UserRoleInfo,
    organizerId: string,
    targetUserId: string
  ): { allowed: boolean; reason?: string } {
    if (
      userAuth.isSuperAdmin ||
      userAuth.isAdmin ||
      rbacService.hasPermission(userAuth, "meetings.manage")
    ) {
      return { allowed: true };
    }

    if (organizerId === userAuth.userId) {
      return { allowed: true };
    }

    if (targetUserId === userAuth.userId) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: "You cannot modify another user's meeting attendance.",
    };
  }

  /**
   * Evaluates profile field update permissions.
   * Rules:
   *  - Users can update their own permitted personal fields: full_name, phone, avatar_url, linkedin, github.
   *  - Users CANNOT modify system/locked fields: email, is_active, department_id, designation, employment_status, role.
   *  - Managing other users' profiles or locked fields requires 'users.manage' or Super Admin.
   */
  canUpdateProfileFields(
    userAuth: UserRoleInfo,
    targetUserId: string,
    fieldsToUpdate: string[]
  ): { allowed: boolean; reason?: string } {
    const isSelf = targetUserId === userAuth.userId;
    const hasUserManage =
      userAuth.isSuperAdmin || rbacService.hasPermission(userAuth, "users.manage");

    if (!isSelf && !hasUserManage) {
      return {
        allowed: false,
        reason: "You cannot modify another user's profile.",
      };
    }

    if (isSelf && !hasUserManage) {
      const allowedSelfFields = ["full_name", "phone", "avatar_url", "linkedin", "github"];
      const forbiddenFields = fieldsToUpdate.filter((f) => !allowedSelfFields.includes(f));

      if (forbiddenFields.length > 0) {
        return {
          allowed: false,
          reason: `You cannot modify restricted system fields: ${forbiddenFields.join(", ")}`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Evaluates message viewing permission.
   * Rules:
   *  - Caller must be either the sender or the recipient of the message.
   */
  canViewMessage(
    userAuth: UserRoleInfo,
    senderId: string,
    recipientId: string | null
  ): { allowed: boolean; reason?: string } {
    if (senderId === userAuth.userId || recipientId === userAuth.userId) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: "You are not authorized to view this message.",
    };
  }

  /**
   * Evaluates announcement creation permission.
   * Rules:
   *  - Management (Super Admin, Admin, or users with 'announcements.manage') can create announcements.
   *  - Employees and Interns are strictly BLOCKED.
   */
  canCreateAnnouncement(userAuth: UserRoleInfo): { allowed: boolean; reason?: string } {
    if (
      userAuth.isSuperAdmin ||
      userAuth.isAdmin ||
      rbacService.hasPermission(userAuth, "announcements.manage")
    ) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: "Only management users can create announcements.",
    };
  }

  /**
   * Evaluates announcement update/manage permission.
   * Rules:
   *  - Super Admin, Admin, or the original author can manage the announcement.
   */
  canManageAnnouncement(
    userAuth: UserRoleInfo,
    authorId: string
  ): { allowed: boolean; reason?: string } {
    if (
      userAuth.isSuperAdmin ||
      userAuth.isAdmin ||
      rbacService.hasPermission(userAuth, "announcements.manage")
    ) {
      return { allowed: true };
    }

    if (authorId === userAuth.userId) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: "You do not have permission to manage this announcement.",
    };
  }

  /**
   * Evaluates announcement audience visibility.
   * Rules:
   *  - Super Admin and Admin can view all announcements regardless of audience.
   *  - 'Everyone': visible to all active users.
   *  - 'Employees': visible to Employees.
   *  - 'Interns': visible to Interns.
   *  - 'Department': visible to users in matching department_id.
   */
  canViewAnnouncement(
    userAuth: UserRoleInfo,
    audience: string,
    announcementDeptId?: string | null,
    userDeptId?: string | null
  ): { allowed: boolean; reason?: string } {
    if (userAuth.isSuperAdmin || userAuth.isAdmin) {
      return { allowed: true };
    }

    if (audience === "Everyone") {
      return { allowed: true };
    }

    if (audience === "Employees" && userAuth.isEmployee) {
      return { allowed: true };
    }

    if (audience === "Interns" && userAuth.isIntern) {
      return { allowed: true };
    }

    if (audience === "Department" && announcementDeptId && userDeptId && announcementDeptId === userDeptId) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: "You are not in the target audience for this announcement.",
    };
  }

  /**
   * Evaluates company settings view permission.
   * All active authenticated users can view company work hours and settings.
   */
  canViewCompanySettings(userAuth: UserRoleInfo): { allowed: boolean; reason?: string } {
    if (userAuth && userAuth.userId) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: "Authentication required to view company settings.",
    };
  }

  /**
   * Evaluates company settings modification permission.
   * Super Admin, Admin, or users with 'settings.manage' permission can update company settings.
   */
  canManageCompanySettings(userAuth: UserRoleInfo): { allowed: boolean; reason?: string } {
    if (
      userAuth.isSuperAdmin ||
      userAuth.isAdmin ||
      rbacService.hasPermission(userAuth, "settings.manage")
    ) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: "Only management can modify company settings.",
    };
  }

  /**
   * Evaluates departments view permission.
   * All active authenticated users can view the department directory.
   */
  canViewDepartments(userAuth: UserRoleInfo): { allowed: boolean; reason?: string } {
    if (userAuth && userAuth.userId) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: "Authentication required to view departments.",
    };
  }

  /**
   * Evaluates department management (creation, update) permission.
   * Restricted to Super Admin, Admin, or users with 'departments.manage' / 'users.manage'.
   */
  canManageDepartments(userAuth: UserRoleInfo): { allowed: boolean; reason?: string } {
    if (
      userAuth.isSuperAdmin ||
      userAuth.isAdmin ||
      rbacService.hasPermission(userAuth, "departments.manage") ||
      rbacService.hasPermission(userAuth, "users.manage")
    ) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: "Only management can create or update departments.",
    };
  }

  /**
   * Evaluates audit logs view permission.
   * Restricted strictly to Super Admin, Admin, or users with 'audit.view' permission.
   * Employees and Interns are strictly BLOCKED.
   */
  canViewAuditLogs(userAuth: UserRoleInfo): { allowed: boolean; reason?: string } {
    if (
      userAuth.isSuperAdmin ||
      userAuth.isAdmin ||
      rbacService.hasPermission(userAuth, "audit.view")
    ) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: "Access denied: You do not have permission to view system audit logs.",
    };
  }

  /**
   * Evaluates if caller is entitled to workforce-wide management dashboard metrics.
   */
  canViewManagementDashboard(userAuth: UserRoleInfo): boolean {
    return userAuth.isSuperAdmin || userAuth.isAdmin || rbacService.hasPermission(userAuth, "reports.view");
  }
}

export const authorizationService = new AuthorizationService();


