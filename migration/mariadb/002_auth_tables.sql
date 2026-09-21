-- ============================================================================
-- SCARO ERP — MariaDB 10.11 Schema DDL Migration
-- Migration: 002_auth_tables.sql
-- Target Database: MariaDB 10.11.18-MariaDB-log
-- Purpose: Secure Node.js Authentication Infrastructure (Additive Only)
-- Engine: InnoDB | Charset: utf8mb4 | Collation: utf8mb4_unicode_ci
-- ============================================================================

-- Disable foreign key checks during migration execution
SET @OLD_FOREIGN_KEY_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------------------------
-- 1. Table: user_auth
-- Purpose: User authentication credentials, password hash, and account lockout tracking
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_auth` (
    `id` CHAR(36) NOT NULL DEFAULT (UUID()),
    `user_id` CHAR(36) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `password_changed_at` DATETIME(6) NULL,
    `failed_login_attempts` INT NOT NULL DEFAULT 0,
    `locked_until` DATETIME(6) NULL,
    `last_login_at` DATETIME(6) NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`id`),
    UNIQUE KEY `user_auth_user_id_key` (`user_id`),
    INDEX `idx_user_auth_user_id` (`user_id`),
    CONSTRAINT `fk_user_auth_user` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. Table: auth_sessions
-- Purpose: Server-side hashed refresh token sessions and revocation tracking
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `auth_sessions` (
    `id` CHAR(36) NOT NULL DEFAULT (UUID()),
    `user_id` CHAR(36) NOT NULL,
    `refresh_token_hash` VARCHAR(64) NOT NULL,
    `expires_at` DATETIME(6) NOT NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `last_used_at` DATETIME(6) NULL,
    `revoked_at` DATETIME(6) NULL,
    `user_agent` VARCHAR(500) NULL,
    `ip_address` VARCHAR(45) NULL,
    PRIMARY KEY (`id`),
    INDEX `idx_auth_sessions_user_id` (`user_id`),
    INDEX `idx_auth_sessions_token_hash` (`refresh_token_hash`),
    INDEX `idx_auth_sessions_expires_at` (`expires_at`),
    CONSTRAINT `fk_auth_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. Table: auth_init_tokens
-- Purpose: Single-use, time-limited initialization tokens for initial password setup
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `auth_init_tokens` (
    `id` CHAR(36) NOT NULL DEFAULT (UUID()),
    `user_id` CHAR(36) NOT NULL,
    `token_hash` VARCHAR(64) NOT NULL,
    `expires_at` DATETIME(6) NOT NULL,
    `used_at` DATETIME(6) NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`id`),
    INDEX `idx_auth_init_user_id` (`user_id`),
    INDEX `idx_auth_init_token_hash` (`token_hash`),
    INDEX `idx_auth_init_expires_at` (`expires_at`),
    CONSTRAINT `fk_auth_init_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Restore foreign key checks configuration
SET FOREIGN_KEY_CHECKS = @OLD_FOREIGN_KEY_CHECKS;
