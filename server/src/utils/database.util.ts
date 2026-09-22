import mysql from "mysql2/promise";
import { pool } from "../config/database.js";

function isTransientConnectionError(err: any): boolean {
  if (!err) return false;
  const code = err.code || "";
  const msg = err.message || "";
  return (
    code === "PROTOCOL_CONNECTION_LOST" ||
    code === "ECONNRESET" ||
    code === "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR" ||
    code === "ER_SOCKET_NOT_CONNECTED" ||
    code === "EPIPE" ||
    code === "PROTOCOL_PACKETS_OUT_OF_ORDER" ||
    code === "ETIMEDOUT" ||
    msg.includes("Connection lost") ||
    msg.includes("closed the connection") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("socket has been closed")
  );
}

/**
 * Executes a parameterized SELECT query returning an array of rows with transient connection retry.
 */
export async function query<T = unknown>(
  sql: string,
  params?: (string | number | boolean | Date | null | undefined)[]
): Promise<T[]> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const [rows] = await pool.query<mysql.RowDataPacket[]>(sql, params as any);
      return rows as unknown as T[];
    } catch (err: any) {
      if (attempt < 3 && isTransientConnectionError(err)) {
        console.warn(`[DATABASE] Stale/dropped connection detected (${err?.code || "LOST"}). Retrying query (attempt ${attempt}/3)...`);
        await new Promise((r) => setTimeout(r, attempt * 250));
        continue;
      }
      throw err;
    }
  }
  return [];
}

/**
 * Executes a parameterized SELECT query returning the first row or null.
 */
export async function queryOne<T = unknown>(
  sql: string,
  params?: (string | number | boolean | Date | null | undefined)[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? (rows[0] as T) : null;
}

/**
 * Executes an INSERT / UPDATE / DELETE statement returning the result header with transient connection retry.
 */
export async function execute(
  sql: string,
  params?: (string | number | boolean | Date | null | undefined)[]
): Promise<mysql.ResultSetHeader> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const [result] = await pool.execute<mysql.ResultSetHeader>(sql, params as any);
      return result;
    } catch (err: any) {
      if (attempt < 3 && isTransientConnectionError(err)) {
        console.warn(`[DATABASE] Stale/dropped connection detected (${err?.code || "LOST"}). Retrying execute (attempt ${attempt}/3)...`);
        await new Promise((r) => setTimeout(r, attempt * 250));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Execute failed after connection retry");
}

/**
 * Wraps a set of database operations within an ACID transaction.
 */
export async function withTransaction<T>(
  callback: (connection: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
