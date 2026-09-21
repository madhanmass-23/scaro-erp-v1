# SCARO ERP — Version 1.0

SCARO ERP is a high-performance Enterprise Resource Planning platform engineered for modern organizations. Built on **React 19**, **Vite**, **TypeScript**, **Node.js/Express**, and **MariaDB 10.11+**.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Client (SPA)                       │
│             React 19 + TypeScript + Vite                │
│                 (Same-origin /api/v1)                   │
└────────────────────────────┬────────────────────────────┘
                             │ HTTP / JSON
┌────────────────────────────▼────────────────────────────┐
│                  Backend Server (API)                   │
│             Node.js 20+ / Express ESM                   │
│            Serves /api/v1 & static dist/                │
└──────────────┬───────────────────────────┬──────────────┘
               │ mysql2/promise            │ Local Filesystem
┌──────────────▼─────────────┐ ┌───────────▼──────────────┐
│     MariaDB 10.11+         │ │      Local Storage       │
│  (ServerByte / Managed DB) │ │ (server/storage/avatars) │
└────────────────────────────┘ └──────────────────────────┘
```

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- Node.js 20+ LTS
- npm 10+
- MariaDB 10.11+ or compatible MySQL server

### 2. Install Dependencies
```bash
npm install
```
*(This automatically installs root and server dependencies via postinstall).*

### 3. Environment Configuration
Copy the environment template files and fill in your database credentials:
```bash
# Backend environment
cp server/.env.example server/.env.local
```

### 4. Build Application
```bash
# Builds both frontend (dist/) and backend (server/dist/)
npm run build
```

### 5. Run Server
```bash
# Starts the production server serving API and SPA frontend
npm run start
```
Access the application at `http://localhost:4000`

---

## 📦 Deployment to Railway

1. Push this repository to GitHub.
2. In [Railway](https://railway.app), create a **New Project** $\rightarrow$ **Deploy from GitHub repo**.
3. Set the required Environment Variables in the Railway Dashboard:
   - `NODE_ENV=production`
   - `PORT=4000`
   - `API_PREFIX=/api/v1`
   - `MYSQL_HOST=` (your MariaDB host)
   - `MYSQL_PORT=` (your MariaDB port, e.g. 45272)
   - `MYSQL_USER=` (your MariaDB user)
   - `MYSQL_PASSWORD=` (your MariaDB password)
   - `MYSQL_DATABASE=` (your MariaDB database name)
   - `JWT_ACCESS_SECRET=` (random 32-byte hex string)
   - `STORAGE_SIGNING_SECRET=` (random 32-byte hex string)
4. Railway will automatically detect Nixpacks, run `npm install`, `npm run build`, and start with `npm run start`.

---

## 📁 Repository Structure

```
scaro-erp-v1/
├── src/                    # Frontend source code (React 19 + TypeScript)
├── public/                 # Static public assets (icons, manifest, logos)
├── server/                 # Backend source code (Express + TypeScript + MariaDB)
│   ├── src/                # Express controllers, routes, services, middleware
│   ├── storage/            # File storage (avatars, evidence, attachments)
│   ├── package.json        # Backend dependencies (mysql2, express, bcryptjs, etc.)
│   └── tsconfig.json       # Backend TypeScript config
├── migration/              # MariaDB schema reference documentation
│   └── mariadb/            # 001_create_schema.sql, 002_auth_tables.sql
├── package.json            # Root workspace scripts & frontend dependencies
├── vite.config.ts          # Vite build configuration
├── tailwind.config.js      # Tailwind CSS configuration
├── railway.json            # Railway deployment configuration
├── Procfile                # Process file for cloud hosting
└── .gitignore              # Production-grade git exclusion rules
```

## 🔒 Security
- All sensitive keys, passwords, and tokens are strictly kept out of version control.
- JWT-based authentication with HTTP-only, secure cookies.
- Helmet security headers and CORS protection.
