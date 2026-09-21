-- ============================================================================
-- SCARO ERP — MariaDB 10.11 Schema DDL Migration
-- Migration: 001_create_schema.sql
-- Target Database: MariaDB 10.11.18-MariaDB-log
-- Source: Supabase / PostgreSQL Migrations 001 through 026
-- Engine: InnoDB | Charset: utf8mb4 | Collation: utf8mb4_unicode_ci
-- ============================================================================

-- Disable foreign key checks during schema creation to ensure deterministic table setup
SET @OLD_FOREIGN_KEY_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------------------------
-- 1. Table: departments
-- Purpose: Organization divisions and department hierarchy
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `departments` (
    `id` CHAR(36) NOT NULL DEFAULT (UUID()),
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `manager_id` CHAR(36) NULL,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`id`),
    UNIQUE KEY `departments_name_key` (`name`),
    CONSTRAINT `fk_department_manager` FOREIGN KEY (`manager_id`) REFERENCES `profiles` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. Table: roles
-- Purpose: RBAC role definitions (Super Admin, Admin, Employee, Intern)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `roles` (
    `id` CHAR(36) NOT NULL DEFAULT (UUID()),
    `name` VARCHAR(50) NOT NULL,
    `description` TEXT NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`id`),
    UNIQUE KEY `roles_name_key` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. Table: permissions
-- Purpose: Granular RBAC permission registry
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `permissions` (
    `id` CHAR(36) NOT NULL DEFAULT (UUID()),
    `name` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`id`),
    UNIQUE KEY `permissions_name_key` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. Table: role_permissions
-- Purpose: Mapping table linking roles to granular permissions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `role_permissions` (
    `role_id` CHAR(36) NOT NULL,
    `permission_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`role_id`, `permission_id`),
    INDEX `idx_role_permissions_role_id` (`role_id`),
    CONSTRAINT `fk_role_permissions_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_role_permissions_permission` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. Table: profiles
-- Purpose: Core user identity and workforce attributes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `profiles` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `full_name` VARCHAR(255) NOT NULL,
    `avatar_url` TEXT NULL,
    `phone` VARCHAR(50) NULL,
    `department_id` CHAR(36) NULL,
    `designation` VARCHAR(255) NULL,
    `joining_date` DATE NULL,
    `employment_status` ENUM('Employee', 'Intern') NOT NULL DEFAULT 'Employee',
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `linkedin` VARCHAR(255) NULL,
    `github` VARCHAR(255) NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`id`),
    UNIQUE KEY `profiles_email_key` (`email`),
    INDEX `idx_profiles_department_id` (`department_id`),
    INDEX `idx_profiles_email` (`email`),
    CONSTRAINT `fk_profiles_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 6. Table: user_roles
-- Purpose: User-to-role assignment table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_roles` (
    `user_id` CHAR(36) NOT NULL,
    `role_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`user_id`, `role_id`),
    INDEX `idx_user_roles_user_id` (`user_id`),
    CONSTRAINT `fk_user_roles_user` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_user_roles_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 7. Table: projects
-- Purpose: Project portfolio, scope, dates, and ownership
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `projects` (
    `id` CHAR(36) NOT NULL DEFAULT (UUID()),
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'Active',
    `start_date` DATE NULL,
    `end_date` DATE NULL,
    `owner_id` CHAR(36) NULL,
    `created_by` CHAR(36) NOT NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`id`),
    INDEX `idx_projects_status` (`status`),
    INDEX `idx_projects_owner_id` (`owner_id`),
    INDEX `idx_projects_created_by` (`created_by`),
    CONSTRAINT `fk_projects_owner` FOREIGN KEY (`owner_id`) REFERENCES `profiles` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_projects_creator` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 8. Table: project_members
-- Purpose: Project team rosters and user assignments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `project_members` (
    `project_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`project_id`, `user_id`),
    INDEX `idx_project_members_user_id` (`user_id`),
    CONSTRAINT `fk_project_members_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_project_members_user` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 9. Table: tasks
-- Purpose: Operational tasks, assignments, priority, progress, deadlines
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tasks` (
    `id` CHAR(36) NOT NULL DEFAULT (UUID()),
    `project_id` CHAR(36) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `assignee_id` CHAR(36) NULL,
    `reporter_id` CHAR(36) NOT NULL,
    `priority` ENUM('Low', 'Medium', 'High', 'Urgent') NOT NULL DEFAULT 'Medium',
    `status` ENUM('Todo', 'In Progress', 'Review', 'Needs Revision', 'Completed', 'On Hold', 'Cancelled') NOT NULL DEFAULT 'Todo',
    `progress` INT NOT NULL DEFAULT 0,
    `estimated_hours` DECIMAL(6,2) NOT NULL DEFAULT 0.00,
    `due_date` DATE NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`id`),
    CONSTRAINT `chk_tasks_progress` CHECK (`progress` >= 0 AND `progress` <= 100),
    CONSTRAINT `chk_tasks_estimated_hours` CHECK (`estimated_hours` >= 0.00),
    INDEX `idx_tasks_project_id` (`project_id`),
    INDEX `idx_tasks_assignee_id` (`assignee_id`),
    INDEX `idx_tasks_status` (`status`),
    INDEX `idx_tasks_due_date` (`due_date`),
    INDEX `idx_tasks_project_status` (`project_id`, `status`),
    INDEX `idx_tasks_assignee_status` (`assignee_id`, `status`),
    INDEX `idx_tasks_reporter_id` (`reporter_id`),
    CONSTRAINT `fk_tasks_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_tasks_assignee` FOREIGN KEY (`assignee_id`) REFERENCES `profiles` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_tasks_reporter` FOREIGN KEY (`reporter_id`) REFERENCES `profiles` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 10. Table: task_comments
-- Purpose: Task discussions and feedback comments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `task_comments` (
    `id` CHAR(36) NOT NULL DEFAULT (UUID()),
    `task_id` CHAR(36) NOT NULL,
    `author_id` CHAR(36) NOT NULL,
    `content` TEXT NOT NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`id`),
    INDEX `idx_task_comments_task_id` (`task_id`),
    INDEX `idx_task_comments_author_id` (`author_id`),
    CONSTRAINT `fk_task_comments_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_task_comments_author` FOREIGN KEY (`author_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 11. Table: task_attachments
-- Purpose: Task file attachment metadata
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `task_attachments` (
    `id` CHAR(36) NOT NULL DEFAULT (UUID()),
    `task_id` CHAR(36) NOT NULL,
    `uploaded_by` CHAR(36) NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `storage_path` TEXT NOT NULL,
    `file_size` BIGINT NOT NULL,
    `file_type` VARCHAR(100) NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`id`),
    INDEX `idx_task_attachments_task_id` (`task_id`),
    INDEX `idx_task_attachments_uploaded_by` (`uploaded_by`),
    CONSTRAINT `fk_task_attachments_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_task_attachments_uploader` FOREIGN KEY (`uploaded_by`) REFERENCES `profiles` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 12. Table: attendance_sessions
-- Purpose: Workday attendance check-ins, check-outs, and session records
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `attendance_sessions` (
    `id` CHAR(36) NOT NULL DEFAULT (UUID()),
    `user_id` CHAR(36) NOT NULL,
    `session_date` DATE NOT NULL,
    `clock_in_time` DATETIME(6) NOT NULL,
    `clock_out_time` DATETIME(6) NULL,
    `status` ENUM('Present', 'Absent', 'Half Day') NOT NULL DEFAULT 'Present',
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`id`),
    INDEX `idx_attendance_sessions_user_id` (`user_id`),
    INDEX `idx_attendance_sessions_session_date` (`session_date`),
    CONSTRAINT `fk_attendance_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 13. Table: meetings
-- Purpose: Scheduled internal and external sync meetings
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `meetings` (
    `id` CHAR(36) NOT NULL DEFAULT (UUID()),
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `organizer_id` CHAR(36) NOT NULL,
    `meeting_date` DATE NOT NULL,
    `start_time` TIME NOT NULL,
    `end_time` TIME NOT NULL,
    `meeting_type` VARCHAR(100) NULL,
    `external_meeting_url` TEXT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'Scheduled',
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`id`),
    INDEX `idx_meetings_meeting_date` (`meeting_date`),
    INDEX `idx_meetings_organizer_id` (`organizer_id`),
    CONSTRAINT `fk_meetings_organizer` FOREIGN KEY (`organizer_id`) REFERENCES `profiles` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 14. Table: meeting_participants
-- Purpose: Enrolled meeting invitees and attendees
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `meeting_participants` (
    `meeting_id` CHAR(36) NOT NULL,
    `participant_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`meeting_id`, `participant_id`),
    INDEX `idx_meeting_participants_participant_id` (`participant_id`),
    CONSTRAINT `fk_meeting_participants_meeting` FOREIGN KEY (`meeting_id`) REFERENCES `meetings` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_meeting_participants_profile` FOREIGN KEY (`participant_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 15. Table: meeting_attendance
-- Purpose: Meeting join/leave timestamps, delay tracking, attendance status
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `meeting_attendance` (
    `meeting_id` CHAR(36) NOT NULL,
    `participant_id` CHAR(36) NOT NULL,
    `joined_at` DATETIME(6) NULL,
    `left_at` DATETIME(6) NULL,
    `status` ENUM('Present', 'Late', 'Absent', 'Excused') NULL,
    `delay_minutes` INT NOT NULL DEFAULT 0,
    PRIMARY KEY (`meeting_id`, `participant_id`),
    CONSTRAINT `chk_meeting_attendance_delay` CHECK (`delay_minutes` >= 0),
    CONSTRAINT `fk_meeting_attendance_meeting` FOREIGN KEY (`meeting_id`) REFERENCES `meetings` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_meeting_attendance_profile` FOREIGN KEY (`participant_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 16. Table: daily_reports
-- Purpose: Daily workforce reports, plans, blockers, and notes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `daily_reports` (
    `id` CHAR(36) NOT NULL DEFAULT (UUID()),
    `user_id` CHAR(36) NOT NULL,
    `report_date` DATE NOT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'Draft',
    `tomorrow_plan` TEXT NULL,
    `blockers` TEXT NULL,
    `company_requirements` TEXT NULL,
    `notes` TEXT NULL,
    `submitted_at` DATETIME(6) NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`id`),
    UNIQUE KEY `daily_reports_user_report_date_key` (`user_id`, `report_date`),
    INDEX `idx_daily_reports_user_id` (`user_id`),
    INDEX `idx_daily_reports_report_date` (`report_date`),
    CONSTRAINT `fk_daily_reports_user` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 17. Table: daily_report_tasks
-- Purpose: Granular task-by-task line items within daily reports
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `daily_report_tasks` (
    `id` CHAR(36) NOT NULL DEFAULT (UUID()),
    `report_id` CHAR(36) NOT NULL,
    `task_id` CHAR(36) NULL,
    `time_spent_minutes` INT NULL,
    `completion_percentage` INT NULL,
    `task_status` ENUM('Todo', 'In Progress', 'Review', 'Needs Revision', 'Completed', 'On Hold', 'Cancelled') NULL,
    `custom_task_title` VARCHAR(255) NULL,
    PRIMARY KEY (`id`),
    CONSTRAINT `chk_daily_report_tasks_time` CHECK (`time_spent_minutes` IS NULL OR `time_spent_minutes` >= 0),
    CONSTRAINT `chk_daily_report_tasks_completion` CHECK (`completion_percentage` IS NULL OR (`completion_percentage` >= 0 AND `completion_percentage` <= 100)),
    INDEX `idx_daily_report_tasks_report_id` (`report_id`),
    INDEX `idx_daily_report_tasks_task_id` (`task_id`),
    CONSTRAINT `fk_daily_report_tasks_report` FOREIGN KEY (`report_id`) REFERENCES `daily_reports` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_daily_report_tasks_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 18. Table: messages
-- Purpose: 1-to-1 direct messaging and contextual task communication
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `messages` (
    `id` CHAR(36) NOT NULL DEFAULT (UUID()),
    `sender_id` CHAR(36) NOT NULL,
    `recipient_id` CHAR(36) NULL,
    `task_id` CHAR(36) NULL,
    `content` TEXT NOT NULL,
    `is_read` TINYINT(1) NOT NULL DEFAULT 0,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`id`),
    CONSTRAINT `messages_target_check` CHECK (`recipient_id` IS NOT NULL OR `task_id` IS NOT NULL),
    INDEX `idx_messages_sender_id` (`sender_id`),
    INDEX `idx_messages_recipient_id` (`recipient_id`),
    INDEX `idx_messages_created_at` (`created_at`),
    INDEX `idx_messages_task_id` (`task_id`),
    CONSTRAINT `fk_messages_sender` FOREIGN KEY (`sender_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_messages_recipient` FOREIGN KEY (`recipient_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_messages_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 19. Table: notifications
-- Purpose: User in-app notifications and alert center
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notifications` (
    `id` CHAR(36) NOT NULL DEFAULT (UUID()),
    `user_id` CHAR(36) NOT NULL,
    `type` VARCHAR(100) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `message` TEXT NOT NULL,
    `reference_id` CHAR(36) NULL,
    `reference_type` VARCHAR(100) NULL,
    `is_read` TINYINT(1) NOT NULL DEFAULT 0,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`id`),
    INDEX `idx_notifications_user_id` (`user_id`),
    INDEX `idx_notifications_is_read` (`is_read`),
    INDEX `idx_notifications_created_at` (`created_at`),
    CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 20. Table: leave_requests
-- Purpose: Leave, permission, and work-from-home requests
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `leave_requests` (
    `id` CHAR(36) NOT NULL DEFAULT (UUID()),
    `user_id` CHAR(36) NOT NULL,
    `type` ENUM('Leave', 'Permission', 'Work From Home') NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `reason` TEXT NOT NULL,
    `status` ENUM('Pending', 'Approved', 'Rejected', 'Cancelled') NOT NULL DEFAULT 'Pending',
    `rejection_reason` TEXT NULL,
    `reviewed_by` CHAR(36) NULL,
    `reviewed_at` DATETIME(6) NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`id`),
    CONSTRAINT `valid_dates` CHECK (`end_date` >= `start_date`),
    CONSTRAINT `check_rejection_reason_status` CHECK (`status` = 'Rejected' OR `rejection_reason` IS NULL),
    INDEX `idx_leave_requests_user_id` (`user_id`),
    INDEX `idx_leave_requests_status` (`status`),
    INDEX `idx_leave_requests_dates` (`start_date`, `end_date`),
    INDEX `idx_leave_requests_reviewed_by` (`reviewed_by`),
    CONSTRAINT `fk_leave_requests_user` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_leave_requests_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 21. Table: announcements
-- Purpose: Organization broadcasts and targeted announcements
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `announcements` (
    `id` CHAR(36) NOT NULL DEFAULT (UUID()),
    `author_id` CHAR(36) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `content` TEXT NOT NULL,
    `priority` VARCHAR(50) NOT NULL DEFAULT 'Normal',
    `audience` ENUM('Everyone', 'Employees', 'Interns', 'Department') NOT NULL DEFAULT 'Everyone',
    `department_id` CHAR(36) NULL,
    `published_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`id`),
    INDEX `idx_announcements_audience` (`audience`),
    INDEX `idx_announcements_published_at` (`published_at`),
    INDEX `idx_announcements_author_id` (`author_id`),
    INDEX `idx_announcements_department_id` (`department_id`),
    CONSTRAINT `fk_announcements_author` FOREIGN KEY (`author_id`) REFERENCES `profiles` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_announcements_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 22. Table: audit_logs
-- Purpose: System mutation audit trail with old/new state snapshots
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `audit_logs` (
    `id` CHAR(36) NOT NULL DEFAULT (UUID()),
    `actor_id` CHAR(36) NULL,
    `action` VARCHAR(100) NOT NULL,
    `table_name` VARCHAR(100) NOT NULL,
    `record_id` CHAR(36) NOT NULL,
    `old_value` JSON NULL,
    `new_value` JSON NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`id`),
    INDEX `idx_audit_logs_actor_id` (`actor_id`),
    INDEX `idx_audit_logs_table_name` (`table_name`),
    INDEX `idx_audit_logs_created_at` (`created_at`),
    INDEX `idx_audit_logs_record_id` (`record_id`),
    CONSTRAINT `fk_audit_logs_actor` FOREIGN KEY (`actor_id`) REFERENCES `profiles` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 23. Table: company_settings
-- Purpose: Organization working days, work hours, and singleton system config
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `company_settings` (
    `id` CHAR(36) NOT NULL DEFAULT (UUID()),
    `company_name` VARCHAR(255) NOT NULL DEFAULT 'SCARO',
    `timezone` VARCHAR(100) NOT NULL DEFAULT 'Asia/Kolkata',
    `working_days` JSON NOT NULL,
    `work_start_time` TIME NOT NULL DEFAULT '09:00:00',
    `work_end_time` TIME NOT NULL DEFAULT '17:00:00',
    `daily_report_reminder_time` TIME NOT NULL DEFAULT '16:30:00',
    `late_threshold_minutes` INT NOT NULL DEFAULT 15,
    `is_singleton` TINYINT(1) NOT NULL DEFAULT 1,
    `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`id`),
    CONSTRAINT `company_settings_is_singleton_check` CHECK (`is_singleton` = 1),
    UNIQUE KEY `company_settings_singleton_idx` (`is_singleton`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 24. Table: daily_report_attachments
-- Purpose: Daily evidence uploads and attachment metadata
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `daily_report_attachments` (
    `id` CHAR(36) NOT NULL DEFAULT (UUID()),
    `report_id` CHAR(36) NOT NULL,
    `uploaded_by` CHAR(36) NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `storage_path` TEXT NOT NULL,
    `file_size` BIGINT NULL,
    `file_type` VARCHAR(100) NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`id`),
    INDEX `idx_daily_report_attachments_report_id` (`report_id`),
    INDEX `idx_daily_report_attachments_uploaded_by` (`uploaded_by`),
    CONSTRAINT `fk_daily_report_attachments_report` FOREIGN KEY (`report_id`) REFERENCES `daily_reports` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_daily_report_attachments_uploader` FOREIGN KEY (`uploaded_by`) REFERENCES `profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 25. Table: daily_report_sync
-- Purpose: Google Sheets synchronization queue, state machine, and retry status
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `daily_report_sync` (
    `report_id` CHAR(36) NOT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'pending',
    `external_row_reference` INT NULL,
    `attempt_count` INT NOT NULL DEFAULT 0,
    `error_message` TEXT NULL,
    `last_attempt_at` DATETIME(6) NULL,
    `synced_at` DATETIME(6) NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`report_id`),
    CONSTRAINT `chk_daily_report_sync_status` CHECK (`status` IN ('pending', 'processing', 'synced', 'failed', 'permanently_failed')),
    CONSTRAINT `fk_daily_report_sync_report` FOREIGN KEY (`report_id`) REFERENCES `daily_reports` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Restore foreign key checks configuration
SET FOREIGN_KEY_CHECKS = @OLD_FOREIGN_KEY_CHECKS;
