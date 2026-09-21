import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../..");
const serverRoot = path.resolve(__dirname, "../..");

// Load environment files in precedence order across serverRoot, projectRoot, and process.cwd()
const envFiles = [
  path.resolve(process.cwd(), ".env.production.local"),
  path.resolve(process.cwd(), ".env.production"),
  path.resolve(process.cwd(), ".env.local"),
  path.resolve(process.cwd(), ".env.migration.local"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(serverRoot, ".env.production.local"),
  path.resolve(serverRoot, ".env.production"),
  path.resolve(serverRoot, ".env.local"),
  path.resolve(serverRoot, ".env.migration.local"),
  path.resolve(serverRoot, ".env"),
  path.resolve(projectRoot, ".env.production.local"),
  path.resolve(projectRoot, ".env.production"),
  path.resolve(projectRoot, ".env.migration.local"),
  path.resolve(projectRoot, ".env.local"),
  path.resolve(projectRoot, ".env"),
];

for (const file of envFiles) {
  if (fs.existsSync(file)) {
    dotenv.config({ path: file, override: false });
  }
}

interface EnvConfig {
  NODE_ENV: "development" | "production" | "test";
  PORT: number;
  API_PREFIX: string;
  CORS_ORIGIN: string;
  MYSQL_HOST: string;
  MYSQL_PORT: number;
  MYSQL_USER: string;
  MYSQL_PASSWORD: string;
  MYSQL_DATABASE: string;
  JWT_ACCESS_SECRET: string;
  JWT_ACCESS_EXPIRES_IN: string;
  REFRESH_TOKEN_EXPIRES_DAYS: number;
  AUTH_COOKIE_NAME: string;
  AUTH_COOKIE_SECURE: boolean;
  AUTH_COOKIE_SAME_SITE: "lax" | "strict" | "none";
  // Storage configurations
  STORAGE_DRIVER: "local" | "s3" | "r2" | "azure" | "minio";
  STORAGE_ROOT: string;
  STORAGE_BASE_URL: string;
  MAX_UPLOAD_SIZE_MB: number;
  SIGNED_URL_EXPIRY_MINUTES: number;
  IMAGE_MAX_DIMENSION: number;
  STORAGE_SIGNING_SECRET: string;
}

function validateEnv(): EnvConfig {
  const missing: string[] = [];

  const nodeEnv = (process.env.NODE_ENV || "development") as "development" | "production" | "test";
  const port = parseInt(process.env.PORT || "4000", 10);
  const apiPrefix = process.env.API_PREFIX || "/api/v1";
  const corsOrigin = process.env.CORS_ORIGIN || (nodeEnv === "development" ? "http://localhost:5173" : "");

  const mysqlHost = process.env.MYSQL_HOST || "";
  const mysqlPortStr = process.env.MYSQL_PORT || "3306";
  const mysqlUser = process.env.MYSQL_USER || "";
  const mysqlPassword = process.env.MYSQL_PASSWORD || "";
  const mysqlDatabase = process.env.MYSQL_DATABASE || "";

  // JWT configuration
  const jwtSecret = process.env.JWT_ACCESS_SECRET || (nodeEnv === "development" ? "scaro_dev_jwt_access_secret_2026_unsecure_fallback" : "");
  const jwtExpiresIn = process.env.JWT_ACCESS_EXPIRES_IN || "15m";
  const refreshExpiresDays = parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS || "30", 10);
  const cookieName = process.env.AUTH_COOKIE_NAME || "scaro_refresh_token";
  const cookieSecure = process.env.AUTH_COOKIE_SECURE === "true" || (nodeEnv === "production" && process.env.AUTH_COOKIE_SECURE !== "false");
  const cookieSameSite = (process.env.AUTH_COOKIE_SAME_SITE || "lax") as "lax" | "strict" | "none";

  // Storage settings
  const storageDriver = (process.env.STORAGE_DRIVER || "local").toLowerCase() as "local" | "s3" | "r2" | "azure" | "minio";
  const defaultStorageRoot = path.resolve(serverRoot, "storage");
  const storageRoot = process.env.STORAGE_ROOT ? path.resolve(serverRoot, process.env.STORAGE_ROOT) : defaultStorageRoot;
  const storageBaseUrl = process.env.STORAGE_BASE_URL || `${apiPrefix}/storage`;
  const maxUploadSizeMb = parseInt(process.env.MAX_UPLOAD_SIZE_MB || "20", 10);
  const signedUrlExpiryMinutes = parseInt(process.env.SIGNED_URL_EXPIRY_MINUTES || "30", 10);
  const imageMaxDimension = parseInt(process.env.IMAGE_MAX_DIMENSION || "1024", 10);
  const storageSigningSecret = process.env.STORAGE_SIGNING_SECRET || jwtSecret;

  if (!mysqlHost) missing.push("MYSQL_HOST");
  if (!mysqlUser) missing.push("MYSQL_USER");
  if (!mysqlPassword) missing.push("MYSQL_PASSWORD");
  if (!mysqlDatabase) missing.push("MYSQL_DATABASE");

  if (!jwtSecret) {
    missing.push("JWT_ACCESS_SECRET");
  }

  if (nodeEnv === "production" && !corsOrigin) {
    missing.push("CORS_ORIGIN");
  }

  if (missing.length > 0) {
    console.error(`[FATAL] Missing required environment variables: ${missing.join(", ")}`);
    console.error("[FATAL] Please check your environment configuration or .env file.");
    process.exit(1);
  }

  const mysqlPort = parseInt(mysqlPortStr, 10);
  if (isNaN(mysqlPort) || mysqlPort <= 0 || mysqlPort > 65535) {
    console.error(`[FATAL] Invalid MYSQL_PORT: ${mysqlPortStr}`);
    process.exit(1);
  }

  if (isNaN(port) || port <= 0 || port > 65535) {
    console.error(`[FATAL] Invalid PORT: ${process.env.PORT}`);
    process.exit(1);
  }

  return Object.freeze({
    NODE_ENV: nodeEnv,
    PORT: port,
    API_PREFIX: apiPrefix,
    CORS_ORIGIN: corsOrigin,
    MYSQL_HOST: mysqlHost,
    MYSQL_PORT: mysqlPort,
    MYSQL_USER: mysqlUser,
    MYSQL_PASSWORD: mysqlPassword,
    MYSQL_DATABASE: mysqlDatabase,
    JWT_ACCESS_SECRET: jwtSecret,
    JWT_ACCESS_EXPIRES_IN: jwtExpiresIn,
    REFRESH_TOKEN_EXPIRES_DAYS: refreshExpiresDays,
    AUTH_COOKIE_NAME: cookieName,
    AUTH_COOKIE_SECURE: cookieSecure,
    AUTH_COOKIE_SAME_SITE: cookieSameSite,
    STORAGE_DRIVER: storageDriver,
    STORAGE_ROOT: storageRoot,
    STORAGE_BASE_URL: storageBaseUrl,
    MAX_UPLOAD_SIZE_MB: isNaN(maxUploadSizeMb) ? 20 : maxUploadSizeMb,
    SIGNED_URL_EXPIRY_MINUTES: isNaN(signedUrlExpiryMinutes) ? 30 : signedUrlExpiryMinutes,
    IMAGE_MAX_DIMENSION: isNaN(imageMaxDimension) ? 1024 : imageMaxDimension,
    STORAGE_SIGNING_SECRET: storageSigningSecret,
  });
}

export const config = validateEnv();
