import { randomUUID } from "node:crypto";
import { HttpError } from "./security";
import type { Services } from "./types";
/** A bounded database lease works with Neon transaction pooling and across SMTP. */
export async function withMailLock<T>(
  s: Services,
  fn: (locked: Services) => Promise<T>,
): Promise<T> {
  const lease = randomUUID();
  const { rows } = await s.db.query(
    "INSERT INTO atelier_mail_lock(key,token,expires_at) VALUES ('dispatch',$1,now()+interval '5 minutes') ON CONFLICT(key) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE atelier_mail_lock.expires_at<now() RETURNING token",
    [lease],
  );
  if (!rows.length)
    throw new HttpError(
      409,
      "Un envoi est en cours. Réessaie dans quelques instants.",
    );
  try {
    return await fn(s);
  } finally {
    await s.db.query(
      "DELETE FROM atelier_mail_lock WHERE key='dispatch' AND token=$1",
      [lease],
    );
  }
}
export async function transaction<T>(
  s: Services,
  fn: (tx: Services) => Promise<T>,
): Promise<T> {
  const c = await s.db.connect();
  try {
    await c.query("BEGIN");
    const result = await fn({
      ...s,
      db: {
        query: c.query.bind(c),
        connect: async () => ({ query: c.query.bind(c), release: () => {} }),
      },
    });
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
