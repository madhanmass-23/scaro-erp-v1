# SCARO ERP — Database Schema Reference (MariaDB 10.11+)

These SQL migration files define the complete, validated schema for SCARO ERP on MariaDB:

1. `001_create_schema.sql` — Core application schema (28 tables: profiles, projects, tasks, comments, attachments, attendance, daily reports, notifications, etc.).
2. `002_auth_tables.sql` — Authentication credentials, user accounts, and session tokens.

## Usage
These files are for reference and initial environment provisioning. If the production database (e.g., ServerByte MariaDB) is already initialized, do NOT re-run these migrations.
