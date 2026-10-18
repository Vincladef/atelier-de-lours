import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { fixtures } from "./helpers";
import { migrate } from "../server/db";
import { enqueue, runMailWorker } from "../server/mail";
let f: Awaited<ReturnType<typeof fixtures>>;
before(async () => {
  f = await fixtures();
});
after(async () => {
  await f.pg.close();
});
beforeEach(async () => {
  await f.reset();
});
const photo = async () =>
  "data:image/png;base64," +
  (
    await sharp({
      create: { width: 40, height: 30, channels: 3, background: "#304c3e" },
    })
      .png()
      .toBuffer()
  ).toString("base64");
async function upload() {
  return f.request("/artworks", "POST", {
    title: "Mon premier ours",
    drawn_on: "2026-10-18",
    lesson_id: 1,
    note: "Deux formes simples.",
    image: await photo(),
  });
}

test("migration is repeatable and never seeds demo data", async () => {
  await migrate(f.s.db);
  assert.equal(
    (await f.s.db.query("SELECT * FROM atelier_users")).rows.length,
    0,
  );
  assert.equal(
    (await f.s.db.query("SELECT enabled FROM atelier_settings")).rows[0]
      .enabled,
    false,
  );
});
test("anonymous private endpoints reject access", async () => {
  for (const path of ["/state", "/admin/status", "/artworks/123/image"])
    assert.equal((await f.request(path)).status, 401);
});
test("gift gate prevents all learner email including login", async () => {
  const r = await f.request("/auth/request", "POST", {
    email: "papa@example.test",
  });
  assert.equal(r.status, 200);
  assert.equal(f.mails.length, 0);
  assert.equal(
    (await f.s.db.query("SELECT * FROM atelier_users")).rows.length,
    0,
  );
});
test("unknown email has the same generic response and receives nothing", async () => {
  const a = await f.request("/auth/request", "POST", {
    email: "nobody@example.test",
  });
  const b = await f.request("/auth/request", "POST", {
    email: "papa@example.test",
  });
  assert.deepEqual(await a.json(), await b.json());
  assert.equal(f.mails.length, 0);
});
test("all mutations enforce same-origin and JSON input", async () => {
  assert.equal(
    (
      await f.request(
        "/auth/request",
        "POST",
        { email: "owner@example.test" },
        { origin: null },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request(
        "/auth/request",
        "POST",
        { email: "owner@example.test" },
        { origin: "https://evil.example" },
      )
    ).status,
    403,
  );
  assert.equal(f.mails.length, 0);
});
test("owner magic links are hashed, single use, and sessions are HttpOnly", async () => {
  const { raw, response } = await f.login();
  assert.equal(response.status, 200);
  const link = (await f.s.db.query("SELECT * FROM atelier_magic_links"))
    .rows[0];
  assert.notEqual(link.token_hash, raw);
  assert.match(response.headers.get("set-cookie")!, /HttpOnly/);
  assert.match(response.headers.get("set-cookie")!, /SameSite=Lax/);
  assert.equal(
    (await f.request("/auth/consume", "POST", { token: raw })).status,
    400,
  );
  assert.equal((await f.request("/state")).status, 200);
});
test("expired magic links cannot start sessions", async () => {
  await f.request("/auth/request", "POST", { email: "owner@example.test" });
  const raw = /token=([\w-]+)/.exec(f.mails[0].text)![1];
  await f.s.db.query(
    "UPDATE atelier_magic_links SET expires_at=now()-interval '1 minute'",
  );
  assert.equal(
    (await f.request("/auth/consume", "POST", { token: raw })).status,
    400,
  );
});
test("new account starts at zero with an empty notebook", async () => {
  await f.login();
  const d = await (await f.request("/state")).json();
  assert.deepEqual(d.progress, {});
  assert.deepEqual(d.artworks, []);
  assert.deepEqual(d.chat, []);
  assert.equal(d.user.notifications, false);
});
test("all 16 sessions save steps, notes, quiz and completion then resume", async () => {
  await f.login();
  for (let i = 1; i <= 16; i++) {
    const r = await f.request("/lessons/" + i, "PATCH", {
      phase: "draw",
      step: 2,
      checked_steps: [0, 1],
      notes: "Essai " + i,
      quiz_answer: 1,
    });
    assert.equal(r.status, 200);
    assert.equal(
      (await f.request("/lessons/" + i, "PATCH", { completed: true })).status,
      200,
    );
  }
  const d = await (await f.request("/state")).json();
  assert.equal(Object.keys(d.progress).length, 16);
  assert.equal(d.progress[16].notes, "Essai 16");
  assert.deepEqual(d.progress[1].checked_steps, [0, 1]);
  assert.ok(Object.values(d.progress).every((p: any) => p.completed_at));
});
test("invalid progress and overlong notes are rejected", async () => {
  await f.login();
  for (const [id, patch] of [
    [17, { step: 0 }],
    [1, { phase: "unknown" }],
    [1, { checked_steps: [-1] }],
    [1, { notes: "x".repeat(5001) }],
    [1, { completed: false }],
  ])
    assert.equal(
      (await f.request("/lessons/" + id, "PATCH", patch)).status,
      400,
    );
});
test("weekly reviews and notification opt-outs persist", async () => {
  await f.login();
  assert.equal(
    (
      await f.request("/reviews/1", "PATCH", {
        easy: "Les traits",
        difficult: "L’eau",
        repeat: "Nuancier",
      })
    ).status,
    200,
  );
  await f.request("/preferences", "PATCH", {
    notifications: true,
    reminders: true,
  });
  const d = await (await f.request("/state")).json();
  assert.equal(d.reviews[1].easy, "Les traits");
  assert.equal(d.user.reminders, true);
  await f.request("/preferences", "PATCH", {
    notifications: false,
    reminders: false,
  });
  assert.equal(
    (await (await f.request("/state")).json()).user.notifications,
    false,
  );
});
test("photos are normalized to JPEG, persisted and private", async () => {
  await f.login();
  const r = await upload();
  assert.equal(r.status, 201);
  const a = (await r.json()).artwork;
  assert.equal(a.title, "Mon premier ours");
  const image = await f.request("/artworks/" + a.id + "/image");
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/jpeg");
  assert.equal(image.headers.get("cache-control"), "private, no-store");
  const meta = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(meta.width, 40);
  assert.equal(
    (
      await f.request("/artworks/" + a.id + "/image", "GET", undefined, {
        cookie: "",
      })
    ).status,
    401,
  );
  assert.equal(f.blobs.size, 1);
});
test("invalid, disguised and oversized images are rejected", async () => {
  await f.login();
  for (const img of [
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:image/png;base64,bm90YW5pbWFnZQ==",
    "x".repeat(2900001),
  ]) {
    const r = await f.request("/artworks", "POST", {
      title: "Ours",
      drawn_on: "2026-10-18",
      image: img,
    });
    assert.ok([400, 413].includes(r.status));
  }
  assert.equal(f.blobs.size, 0);
});
test("artwork title and note can be edited, delete revokes access and removes blob", async () => {
  await f.login();
  const a = (await (await upload()).json()).artwork;
  assert.equal(
    (
      await f.request("/artworks/" + a.id, "PATCH", {
        title: "Ours brun",
        note: "Deuxième regard",
      })
    ).status,
    200,
  );
  const d = await (await f.request("/state")).json();
  assert.equal(d.artworks[0].note, "Deuxième regard");
  assert.equal(
    (await f.request("/artworks/" + a.id, "DELETE", {})).status,
    200,
  );
  assert.equal((await f.request("/artworks/" + a.id + "/image")).status, 404);
  assert.equal(f.blobs.size, 0);
});
test("owner test data never crosses into the learner account", async () => {
  await f.login();
  const a = (await (await upload()).json()).artwork;
  await f.request("/lessons/1", "PATCH", { completed: true });
  await f.s.db.query(
    "UPDATE atelier_settings SET enabled=true WHERE key='gift_activated'",
  );
  await f.login("papa@example.test");
  const d = await (await f.request("/state")).json();
  assert.equal(d.user.role, "learner");
  assert.deepEqual(d.progress, {});
  assert.deepEqual(d.artworks, []);
  assert.equal((await f.request("/artworks/" + a.id + "/image")).status, 404);
  assert.equal((await f.request("/admin/status")).status, 403);
});
test("admin activation requires an exact explicit confirmation", async () => {
  await f.login();
  assert.equal(
    (await f.request("/admin/activation", "POST", { confirmation: "yes" }))
      .status,
    400,
  );
  assert.equal(
    (await (await f.request("/admin/status")).json()).gift_activated,
    false,
  );
  assert.equal(
    (
      await f.request("/admin/activation", "POST", {
        confirmation: "ACTIVER LES ENVOIS À PAPA",
      })
    ).status,
    200,
  );
  assert.equal(
    (await (await f.request("/admin/status")).json()).gift_activated,
    true,
  );
  await f.request("/admin/pause", "POST", {});
  assert.equal(
    (await (await f.request("/admin/status")).json()).gift_activated,
    false,
  );
  assert.equal(f.mails.filter((m) => m.to === "papa@example.test").length, 0);
});
test("test emails can only target the owner, even with an injected recipient", async () => {
  await f.login();
  const r = await f.request("/admin/test-email", "POST", {
    week: 1,
    to: "papa@example.test",
  });
  assert.equal(r.status, 200);
  assert.equal(f.mails.at(-1)!.to, "owner@example.test");
  assert.match(f.mails.at(-1)!.subject, /\[TEST\]/);
});
test("scheduled worker sends nothing before gift activation even with pending mail", async () => {
  await f.login();
  const uid = (await f.s.db.query("SELECT id FROM atelier_users")).rows[0].id;
  await enqueue(f.s, uid, "welcome");
  const count = f.mails.length;
  assert.deepEqual(await runMailWorker(f.s), { sent: 0, disabled: true });
  assert.equal(f.mails.length, count);
});
test("email queue uses unique deduplication keys and respects opt-out", async () => {
  await f.login();
  const uid = (await f.s.db.query("SELECT id FROM atelier_users")).rows[0].id;
  await enqueue(f.s, uid, "weekly", 1);
  await enqueue(f.s, uid, "weekly", 1);
  assert.equal(
    (await f.s.db.query("SELECT * FROM atelier_email_queue")).rows.length,
    1,
  );
  await f.request("/preferences", "PATCH", {
    notifications: false,
    reminders: false,
  });
  assert.equal(
    (await f.s.db.query("SELECT status FROM atelier_email_queue")).rows[0]
      .status,
    "cancelled",
  );
});
test("scheduled mail is sent only once when explicitly activated and opted in (mock SMTP)", async () => {
  await f.s.db.query(
    "UPDATE atelier_settings SET enabled=true WHERE key='gift_activated'",
  );
  await f.login("papa@example.test");
  await f.request("/preferences", "PATCH", {
    notifications: true,
    reminders: false,
  });
  const a = await runMailWorker(f.s);
  assert.equal(a.sent, 2);
  const b = await runMailWorker(f.s);
  assert.equal(b.sent, 0);
  const queue = (await f.s.db.query("SELECT * FROM atelier_email_queue")).rows;
  assert.equal(queue.length, 2);
  assert.ok(queue.every((q) => q.status === "sent"));
});
test("AI uses server-derived lesson context and real saved progress (mock DeepSeek)", async () => {
  await f.login();
  await f.request("/lessons/1", "PATCH", { completed: true });
  const r = await f.request("/chat", "POST", {
    lesson_id: 2,
    question: "Comment faire le ciel ?",
  });
  assert.equal(r.status, 200);
  const completion = f.requests.find((r) =>
    r.url.endsWith("/chat/completions"),
  )!;
  assert.match(completion.body.messages[0].content, /1\/16/);
  assert.match(completion.body.messages[0].content, /Un soleil se couche/);
  assert.ok(completion.body.max_tokens <= 700);
  assert.ok(!JSON.stringify(completion.body).includes("fixture-ai-key"));
  assert.equal((await (await f.request("/state")).json()).chat.length, 2);
});
test("a photo needs explicit consent and an available vision model", async () => {
  await f.login();
  const data = await photo();
  const a = await f.request("/chat", "POST", {
    lesson_id: 1,
    question: "Regarde",
    image: data,
  });
  assert.equal(a.status, 400);
  assert.equal(f.requests.length, 0);
  const b = await f.request("/chat", "POST", {
    lesson_id: 1,
    question: "Regarde",
    image: data,
    consent: true,
  });
  assert.equal(b.status, 422);
  assert.ok(f.requests.every((r) => !r.url.endsWith("/chat/completions")));
  assert.match((await b.json()).error, /n’a pas été transmise/);
});
test("DeepSeek errors stay clear and never expose provider secrets", async () => {
  await f.login();
  f.s.fetch = async () => {
    throw new Error("fixture-ai-key DATABASE_URL secret");
  };
  const r = await f.request("/chat", "POST", {
    lesson_id: 1,
    question: "Une question",
  });
  assert.equal(r.status, 503);
  const body = await r.text();
  assert.ok(!body.includes("fixture-ai-key"));
  assert.ok(!body.includes("DATABASE_URL"));
});
test("login attempts are rate limited without sending extra mail", async () => {
  for (let i = 0; i < 3; i++)
    assert.equal(
      (
        await f.request("/auth/request", "POST", {
          email: "owner@example.test",
        })
      ).status,
      200,
    );
  assert.equal(
    (await f.request("/auth/request", "POST", { email: "owner@example.test" }))
      .status,
    429,
  );
  assert.equal(f.mails.length, 3);
});
test("logout revokes the server-side session", async () => {
  await f.login();
  assert.equal((await f.request("/auth/logout", "POST", {})).status, 200);
  assert.equal((await f.request("/state")).status, 401);
});
test("vision requests contain a normalized JPEG only with declared image capability (mock DeepSeek)", async () => {
  await f.login();
  f.s.fetch = async (input, init) => {
    if (String(input).endsWith("/models"))
      return new Response(
        JSON.stringify({
          data: [{ id: "deepseek-flash", input_modalities: ["text", "image"] }],
        }),
      );
    const b = JSON.parse(String(init?.body));
    assert.equal(b.model, "deepseek-flash");
    assert.equal(b.thinking.type, "disabled");
    const attached = b.messages
      .at(-1)
      .content.find((p: any) => p.type === "image_url");
    assert.match(attached.image_url.url, /^data:image\/jpeg;base64,/);
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                "Le contour forme une masse verte. Observe son bord avant de poursuivre.",
            },
          },
        ],
      }),
    );
  };
  const r = await f.request("/chat", "POST", {
    lesson_id: 1,
    question: "Analyse ce tracé",
    image: await photo(),
    consent: true,
  });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).model, "deepseek-flash");
});
test("owner and learner address conflicts block all login sends", async () => {
  const previous = f.s.env.EMAIL_FROM;
  f.s.env.EMAIL_FROM = f.s.env.PAPA_EMAIL;
  try {
    assert.equal(
      (await f.request("/auth/request", "POST", { email: "papa@example.test" }))
        .status,
      503,
    );
    assert.equal(f.mails.length, 0);
  } finally {
    f.s.env.EMAIL_FROM = previous;
  }
});
test("private photo cleanup still runs while birthday emails are disabled", async () => {
  await f.login();
  const a = (await (await upload()).json()).artwork;
  await f.request("/artworks/" + a.id, "DELETE", {});
  await runMailWorker(f.s);
  assert.equal(
    (await f.s.db.query("SELECT id FROM atelier_artworks WHERE id=$1", [a.id]))
      .rows.length,
    0,
  );
  assert.equal(f.blobs.size, 0);
});
