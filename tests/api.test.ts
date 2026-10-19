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
test("shared workshop opens at zero without login, while admin requires a session", async () => {
  const state = await (await f.request("/state")).json();
  assert.equal(state.user.role, "learner");
  assert.deepEqual(state.progress, {});
  assert.deepEqual(state.artworks, []);
  assert.equal(f.mails.length, 0);
  for (const [path, method, data] of [
    ["/admin/status", "GET", undefined],
    [
      "/admin/activation",
      "POST",
      { confirmation: "ACTIVER LES ENVOIS À PAPA" },
    ],
    ["/admin/test-email", "POST", { week: 1 }],
  ] as const)
    assert.equal((await f.request(path, method, data)).status, 401);
  assert.equal(
    (await f.request("/lessons/1", "PATCH", { notes: "Sans connexion" }))
      .status,
    200,
  );
  assert.equal(
    (
      await (
        await f.request("/state", "GET", undefined, {
          cookie: "atelier_session=" + "x".repeat(43),
        })
      ).json()
    ).progress[1].notes,
    "Sans connexion",
  );
  const uploaded = await upload();
  const artwork = (await uploaded.json()).artwork;
  assert.equal((await f.request(`/artworks/${artwork.id}/image`)).status, 200);
  assert.equal(
    (
      await f.s.db.query(
        "SELECT enabled FROM atelier_settings WHERE key='gift_activated'",
      )
    ).rows[0].enabled,
    false,
  );
  assert.equal(f.mails.length, 0);
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
  await f.request("/lessons/1", "PATCH", { completed: true });
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
    404,
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
  assert.equal((await (await f.request("/state")).json()).user.role, "learner");
  assert.equal((await f.request("/admin/status")).status, 401);
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

test("inline AI uses the displayed gesture even before autosave, stores context, and leaves progress intact", async () => {
  await f.request("/lessons/1", "PATCH", {
    phase: "draw",
    step: 0,
    notes: "Mon papier attend",
    checked_steps: [0],
  });
  const r = await f.request("/chat", "POST", {
    lesson_id: 1,
    question: "Comment faire ce geste ?",
    stage: { phase: "draw", step: 1, instruction: "INSTRUCTION NON FIABLE" },
  });
  assert.equal(r.status, 200);
  const prompt = f.requests.find((r) => r.url.endsWith("/chat/completions"))!
    .body.messages[0].content;
  assert.match(prompt, /Phase actuellement affichée : draw/);
  assert.match(prompt, /Geste 2\/4/);
  assert.match(prompt, /Crée ton nuancier/);
  assert.match(prompt, /Gestes cochés dans cette séance : \[0\]/);
  assert.ok(!prompt.includes("INSTRUCTION NON FIABLE"));
  const state = await (await f.request("/state")).json();
  assert.equal(state.progress[1].step, 0);
  assert.equal(state.progress[1].notes, "Mon papier attend");
  const history = await (await f.request("/chat?lesson_id=1")).json();
  assert.equal(history.messages.length, 2);
  assert.ok(
    history.messages.every((m: any) => m.phase === "draw" && m.step === 1),
  );
  assert.equal(history.has_more, false);
  await f.login();
  assert.deepEqual(
    (await (await f.request("/chat?lesson_id=1")).json()).messages,
    [],
  );
});

test("chat context rejects invalid stages before spending an API request", async () => {
  for (const stage of [
    null,
    { phase: "other", step: 0 },
    { phase: "draw", step: 4 },
    { phase: "draw", step: -1 },
  ]) {
    assert.equal(
      (
        await f.request("/chat", "POST", {
          lesson_id: 1,
          question: "Aide",
          stage,
        })
      ).status,
      400,
    );
  }
  assert.equal(f.requests.length, 0);
});

test("conversation history retrieves older exchanges by lesson without gaps or cross-account access", async () => {
  await f.request("/state");
  const user = (
    await f.s.db.query("SELECT id FROM atelier_users WHERE role='learner'")
  ).rows[0];
  for (let i = 0; i < 85; i++)
    await f.s.db.query(
      "INSERT INTO atelier_chat(user_id,lesson_id,role,content,phase,step) VALUES ($1,$2,'user',$3,'draw',0)",
      [user.id, i === 84 ? 2 : 1, `Échange ${i}`],
    );
  const all: any[] = [];
  let before = "";
  for (let page = 0; page < 3; page++) {
    const r = await f.request(`/chat?lesson_id=1${before}`);
    assert.equal(r.status, 200);
    const d = await r.json();
    all.unshift(...d.messages);
    if (!d.has_more) break;
    before = `&before=${d.messages[0].id}`;
  }
  assert.equal(all.length, 84);
  assert.equal(new Set(all.map((m) => m.id)).size, 84);
  assert.equal(all[0].content, "Échange 0");
  assert.equal(all.at(-1).content, "Échange 83");
  assert.equal((await f.request("/chat?lesson_id=1&before=-1")).status, 400);
  assert.equal((await f.request("/chat?lesson_id=17")).status, 400);
});

test("the current page replaces the previous gesture in the DeepSeek system context", async () => {
  for (const [step, title, instruction] of [
    [
      0,
      "Échauffe ta main",
      "Trace cinq lignes, cinq courbes et cinq petits cercles.",
    ],
    [
      2,
      "Ajoute une goutte d’eau",
      "Dilue trois bandes de couleur avec des quantités d’eau différentes.",
    ],
  ] as const) {
    const response = await f.request("/chat", "POST", {
      lesson_id: 1,
      page: "lesson",
      stage: { phase: "draw", step },
      question: "Que dois-je faire ici ?",
    });
    assert.equal(response.status, 200);
    const system = f.requests
      .filter((r) => r.url.endsWith("/chat/completions"))
      .at(-1)!.body.messages[0].content;
    assert.ok(system.includes(`Titre de la page ouverte : ${title}`));
    assert.ok(system.includes(instruction));
    assert.ok(
      system.includes('"lesson_title":"Faire connaissance avec les feutres"'),
    );
    assert.ok(system.includes('"phase":"Dessiner"'));
    assert.ok(system.includes("Un pinceau légèrement humide suffit"));
    assert.ok(system.includes("Si le papier gondole"));
    if (step === 2)
      assert.ok(
        !system.includes(
          "Trace cinq lignes, cinq courbes et cinq petits cercles.",
        ),
      );
  }
});

test("watch and finish pages provide their own explanations instead of another exercise", async () => {
  const observed = await f.request("/chat", "POST", {
    lesson_id: 1,
    page: "lesson",
    stage: { phase: "observe", step: 2 },
    question: "Que regarder ?",
  });
  assert.equal(observed.status, 200);
  let system = f.requests
    .filter((r) => r.url.endsWith("/chat/completions"))
    .at(-1)!.body.messages[0].content;
  assert.ok(
    system.includes("Titre de la page ouverte : Regarde, puis essaie."),
  );
  assert.ok(system.includes("Dans la vidéo, observe trois gestes"));
  assert.ok(system.includes("Bienvenue dans ton atelier"));
  assert.ok(!system.includes("Dilue trois bandes de couleur"));
  await f.request("/lessons/1", "PATCH", { completed: true });
  const finished = await f.request("/chat", "POST", {
    lesson_id: 1,
    page: "lesson",
    stage: { phase: "finish", step: 2 },
    question: "Que garder ?",
  });
  assert.equal(finished.status, 200);
  system = f.requests.filter((r) => r.url.endsWith("/chat/completions")).at(-1)!
    .body.messages[0].content;
  assert.ok(
    system.includes(
      "Titre de la page ouverte : Cette séance est dans le carnet.",
    ),
  );
  assert.ok(system.includes("Garde ton nuancier"));
});

test("the standalone teacher page is distinguished from a lesson currently on screen", async () => {
  const r = await f.request("/chat", "POST", {
    lesson_id: 1,
    page: "owl",
    question: "Comment commencer ?",
  });
  assert.equal(r.status, 200);
  const system = f.requests
    .filter((r) => r.url.endsWith("/chat/completions"))
    .at(-1)!.body.messages[0].content;
  assert.ok(
    system.includes(
      "Titre de la page ouverte : Tu as une question, mon Ours ?",
    ),
  );
  assert.ok(system.includes("séance de référence, non affichée"));
  const count = f.requests.length;
  assert.equal(
    (
      await f.request("/chat", "POST", {
        lesson_id: 1,
        page: "unknown",
        question: "Aide",
      })
    ).status,
    400,
  );
  assert.equal(f.requests.length, count);
});

test("lesson access requires every preceding validation on the server", async () => {
  for (const id of [2, 8, 16]) {
    assert.equal(
      (await f.request(`/lessons/${id}`, "PATCH", { phase: "draw" })).status,
      403,
    );
    assert.equal(
      (await f.request(`/lessons/${id}`, "PATCH", { completed: true })).status,
      403,
    );
    assert.equal((await f.request(`/chat?lesson_id=${id}`)).status, 403);
    assert.equal(
      (
        await f.request("/chat", "POST", {
          lesson_id: id,
          question: "Aide",
          page: "lesson",
        })
      ).status,
      403,
    );
  }
  assert.equal(f.requests.length, 0);
  await f.request("/lessons/1", "PATCH", { checked_steps: [0, 1, 2, 3] });
  assert.equal(
    (await f.request("/lessons/2", "PATCH", { phase: "draw" })).status,
    403,
  );
  await f.request("/lessons/1", "PATCH", { completed: true });
  assert.equal(
    (await f.request("/lessons/2", "PATCH", { phase: "draw" })).status,
    200,
  );
  assert.equal(
    (await f.request("/lessons/3", "PATCH", { completed: true })).status,
    403,
  );
  assert.equal(
    (await f.request("/lessons/1", "PATCH", { notes: "Je refais le cours" }))
      .status,
    200,
  );
});

test("weekly mail button follows real next lesson rather than the first lesson of the week", async () => {
  await f.request("/state");
  await f.request("/lessons/1", "PATCH", { completed: true });
  await f.request("/preferences", "PATCH", {
    notifications: true,
    reminders: false,
  });
  // Isolated SMTP adapter only; never enables the production gift.
  await f.s.db.query(
    "UPDATE atelier_settings SET enabled=true WHERE key='gift_activated'",
  );
  await runMailWorker(f.s);
  assert.equal(f.mails.length, 2);
  for (const mail of f.mails) {
    assert.ok(mail.html?.includes("/#cours/2"));
    assert.ok(mail.text.includes("/#cours/2"));
    assert.ok(mail.html?.includes("Un soleil se couche"));
  }
});

test("stale weekly mail is cancelled after progress advances rather than describing an old week", async () => {
  await f.request("/state");
  const user = (
    await f.s.db.query("SELECT id FROM atelier_users WHERE role='learner'")
  ).rows[0];
  await enqueue(f.s, user.id, "weekly", 1);
  for (const id of [1, 2])
    await f.request(`/lessons/${id}`, "PATCH", { completed: true });
  await f.request("/preferences", "PATCH", {
    notifications: true,
    reminders: false,
  });
  await f.s.db.query(
    "UPDATE atelier_users SET training_started_at=now()-interval '8 days' WHERE id=$1",
    [user.id],
  );
  await f.s.db.query(
    "UPDATE atelier_settings SET enabled=true WHERE key='gift_activated'",
  );
  await runMailWorker(f.s);
  const row = (
    await f.s.db.query(
      "SELECT status FROM atelier_email_queue WHERE kind='weekly' AND week=1",
    )
  ).rows[0];
  assert.equal(row.status, "cancelled");
  assert.ok(f.mails.every((m) => m.text.includes("/#cours/3")));
});

test("reset and invitation require an owner session and exact confirmation", async () => {
  for (const path of ["/admin/reset", "/admin/invite"])
    assert.equal((await f.request(path, "POST", {})).status, 401);
  await f.request("/state");
  await f.login();
  for (const path of ["/admin/reset", "/admin/invite"])
    assert.equal(
      (await f.request(path, "POST", { confirmation: "yes" })).status,
      400,
    );
  assert.equal(f.mails.filter((m) => m.to === "papa@example.test").length, 0);
});

test("reset clears only Papa's training, preserves his drawings by default and starts a fresh mail cycle", async () => {
  await f.request("/lessons/1", "PATCH", {
    completed: true,
    notes: "Avant reset",
  });
  const artwork = (await (await upload()).json()).artwork;
  const learner = (
    await f.s.db.query("SELECT * FROM atelier_users WHERE role='learner'")
  ).rows[0];
  await enqueue(f.s, learner.id, "weekly", 1);
  await f.request("/chat", "POST", { lesson_id: 1, question: "Un conseil ?" });
  await f.login();
  await f.request("/lessons/1", "PATCH", { notes: "Notes du propriétaire" });
  const mailCount = f.mails.length;
  assert.equal(
    (
      await f.request("/admin/reset", "POST", {
        confirmation: "RECOMMENCER",
        erase_notebook: false,
      })
    ).status,
    200,
  );
  const papa = await (
    await f.request("/state", "GET", undefined, { cookie: "" })
  ).json();
  assert.deepEqual(papa.progress, {});
  assert.deepEqual(papa.chat, []);
  assert.deepEqual(papa.reviews, {});
  assert.equal(papa.artworks.length, 1);
  assert.equal(papa.artworks[0].id, artwork.id);
  assert.equal(papa.user.notifications, false);
  const user = (
    await f.s.db.query("SELECT * FROM atelier_users WHERE id=$1", [learner.id])
  ).rows[0];
  assert.notEqual(user.training_run, learner.training_run);
  assert.equal(
    (await (await f.request("/state")).json()).progress[1].notes,
    "Notes du propriétaire",
  );
  assert.equal(
    (await (await f.request("/admin/status")).json()).gift_activated,
    false,
  );
  assert.equal(f.mails.length, mailCount);
  assert.equal(
    (
      await f.s.db.query(
        "SELECT status FROM atelier_email_queue WHERE user_id=$1",
        [learner.id],
      )
    ).rows[0].status,
    "cancelled",
  );
});

test("explicit notebook reset revokes photograph access and cleanup deletes the bytes", async () => {
  const a = (await (await upload()).json()).artwork;
  await f.login();
  assert.equal(
    (
      await f.request("/admin/reset", "POST", {
        confirmation: "RECOMMENCER",
        erase_notebook: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await f.request(`/artworks/${a.id}/image`, "GET", undefined, {
        cookie: "",
      })
    ).status,
    404,
  );
  await runMailWorker(f.s);
  assert.equal(f.blobs.size, 0);
});

test("explicit invitation sends one styled mail, subscribes only as chosen and cannot be duplicated", async () => {
  await f.request("/state");
  await f.s.db.query("UPDATE atelier_users SET training_started_at=now()-interval '30 days' WHERE role='learner'");
  await f.login();
  const b = {
    confirmation: "INVITER PAPA",
    notifications: true,
    to: "somebody@example.test",
  };
  const r = await f.request("/admin/invite", "POST", b);
  assert.equal(r.status, 200);
  let papa = f.mails.filter((m) => m.to === "papa@example.test");
  assert.equal(papa.length, 1);
  assert.match(papa[0].html!, /#cours\/1/);
  assert.match(papa[0].text, /#cours\/1/);
  assert.equal((await f.request("/admin/invite", "POST", b)).status, 200);
  assert.equal(f.mails.filter((m) => m.to === "papa@example.test").length, 1);
  assert.equal(
    (await (await f.request("/admin/status")).json()).invitation.status,
    "sent",
  );
  assert.equal(
    (await (await f.request("/state", "GET", undefined, { cookie: "" })).json())
      .user.notifications,
    true,
  );
  const start=(await f.s.db.query("SELECT training_started_at FROM atelier_users WHERE role='learner'")).rows[0].training_started_at;
  assert.ok(Date.now()-new Date(start).getTime()<60000);
  assert.equal((await runMailWorker(f.s)).sent, 0);
  await f.request("/admin/reset", "POST", {
    confirmation: "RECOMMENCER",
    erase_notebook: false,
  });
  assert.equal(
    (
      await f.request("/admin/invite", "POST", {
        confirmation: "INVITER PAPA",
        notifications: false,
      })
    ).status,
    200,
  );
  assert.equal(f.mails.filter((m) => m.to === "papa@example.test").length, 2);
  assert.equal(
    (await (await f.request("/state", "GET", undefined, { cookie: "" })).json())
      .user.notifications,
    false,
  );
});

test("an ambiguous SMTP failure is never blindly retried and does not enable follow-up mail", async () => {
  await f.login();
  const send = f.s.send;
  let attempts = 0;
  f.s.send = async () => {
    attempts++;
    throw new Error("timeout");
  };
  try {
    const b = { confirmation: "INVITER PAPA", notifications: true };
    assert.equal((await f.request("/admin/invite", "POST", b)).status, 503);
    assert.equal((await f.request("/admin/invite", "POST", b)).status, 409);
    assert.equal(attempts, 1);
    assert.equal(
      (await (await f.request("/admin/status")).json()).invitation.status,
      "uncertain",
    );
    assert.equal(
      (
        await (
          await f.request("/state", "GET", undefined, { cookie: "" })
        ).json()
      ).user.notifications,
      false,
    );
  } finally {
    f.s.send = send;
  }
});

test("an active dispatch lease prevents a reset or a competing invitation", async () => {
  await f.login();
  await f.s.db.query(
    "INSERT INTO atelier_mail_lock(key,token,expires_at) VALUES ('dispatch',gen_random_uuid(),now()+interval '1 minute')",
  );
  assert.equal(
    (
      await f.request("/admin/reset", "POST", {
        confirmation: "RECOMMENCER",
        erase_notebook: false,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await f.request("/admin/invite", "POST", {
        confirmation: "INVITER PAPA",
        notifications: false,
      })
    ).status,
    409,
  );
  assert.equal(f.mails.filter((m) => m.to === "papa@example.test").length, 0);
});

test("a failed reset rolls back training and notebook changes together", async () => {
  await f.request("/lessons/1", "PATCH", { notes: "À conserver" });
  const artwork = (await (await upload()).json()).artwork;
  await f.login();
  const connect = f.s.db.connect;
  f.s.db.connect = async () => {
    const c = await connect();
    return {
      release: c.release,
      query: async (sql: string, params?: any[]) => {
        if (sql.startsWith("UPDATE atelier_users SET training_run"))
          throw new Error("isolated reset fault");
        return c.query(sql, params);
      },
    };
  };
  try {
    assert.equal(
      (
        await f.request("/admin/reset", "POST", {
          confirmation: "RECOMMENCER",
          erase_notebook: true,
        })
      ).status,
      503,
    );
  } finally {
    f.s.db.connect = connect;
  }
  const state = await (
    await f.request("/state", "GET", undefined, { cookie: "" })
  ).json();
  assert.equal(state.progress[1].notes, "À conserver");
  assert.equal(state.artworks[0].id, artwork.id);
});

test("an explicit SMTP rejection can be retried manually without resending an accepted invitation", async () => {
  await f.login();
  const send = f.s.send;
  f.s.send = async () => {
    throw Object.assign(new Error("isolated SMTP refusal"), {
      responseCode: 535,
    });
  };
  try {
    assert.equal(
      (
        await f.request("/admin/invite", "POST", {
          confirmation: "INVITER PAPA",
          notifications: false,
        })
      ).status,
      503,
    );
    assert.equal(
      (await (await f.request("/admin/status")).json()).invitation.status,
      "failed",
    );
  } finally {
    f.s.send = send;
  }
  assert.equal(
    (
      await f.request("/admin/invite", "POST", {
        confirmation: "INVITER PAPA",
        notifications: false,
      })
    ).status,
    200,
  );
  assert.equal(f.mails.filter((m) => m.to === "papa@example.test").length, 1);
});
