import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../server/db";
import { handle } from "../server/api";
import type { Database, QueryResult, Services, Mail } from "../server/types";

/** Real PostgreSQL engine in WASM; transaction locking is supplied by this adapter. */
export async function fixtures() {
  const pg = new PGlite();
  let tail = Promise.resolve();
  async function lock() {
    let release!: () => void;
    const next = new Promise<void>((r) => (release = r));
    const previous = tail;
    tail = previous.then(() => next);
    await previous;
    return release;
  }
  async function query<T = Record<string, any>>(
    sql: string,
    params?: any[],
  ): Promise<QueryResult<T>> {
    if (sql.includes("pg_advisory_xact_lock")) return { rows: [] }; // The adapter's exclusive connection lock provides this in PGlite.
    if (!params?.length && sql.includes(";")) {
      const r = await pg.exec(sql);
      return { rows: (r.at(-1)?.rows || []) as T[] };
    }
    const r = await pg.query<T>(sql, params);
    return { rows: r.rows, rowCount: r.affectedRows };
  }
  const db: Database = {
    query: async (sql, params) => {
      const release = await lock();
      try {
        return await query(sql, params);
      } finally {
        release();
      }
    },
    connect: async () => {
      const release = await lock();
      return { query, release };
    },
  };
  await migrate(db);
  const mails: Mail[] = [];
  const blobs = new Map<string, Uint8Array>();
  const requests: { url: string; body: any }[] = [];
  const s: Services = {
    db,
    env: {
      URL: "http://127.0.0.1:8890",
      EMAIL_FROM: "owner@example.test",
      PAPA_EMAIL: "papa@example.test",
      GMAIL_APP_PASSWORD: "fixture-password",
      DEEPSEEK_API_KEY: "fixture-ai-key",
    },
    store: {
      set: async (k, b) => {
        blobs.set(k, b);
      },
      get: async (k) => {
        const b = blobs.get(k);
        return b ? new Uint8Array(b).buffer : null;
      },
      delete: async (k) => {
        blobs.delete(k);
      },
    },
    send: async (m) => {
      mails.push(m);
    },
    fetch: async (input, init) => {
      const url = String(input);
      requests.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return new Response(
        JSON.stringify(
          url.endsWith("/models")
            ? { data: [{ id: "deepseek-chat" }] }
            : {
                choices: [
                  {
                    message: {
                      content:
                        "Pose trois formes légères avant de travailler les détails.",
                    },
                  },
                ],
              },
        ),
        { headers: { "Content-Type": "application/json" } },
      );
    },
  };
  const defaultFetch = s.fetch;
  function enableVision() {
    s.fetch = async (input, init) =>
      String(input).endsWith("/models")
        ? new Response(
            JSON.stringify({
              data: [
                { id: "deepseek-flash", input_modalities: ["text", "image"] },
              ],
            }),
          )
        : defaultFetch(input, init);
  }
  let cookie = "";
  async function request(
    path: string,
    method = "GET",
    data?: unknown,
    options: { cookie?: string; origin?: string | null } = {},
  ) {
    const headers: Record<string, string> = {};
    if (options.cookie ?? cookie) headers.cookie = options.cookie ?? cookie;
    if (method !== "GET" && options.origin !== null)
      headers.origin = options.origin || s.env.URL!;
    if (data !== undefined) headers["content-type"] = "application/json";
    return handle(
      new Request(s.env.URL + "/api" + path, {
        method,
        headers,
        body: data === undefined ? undefined : JSON.stringify(data),
      }),
      s,
    );
  }
  async function login(email = "owner@example.test") {
    const r = await request("/auth/request", "POST", { email });
    if (r.status !== 200) throw new Error("fixture login request failed");
    const raw = /token=([\w-]+)/.exec(mails.at(-1)?.text || "")?.[1];
    if (!raw) throw new Error("fixture mail missing");
    const consume = await request("/auth/consume", "POST", { token: raw });
    cookie = consume.headers.get("set-cookie")!.split(";")[0];
    return { cookie, raw, response: consume };
  }
  async function reset() {
    await db.query(
      "TRUNCATE atelier_mail_lock,atelier_users,atelier_magic_links,atelier_sessions,atelier_lessons,atelier_weekly_reviews,atelier_artworks,atelier_chat,atelier_limits,atelier_email_queue,atelier_admin_audit CASCADE",
    );
    await db.query(
      "UPDATE atelier_settings SET enabled=false WHERE key='gift_activated'",
    );
    mails.length = 0;
    blobs.clear();
    requests.length = 0;
    cookie = "";
    s.fetch = defaultFetch;
  }
  return {
    s,
    pg,
    mails,
    blobs,
    requests,
    enableVision,
    request,
    login,
    reset,
    get cookie() {
      return cookie;
    },
  };
}
