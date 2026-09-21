import { queryOne } from "../utils/database.util.js";

export interface HealthProbeRow {
  ok: number;
  version: string;
}

export class HealthRepository {
  /**
   * Pings the MariaDB database and returns connection status and version.
   */
  async ping(): Promise<{ ok: boolean; version?: string }> {
    try {
      const row = await queryOne<HealthProbeRow>("SELECT 1 AS ok, VERSION() AS version");
      if (row && row.ok === 1) {
        return { ok: true, version: row.version };
      }
      return { ok: false };
    } catch {
      return { ok: false };
    }
  }
}

export const healthRepository = new HealthRepository();
