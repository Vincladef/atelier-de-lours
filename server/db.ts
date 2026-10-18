import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Database } from "./types";

let pool: pg.Pool | undefined;
export function database(): Database {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_UNAVAILABLE");
  if (!pool) {
    const url = new URL(process.env.DATABASE_URL);
    const neon = url.hostname.endsWith(".neon.tech");
    // Neon URLs often use sslmode=require; explicitly retain certificate validation.
    if (neon) {
      url.searchParams.delete("sslmode");
      url.searchParams.delete("sslrootcert");
    }
    pool = new pg.Pool({
      connectionString: url.toString(),
      ...(neon ? { ssl: { rejectUnauthorized: true } } : {}),
      max: 2,
      idleTimeoutMillis: 15000,
      connectionTimeoutMillis: 10000,
      statement_timeout: 15000,
    });
  }
  return pool as unknown as Database;
}

/** Transaction + advisory lock make cold starts and concurrent deploys safe. */
export async function migrate(db: Database) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(876230049)");
    await c.query(
      "CREATE TABLE IF NOT EXISTS atelier_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const name of (await readdir(resolve("migrations")))
      .filter((n) => /^\d+.*\.sql$/.test(n))
      .sort()) {
      const existing = await c.query(
        "SELECT name FROM atelier_migrations WHERE name=$1",
        [name],
      );
      if (!existing.rows.length) {
        await c.query(await readFile(resolve("migrations", name), "utf8"));
        await c.query("INSERT INTO atelier_migrations(name) VALUES ($1)", [
          name,
        ]);
      }
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
