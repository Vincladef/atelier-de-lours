import { randomUUID } from "node:crypto";
import {
  authenticate,
  body,
  hash,
  HttpError,
  integer,
  json,
  limit,
  normalizeEmail,
  sameOrigin,
  sessionCookie,
  text,
  token,
  uuid,
} from "./security";
import { requireLessonAccess } from "./access";
import { image } from "./images";
import { askOwl } from "./ai";
import { giftActive, mailContent } from "./mail";
import type { ChatPage } from "../src/lib/pageContext";
import type { LessonStage } from "../src/lib/curriculum";
import type { Services, User } from "./types";

const genericLogin = {
  message:
    "Si cette adresse est autorisée, un lien de connexion vient de lui être envoyé. Il reste valable 15 minutes.",
};
const artworkColumns =
  "id,lesson_id,title,drawn_on,note,width,height,created_at";
function configured(s: Services) {
  return Boolean(
    s.env.EMAIL_FROM &&
    s.env.PAPA_EMAIL &&
    s.env.GMAIL_APP_PASSWORD &&
    normalizeEmail(s.env.EMAIL_FROM) !== normalizeEmail(s.env.PAPA_EMAIL),
  );
}
function owner(u: User) {
  if (u.role !== "owner")
    throw new HttpError(403, "Cette action est réservée au propriétaire.");
}
export async function handle(req: Request, s: Services): Promise<Response> {
  try {
    const url = new URL(req.url);
    const path =
      url.pathname
        .replace(/^\/\.netlify\/functions\/api/, "")
        .replace(/^\/api/, "") || "/";
    const method = req.method;
    if (!["GET", "POST", "PATCH", "DELETE"].includes(method))
      throw new HttpError(405, "Cette action n’est pas disponible.");
    if (method !== "GET") sameOrigin(req, s.env);
    if (path === "/health" && method === "GET") {
      await s.db.query("SELECT 1");
      return json({ ok: true, version: "1.0.0" });
    }
    if (path === "/auth/request" && method === "POST") {
      const b = await body(req);
      const email = normalizeEmail(text(b.email, 254));
      // Netlify overwrites this header; arbitrary X-Forwarded-For is never trusted.
      const ip = req.headers.get("x-nf-client-connection-ip") || "local";
      await limit(s.db, `login-ip:${hash(ip)}`, 8, 900);
      await limit(s.db, `login-mail:${hash(email)}`, 3, 900);
      if (!configured(s))
        throw new HttpError(
          503,
          "La connexion par email n’est pas encore configurée. Contacte le propriétaire de l’atelier.",
        );
      const role =
        email === normalizeEmail(s.env.EMAIL_FROM)
          ? "owner"
          : email === normalizeEmail(s.env.PAPA_EMAIL)
            ? "learner"
            : null;
      if (!role || (role === "learner" && !(await giftActive(s))))
        return json(genericLogin);
      const user = await s.db.query<User>(
        "INSERT INTO atelier_users(email,role) VALUES ($1,$2) ON CONFLICT(email) DO UPDATE SET email=excluded.email RETURNING *",
        [email, role],
      );
      const raw = token();
      await s.db.query(
        "INSERT INTO atelier_magic_links(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '15 minutes')",
        [hash(raw), user.rows[0].id],
      );
      const site = s.env.URL || url.origin;
      // Hash fragment keeps the single-use credential out of HTTP requests and access logs.
      const link = `${site}/#connexion?token=${raw}`;
      try {
        await s.send({
          to: email,
          subject: "Ton lien pour L’Atelier de l’Ours",
          text: `Ouvre ton atelier avec ce lien personnel :\n\n${link}\n\nIl expire dans 15 minutes et ne fonctionne qu’une fois. Si tu n’as pas demandé ce lien, ignore ce message.`,
        });
      } catch {
        await s.db.query(
          "DELETE FROM atelier_magic_links WHERE token_hash=$1",
          [hash(raw)],
        );
        throw new HttpError(
          503,
          "Le lien n’a pas pu être envoyé. Réessaie dans quelques minutes.",
        );
      }
      return json(genericLogin);
    }
    if (path === "/auth/consume" && method === "POST") {
      const b = await body(req);
      const raw = text(b.token, 100);
      if (!/^[\w-]{43}$/.test(raw))
        throw new HttpError(
          400,
          "Ce lien est invalide. Demande un nouveau lien de connexion.",
        );
      const c = await s.db.connect();
      const session = token();
      let user: User;
      try {
        await c.query("BEGIN");
        const result = await c.query(
          "UPDATE atelier_magic_links SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() RETURNING user_id",
          [hash(raw)],
        );
        if (!result.rows[0])
          throw new HttpError(
            400,
            "Ce lien a expiré ou a déjà été utilisé. Demande un nouveau lien.",
          );
        const found = await c.query<User>(
          "SELECT * FROM atelier_users WHERE id=$1",
          [result.rows[0].user_id],
        );
        user = found.rows[0];
        if (user.role === "learner") {
          const settings = await c.query(
            "SELECT enabled FROM atelier_settings WHERE key='gift_activated'",
          );
          if (!settings.rows[0]?.enabled)
            throw new HttpError(403, "L’atelier n’est pas encore ouvert.");
        }
        await c.query(
          "INSERT INTO atelier_sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '30 days')",
          [hash(session), user.id],
        );
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
      return json({ ok: true }, 200, {
        "Set-Cookie": sessionCookie(session, url.protocol === "https:"),
      });
    }
    // The shared learner workshop opens directly; owner operations still require a session.
    let u: User;
    try {
      u = await authenticate(req, s.db);
    } catch (e) {
      if (
        !(e instanceof HttpError) ||
        e.status !== 401 ||
        path.startsWith("/admin/")
      )
        throw e;
      const email = normalizeEmail(s.env.PAPA_EMAIL);
      if (!email || email === normalizeEmail(s.env.EMAIL_FROM))
        throw new HttpError(503, "L’atelier n’est pas encore configuré.");
      const result = await s.db.query<User>(
        "INSERT INTO atelier_users(email,role) VALUES ($1,'learner') ON CONFLICT(email) DO UPDATE SET email=excluded.email RETURNING *",
        [email],
      );
      u = result.rows[0];
      if (u.role !== "learner")
        throw new HttpError(503, "L’atelier n’est pas encore configuré.");
    }
    if (path === "/auth/logout" && method === "POST") {
      const raw =
        /atelier_session=([\w-]+)/.exec(req.headers.get("cookie") || "")?.[1] ||
        "";
      await s.db.query("DELETE FROM atelier_sessions WHERE token_hash=$1", [
        hash(raw),
      ]);
      return json({ ok: true }, 200, {
        "Set-Cookie": sessionCookie("", url.protocol === "https:", true),
      });
    }
    if (path === "/state" && method === "GET") {
      const [progress, artworks, reviews, chat] = await Promise.all([
        s.db.query("SELECT * FROM atelier_lessons WHERE user_id=$1", [u.id]),
        s.db.query(
          `SELECT ${artworkColumns} FROM atelier_artworks WHERE user_id=$1 AND deleted_at IS NULL ORDER BY drawn_on DESC,created_at DESC`,
          [u.id],
        ),
        s.db.query(
          "SELECT week,easy,difficult,repeat FROM atelier_weekly_reviews WHERE user_id=$1",
          [u.id],
        ),
        s.db.query(
          "SELECT id,lesson_id,role,content,has_image,phase,step FROM (SELECT * FROM atelier_chat WHERE user_id=$1 ORDER BY id DESC LIMIT 40) recent ORDER BY id",
          [u.id],
        ),
      ]);
      return json({
        user: {
          role: u.role,
          notifications: u.notifications,
          reminders: u.reminders,
        },
        progress: Object.fromEntries(
          progress.rows.map((p) => [p.lesson_id, p]),
        ),
        artworks: artworks.rows,
        reviews: Object.fromEntries(reviews.rows.map((r) => [r.week, r])),
        chat: chat.rows,
      });
    }
    const lessonMatch = /^\/lessons\/(\d+)$/.exec(path);
    if (lessonMatch && method === "PATCH") {
      const id = integer(Number(lessonMatch[1]), 1, 16);
      const b = await body(req);
      await requireLessonAccess(s.db, u.id, id);
      const changes: Record<string, unknown> = {};
      if ("phase" in b) {
        if (!["observe", "draw", "finish"].includes(b.phase))
          throw new HttpError(400, "Cette étape n’existe pas.");
        changes.phase = b.phase;
      }
      if ("step" in b) changes.step = integer(b.step, 0, 3);
      if ("checked_steps" in b) {
        if (!Array.isArray(b.checked_steps) || b.checked_steps.length > 4)
          throw new HttpError(400, "Les étapes sont invalides.");
        changes.checked_steps = [
          ...new Set(b.checked_steps.map((v: unknown) => integer(v, 0, 3))),
        ];
      }
      if ("notes" in b) changes.notes = text(b.notes, 5000);
      if ("quiz_answer" in b)
        changes.quiz_answer = integer(b.quiz_answer, 0, 2);
      if ("ease" in b) {
        if (
          !["Un peu difficile", "Ça allait", "Plutôt facile", ""].includes(
            b.ease,
          )
        )
          throw new HttpError(400, "Ce bilan est invalide.");
        changes.ease = b.ease;
      }
      if ("joy" in b) {
        if (!["Pas trop", "Un peu", "Beaucoup", ""].includes(b.joy))
          throw new HttpError(400, "Ce bilan est invalide.");
        changes.joy = b.joy;
      }
      if ("completed" in b) {
        if (b.completed !== true)
          throw new HttpError(400, "Cette validation est invalide.");
        changes.completed_at = new Date().toISOString();
        changes.phase = "finish";
      }
      const keys = Object.keys(changes);
      if (!keys.length)
        throw new HttpError(400, "Aucune modification à enregistrer.");
      // Keys come exclusively from the allowlist above, never from user-controlled SQL.
      const values = Object.values(changes);
      const assignments = keys
        .map((k, i) =>
          k === "completed_at"
            ? `${k}=COALESCE(atelier_lessons.completed_at,$${i + 3})`
            : `${k}=$${i + 3}`,
        )
        .join(",");
      const result = await s.db.query(
        `INSERT INTO atelier_lessons(user_id,lesson_id,${keys.join(",")}) VALUES ($1,$2,${keys.map((_, i) => "$" + (i + 3)).join(",")}) ON CONFLICT(user_id,lesson_id) DO UPDATE SET ${assignments},updated_at=now() RETURNING *`,
        [u.id, id, ...values],
      );
      await s.db.query(
        "UPDATE atelier_users SET last_active_at=now() WHERE id=$1",
        [u.id],
      );
      return json({ progress: result.rows[0] });
    }
    const weekMatch = /^\/reviews\/(\d+)$/.exec(path);
    if (weekMatch && method === "PATCH") {
      const week = integer(Number(weekMatch[1]), 1, 8);
      await requireLessonAccess(s.db, u.id, week * 2);
      const b = await body(req);
      const result = await s.db.query(
        "INSERT INTO atelier_weekly_reviews(user_id,week,easy,difficult,repeat) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,week) DO UPDATE SET easy=excluded.easy,difficult=excluded.difficult,repeat=excluded.repeat,updated_at=now() RETURNING week,easy,difficult,repeat",
        [
          u.id,
          week,
          text(b.easy || "", 1000),
          text(b.difficult || "", 1000),
          text(b.repeat || "", 1000),
        ],
      );
      return json({ review: result.rows[0] });
    }
    if (path === "/preferences" && method === "PATCH") {
      const b = await body(req);
      if (
        typeof b.notifications !== "boolean" ||
        typeof b.reminders !== "boolean"
      )
        throw new HttpError(400, "Ces préférences sont invalides.");
      await s.db.query(
        "UPDATE atelier_users SET notifications=$2,reminders=$3 WHERE id=$1",
        [u.id, b.notifications, b.reminders],
      );
      if (!b.notifications)
        await s.db.query(
          "UPDATE atelier_email_queue SET status='cancelled' WHERE user_id=$1 AND status IN ('pending','failed')",
          [u.id],
        );
      return json({ ok: true });
    }
    if (path === "/artworks" && method === "POST") {
      await limit(s.db, `uploads:${u.id}`, 30, 3600);
      const b = await body(req, 2950000);
      const title = text(b.title, 120);
      if (!title) throw new HttpError(400, "Donne un titre à ton dessin.");
      const date = text(b.drawn_on, 10);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        isNaN(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date
      )
        throw new HttpError(400, "Choisis une date valide.");
      const lesson = b.lesson_id == null ? null : integer(b.lesson_id, 1, 16);
      const note = text(b.note || "", 3000);
      const photo = await image(b.image);
      const id = randomUUID();
      const key = `${u.id}/${id}.jpg`;
      try {
        await s.store.set(key, photo.bytes);
      } catch {
        throw new HttpError(
          503,
          "La photo n’a pas pu être conservée. Réessaie sans fermer cette fenêtre.",
        );
      }
      try {
        const result = await s.db.query(
          `INSERT INTO atelier_artworks(id,user_id,lesson_id,title,drawn_on,note,blob_key,width,height,byte_length) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${artworkColumns}`,
          [
            id,
            u.id,
            lesson,
            title,
            date,
            note,
            key,
            photo.width,
            photo.height,
            photo.bytes.length,
          ],
        );
        return json({ artwork: result.rows[0] }, 201);
      } catch (e) {
        await s.store.delete(key).catch(() => {});
        throw e;
      }
    }
    const art = /^\/artworks\/([^/]+)(\/image)?$/.exec(path);
    if (art) {
      const id = uuid(art[1]);
      const found = await s.db.query(
        "SELECT * FROM atelier_artworks WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
        [id, u.id],
      );
      const work = found.rows[0];
      if (!work) throw new HttpError(404, "Ce dessin est introuvable.");
      if (art[2] && method === "GET") {
        const bytes = await s.store.get(work.blob_key);
        if (!bytes)
          throw new HttpError(
            404,
            "La photographie est momentanément indisponible.",
          );
        return new Response(bytes, {
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": 'inline; filename="dessin.jpg"',
          },
        });
      }
      if (!art[2] && method === "DELETE") {
        await s.db.query(
          "UPDATE atelier_artworks SET deleted_at=now() WHERE id=$1 AND user_id=$2",
          [id, u.id],
        );
        await s.store.delete(work.blob_key).catch(() => {});
        return json({ ok: true });
      }
      if (!art[2] && method === "PATCH") {
        const b = await body(req);
        const title = text(b.title, 120);
        if (!title) throw new HttpError(400, "Donne un titre au dessin.");
        const result = await s.db.query(
          `UPDATE atelier_artworks SET title=$3,note=$4 WHERE id=$1 AND user_id=$2 RETURNING ${artworkColumns}`,
          [id, u.id, title, text(b.note || "", 3000)],
        );
        return json({ artwork: result.rows[0] });
      }
    }
    if (path === "/chat" && method === "GET") {
      const id = integer(Number(url.searchParams.get("lesson_id")), 1, 16);
      await requireLessonAccess(s.db, u.id, id);
      const before = url.searchParams.has("before")
        ? integer(
            Number(url.searchParams.get("before")),
            1,
            Number.MAX_SAFE_INTEGER,
          )
        : null;
      const result = await s.db.query(
        "SELECT id,lesson_id,role,content,has_image,phase,step FROM atelier_chat WHERE user_id=$1 AND lesson_id=$2 AND ($3::bigint IS NULL OR id<$3) ORDER BY id DESC LIMIT 41",
        [u.id, id, before],
      );
      return json({
        messages: result.rows.slice(0, 40).reverse(),
        has_more: result.rows.length > 40,
      });
    }
    if (path === "/chat" && method === "POST") {
      const b = await body(req, 2950000);
      const id = integer(b.lesson_id, 1, 16);
      await requireLessonAccess(s.db, u.id, id);
      const question = text(b.question, 1500);
      if (!question)
        throw new HttpError(400, "Écris une question pour Maman Chouette.");
      let stage: LessonStage | undefined;
      if (b.stage !== undefined) {
        if (!b.stage || !["observe", "draw", "finish"].includes(b.stage.phase))
          throw new HttpError(400, "L’étape du cours est invalide.");
        stage = { phase: b.stage.phase, step: integer(b.stage.step, 0, 3) };
      }
      if (b.page !== undefined && !["lesson", "owl"].includes(b.page))
        throw new HttpError(400, "La page indiquée est invalide.");
      const page: ChatPage = b.page || (stage ? "lesson" : "owl");
      return json(
        await askOwl(s, u, id, question, b.image, b.consent, stage, page),
      );
    }
    if (path === "/admin/status" && method === "GET") {
      owner(u);
      const queue = await s.db.query(
        "SELECT status,count(*)::integer AS count FROM atelier_email_queue GROUP BY status",
      );
      return json({
        gift_activated: await giftActive(s),
        mail_configured: configured(s),
        ai_configured: Boolean(s.env.DEEPSEEK_API_KEY),
        database_connected: true,
        queue: queue.rows,
      });
    }
    if (path === "/admin/activation" && method === "POST") {
      owner(u);
      const b = await body(req);
      if (b.confirmation !== "ACTIVER LES ENVOIS À PAPA")
        throw new HttpError(
          400,
          "L’activation exige la confirmation explicite demandée.",
        );
      await s.db.query(
        "UPDATE atelier_settings SET enabled=true,updated_at=now() WHERE key='gift_activated'",
      );
      await s.db.query(
        "INSERT INTO atelier_admin_audit(actor_id,action) VALUES ($1,'gift_activated')",
        [u.id],
      );
      return json({ ok: true });
    }
    if (path === "/admin/pause" && method === "POST") {
      owner(u);
      await s.db.query(
        "UPDATE atelier_settings SET enabled=false,updated_at=now() WHERE key='gift_activated'",
      );
      await s.db.query(
        "INSERT INTO atelier_admin_audit(actor_id,action) VALUES ($1,'gift_paused')",
        [u.id],
      );
      return json({ ok: true });
    }
    if (path === "/admin/test-email" && method === "POST") {
      owner(u);
      await limit(s.db, "test-email", 3, 3600);
      const b = await body(req);
      const week = integer(b.week, 1, 8);
      const mail = mailContent("weekly", week, {
        siteUrl: s.env.URL,
        test: true,
      });
      await s.send({
        to: normalizeEmail(s.env.EMAIL_FROM),
        subject: `[TEST] ${mail.subject}`,
        text: mail.text,
        html: mail.html,
      });
      return json({ ok: true });
    }
    throw new HttpError(404, "Cette page est introuvable.");
  } catch (e) {
    if (e instanceof HttpError)
      return json(
        { error: e.message },
        e.status,
        e.status === 429 ? { "Retry-After": "900" } : {},
      );
    // Never log provider errors: they can contain connection URLs, email addresses or tokens.
    return json(
      {
        error:
          "L’enregistrement n’a pas abouti. Réessaie dans un instant ; tes modifications restent affichées.",
      },
      503,
    );
  }
}
