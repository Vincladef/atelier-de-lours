import { weeklyEmails, weeks, parisDate } from "../src/lib/curriculum";
import { normalizeEmail } from "./security";
import type { Services, User } from "./types";
export async function enqueue(
  s: Services,
  userId: string,
  kind: string,
  week?: number,
  suffix = "",
) {
  await s.db.query(
    "INSERT INTO atelier_email_queue(user_id,kind,week,dedup_key) VALUES ($1,$2,$3,$4) ON CONFLICT(dedup_key) DO NOTHING",
    [userId, kind, week || null, `${userId}:${kind}:${week || ""}:${suffix}`],
  );
}
export async function giftActive(s: Services) {
  const { rows } = await s.db.query(
    "SELECT enabled FROM atelier_settings WHERE key='gift_activated'",
  );
  return rows[0]?.enabled === true;
}
export function mailContent(kind: string, week: number | null) {
  const w = Math.min(8, Math.max(1, week || 1));
  if (kind === "welcome")
    return {
      subject: "Bienvenue dans ton atelier",
      text: "Bonjour Papa Ours,\n\nUne feuille, des feutres et un peu de temps pour toi : ton atelier est ouvert. La première séance t’attend.\n\nJoyeux anniversaire !",
    };
  if (kind === "congratulations")
    return {
      subject: `Une semaine de dessin dans le carnet`,
      text: `Bonjour Papa Ours,\n\nTu as terminé les deux séances de « ${weeks[w - 1].name} ». ${weeks[w - 1].completion.message}\n\nTu peux refaire ces exercices ou passer à la suite, à ton rythme.`,
    };
  if (kind === "reminder")
    return {
      subject: "Une feuille t’attend",
      text: "Bonjour Papa Ours,\n\nTes feutres sont toujours là. Si tu as un moment, reprends ta séance ou regarde les dernières pages de ton carnet.\n\nMaman Chouette garde la place.",
    };
  return {
    subject: weeklyEmails[w - 1].subject,
    text: weeklyEmails[w - 1].body,
  };
}

async function housekeeping(s: Services) {
  await s.db.query("DELETE FROM atelier_limits WHERE resets_at<now()");
  await s.db.query("DELETE FROM atelier_sessions WHERE expires_at<now()");
  await s.db.query("DELETE FROM atelier_magic_links WHERE expires_at<now()");
  const deleted = await s.db.query(
    "SELECT id,blob_key FROM atelier_artworks WHERE deleted_at IS NOT NULL LIMIT 20",
  );
  for (const row of deleted.rows) {
    try {
      await s.store.delete(row.blob_key);
      await s.db.query("DELETE FROM atelier_artworks WHERE id=$1", [row.id]);
    } catch {
      /* Retry cleanup on the next scheduled execution. */
    }
  }
}

/** A stalled SMTP send is marked uncertain, never blindly retried after a crash. */
export async function runMailWorker(s: Services) {
  await housekeeping(s);
  if (!(await giftActive(s))) return { sent: 0, disabled: true };
  const { rows: users } = await s.db.query<User>(
    "SELECT * FROM atelier_users WHERE role='learner' AND notifications=true",
  );
  for (const u of users) {
    if (normalizeEmail(u.email) !== normalizeEmail(s.env.PAPA_EMAIL)) continue;
    await enqueue(s, u.id, "welcome");
    const { rows } = await s.db.query(
      "SELECT lesson_id FROM atelier_lessons WHERE user_id=$1 AND completed_at IS NOT NULL",
      [u.id],
    );
    const done = new Set(rows.map((r) => r.lesson_id));
    let currentWeek = 1;
    while (
      currentWeek < 8 &&
      done.has(currentWeek * 2 - 1) &&
      done.has(currentWeek * 2)
    )
      currentWeek++;
    // Calendar never runs ahead of the learner. Each eligible week is sent once.
    const elapsedDays = Math.floor(
      (Date.now() - new Date(u.created_at).getTime()) / 86400000,
    );
    const calendarWeek = Math.min(8, Math.floor(elapsedDays / 7) + 1);
    if (currentWeek <= calendarWeek)
      await enqueue(s, u.id, "weekly", currentWeek);
    for (let w = 1; w <= 8; w++)
      if (done.has(w * 2 - 1) && done.has(w * 2))
        await enqueue(s, u.id, "congratulations", w);
    if (
      u.reminders &&
      Date.now() - new Date(u.last_active_at).getTime() > 7 * 86400000
    ) {
      // One reminder per Paris calendar week, and only when explicitly requested.
      const d = new Date(parisDate() + "T12:00:00Z");
      const days = (d.getUTCDay() + 6) % 7;
      d.setUTCDate(d.getUTCDate() - days);
      await enqueue(s, u.id, "reminder", currentWeek, parisDate(d));
    }
  }
  await s.db.query(
    "UPDATE atelier_email_queue SET status='uncertain' WHERE status='sending' AND claimed_at < now()-interval '20 minutes'",
  );
  let sent = 0;
  for (let i = 0; i < 8; i++) {
    if (!(await giftActive(s))) break;
    const { rows } = await s.db
      .query(`UPDATE atelier_email_queue SET status='sending', claimed_at=now(), attempts=attempts+1
      WHERE id=(SELECT q.id FROM atelier_email_queue q JOIN atelier_users u ON u.id=q.user_id
        WHERE q.status IN ('pending','failed') AND q.due_at<=now() AND q.attempts<3 AND u.notifications=true
        AND u.role='learner' AND (q.kind<>'reminder' OR u.reminders=true)
        ORDER BY q.due_at FOR UPDATE OF q SKIP LOCKED LIMIT 1) RETURNING *`);
    const q = rows[0];
    if (!q) break;
    const { rows: recipients } = await s.db.query<User>(
      "SELECT * FROM atelier_users WHERE id=$1",
      [q.user_id],
    );
    const u = recipients[0];
    if (
      !u ||
      normalizeEmail(u.email) !== normalizeEmail(s.env.PAPA_EMAIL) ||
      !u.notifications ||
      !(await giftActive(s))
    ) {
      await s.db.query(
        "UPDATE atelier_email_queue SET status='cancelled' WHERE id=$1",
        [q.id],
      );
      continue;
    }
    const content = mailContent(q.kind, q.week);
    const url = s.env.URL || "https://atelier-de-lours.netlify.app";
    try {
      await s.send({
        to: u.email,
        ...content,
        text: `${content.text}\n\nOuvrir l’atelier : ${url}\n\nPour arrêter ces messages : ouvre Préférences dans l’atelier et désactive le courrier.`,
        messageId: `<atelier-${q.id}@atelier-de-lours.netlify.app>`,
      });
      await s.db.query(
        "UPDATE atelier_email_queue SET status='sent',sent_at=now() WHERE id=$1",
        [q.id],
      );
      sent++;
    } catch (e) {
      // Retry only explicit rejection before acceptance. Timeout/disconnect is ambiguous.
      const code = (e as { responseCode?: number }).responseCode;
      const status = code && code >= 400 && code < 500 ? "failed" : "uncertain";
      await s.db.query(
        "UPDATE atelier_email_queue SET status=$2,due_at=now()+interval '1 hour' WHERE id=$1",
        [q.id, status],
      );
    }
  }
  return { sent, disabled: false };
}
