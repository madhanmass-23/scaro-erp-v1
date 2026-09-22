import mysql from "mysql2/promise";
import dns from "dns";
import { config } from "./env.js";

// Prefer IPv6 address resolution for remote MariaDB hosts where IPv4 proxy drops handshake
dns.setDefaultResultOrder("ipv6first");

// Conservative, production-ready connection pool configuration with stale connection recycling
export const pool = mysql.createPool({
  host: config.MYSQL_HOST,
  port: config.MYSQL_PORT,
  user: config.MYSQL_USER,
  password: config.MYSQL_PASSWORD,
  database: config.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 5,
  idleTimeout: 30000,
  queueLimit: 0,
  charset: "utf8mb4",
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  connectTimeout: 10000,
});

export interface DatabaseHealthResult {
  ok: boolean;
  version?: string;
  error?: string;
}

/**
 * Executes a lightweight read-only probe to verify database connectivity.
 */
export async function checkDatabaseConnection(retries = 2): Promise<DatabaseHealthResult> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const [rows] = await pool.query<mysql.RowDataPacket[]>("SELECT 1 AS ok, VERSION() AS version");
      const first = rows[0];
      if (first && first.ok === 1) {
        return {
          ok: true,
          version: typeof first.version === "string" ? first.version : undefined,
        };
      }
    } catch (err) {
      if (attempt === retries) {
        const errorMessage = err instanceof Error ? err.message : "Database connection failed";
        return { ok: false, error: errorMessage };
      }
      // Small pause before retry
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return { ok: false, error: "Database probe failed after retries" };
}

/**
 * Closes all pool connections during graceful shutdown.
 */
export async function closeDatabasePool(): Promise<void> {
  try {
    await pool.end();
  } catch (err) {
    console.error("[DATABASE] Error closing connection pool:", err);
  }
}
