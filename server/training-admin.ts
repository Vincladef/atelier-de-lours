import { randomUUID } from "node:crypto";
import { enqueue, mailContent } from "./mail";
import { withMailLock, transaction } from "./mail-lock";
import { HttpError, normalizeEmail } from "./security";
import { nextLesson } from "../src/lib/curriculum";
import type { Services, User } from "./types";

async function learner(s: Services) {
  const email = normalizeEmail(s.env.PAPA_EMAIL);
  if (!email || email === normalizeEmail(s.env.EMAIL_FROM))
    throw new HttpError(
      503,
      "L’adresse de Papa n’est pas correctement configurée.",
    );
  const { rows } = await s.db.query<User>(
    "INSERT INTO atelier_users(email,role) VALUES ($1,'learner') ON CONFLICT(email) DO UPDATE SET email=excluded.email RETURNING *",
    [email],
  );
  if (rows[0].role !== "learner")
    throw new HttpError(
      503,
      "Le compte de Papa n’est pas correctement configuré.",
    );
  return rows[0];
}
export async function resetTraining(
  s: Services,
  ownerId: string,
  eraseNotebook: boolean,
) {
  return withMailLock(s, (s) =>
    transaction(s, async (s) => {
      const u = await learner(s);
      await s.db.query(
        "UPDATE atelier_settings SET enabled=false,updated_at=now() WHERE key='gift_activated'",
      );
      for (const table of [
        "atelier_lessons",
        "atelier_weekly_reviews",
        "atelier_chat",
        "atelier_sessions",
        "atelier_magic_links",
      ])
        await s.db.query(`DELETE FROM ${table} WHERE user_id=$1`, [u.id]);
      if (eraseNotebook)
        await s.db.query(
          "UPDATE atelier_artworks SET deleted_at=now() WHERE user_id=$1 AND deleted_at IS NULL",
          [u.id],
        );
      await s.db.query(
        "UPDATE atelier_email_queue SET status='cancelled' WHERE user_id=$1 AND status IN ('pending','failed')",
        [u.id],
      );
      await s.db.query(
        "UPDATE atelier_users SET training_run=$2,training_started_at=now(),last_active_at=now(),notifications=false,reminders=false WHERE id=$1",
        [u.id, randomUUID()],
      );
      await s.db.query(
        "INSERT INTO atelier_admin_audit(actor_id,action) VALUES($1,$2)",
        [
          ownerId,
          eraseNotebook ? "training_reset_with_notebook" : "training_reset",
        ],
      );
      return { ok: true };
    }),
  );
}
export async function inviteLearner(
  s: Services,
  ownerId: string,
  notifications: boolean,
) {
  if (!s.env.GMAIL_APP_PASSWORD || !s.env.EMAIL_FROM)
    throw new HttpError(503, "L’envoi d’email n’est pas configuré.");
  return withMailLock(s, async (s) => {
    const u = await learner(s);
    await enqueue(s, u.id, "welcome");
    const { rows } = await s.db.query(
      "SELECT * FROM atelier_email_queue WHERE user_id=$1 AND training_run=$2 AND kind='welcome'",
      [u.id, u.training_run],
    );
    const q = rows[0];
    if (q.status === "sent") return { ok: true, already_sent: true };
    if (!["pending", "failed"].includes(q.status) || q.attempts >= 3)
      throw new HttpError(
        409,
        "L’envoi de cette invitation est en cours ou non confirmé. Aucun doublon ne sera envoyé automatiquement.",
      );
    await transaction(s, async (s) => {
      await s.db.query(
        "UPDATE atelier_settings SET enabled=true,updated_at=now() WHERE key='gift_activated'",
      );
      // The first mail is explicit. The worker cannot race it or subscribe the learner early.
      await s.db.query(
        "UPDATE atelier_users SET notifications=false WHERE id=$1",
        [u.id],
      );
      await s.db.query(
        "UPDATE atelier_email_queue SET status='sending',claimed_at=now(),attempts=attempts+1 WHERE id=$1",
        [q.id],
      );
      await s.db.query(
        "INSERT INTO atelier_admin_audit(actor_id,action) VALUES($1,'invitation_requested')",
        [ownerId],
      );
    });
    const progress = await s.db.query(
      "SELECT lesson_id,completed_at FROM atelier_lessons WHERE user_id=$1",
      [u.id],
    );
    const next = nextLesson(
      Object.fromEntries(progress.rows.map((p) => [p.lesson_id, p])),
    );
    const mail = mailContent("welcome", 1, {
      siteUrl: s.env.URL,
      nextLessonId:
        progress.rows.filter((p) => p.completed_at).length === 16
          ? null
          : next.index,
    });
    try {
      await s.send({
        to: u.email,
        ...mail,
        messageId: `<atelier-${q.id}@atelier-de-lours.netlify.app>`,
      });
    } catch (e) {
      const code = (e as { responseCode?: number }).responseCode;
      await s.db.query("UPDATE atelier_email_queue SET status=$2 WHERE id=$1", [
        q.id,
        code && code >= 400 && code < 600 ? "failed" : "uncertain",
      ]);
      throw new HttpError(
        503,
        "L’envoi de l’invitation n’a pas pu être confirmé. Les courriers suivants restent désactivés.",
      );
    }
    await transaction(s, async (s) => {
      await s.db.query(
        "UPDATE atelier_email_queue SET status='sent',sent_at=now() WHERE id=$1",
        [q.id],
      );
      await s.db.query(
        "UPDATE atelier_users SET notifications=$2,training_started_at=now() WHERE id=$1 AND training_run=$3",
        [u.id, notifications, u.training_run],
      );
      // The invitation already introduces this week's next lesson.
      await enqueue(s, u.id, "weekly", next.week);
      await s.db.query(
        "UPDATE atelier_email_queue SET status='cancelled' WHERE user_id=$1 AND training_run=$2 AND kind='weekly' AND week=$3 AND status IN ('pending','failed')",
        [u.id, u.training_run, next.week],
      );
      await s.db.query(
        "INSERT INTO atelier_admin_audit(actor_id,action) VALUES($1,'invitation_sent')",
        [ownerId],
      );
    });
    return { ok: true, already_sent: false };
  });
}
