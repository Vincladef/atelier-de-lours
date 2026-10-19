import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
async function login(page: Page) {
  await page.request.post("/__test/reset");
  await page.goto("/#connexion");
  await page.getByLabel("Ton adresse email").fill("owner@example.test");
  await page.getByRole("button", { name: "Recevoir mon lien" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Si cette adresse" }),
  ).toBeVisible();
  const mails = await (await page.request.get("/__test/inbox")).json();
  const token = /token=([\w-]+)/.exec(mails.at(-1).text)![1];
  await page.goto("/#connexion?token=" + token);
  await expect(
    page.getByRole("heading", { name: "Le dessin, ça se prend à la patte." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reprendre mon cours" }),
  ).toBeVisible();
}
async function nav(page: Page, name: string, project: string) {
  const root = page.getByRole("navigation", {
    name: project === "mobile" ? "Navigation mobile" : "Navigation principale",
    exact: true,
  });
  const button = root.getByRole("button", { name, exact: true });
  if (project === "desktop") await button.click();
  else await button.tap();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
test.beforeEach(async ({ page }) => {
  await page.request.post("/__test/reset");
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Reprendre mon cours" }),
  ).toBeVisible();
  await expect(page.getByLabel("Ton adresse email")).toHaveCount(0);
});

test("four sections, zero progress, all weeks and 16 lessons", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
  await noOverflow(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-home.png`,
    fullPage: true,
  });
  await nav(
    page,
    info.project.name === "mobile" ? "Cours" : "Les cours",
    info.project.name,
  );
  for (let w = 1; w <= 8; w++) {
    const chapter = page.locator(".chapter").nth(w - 1);
    const head = chapter.locator(".chapter-head");
    if ((await head.getAttribute("aria-expanded")) !== "true")
      await head.click();
    await expect(chapter.locator(".lesson-row")).toHaveCount(2);
    for (let j = 0; j < 2; j++) {
      await chapter.locator(".lesson-row").nth(j).click();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator(".phase-btn")).toHaveCount(3);
      await noOverflow(page);
      await page.getByRole("button", { name: "Terminer", exact: true }).click();
      await page.getByRole("button", { name: "J’ai terminé ma leçon" }).click();
      await expect(page.locator(".success-moment")).toBeVisible();
      await page.getByRole("button", { name: "Toutes les semaines" }).click();
      if (j === 0) {
        const h = page
          .locator(".chapter")
          .nth(w - 1)
          .locator(".chapter-head");
        if ((await h.getAttribute("aria-expanded")) !== "true") await h.click();
      }
    }
  }
  await nav(
    page,
    info.project.name === "mobile" ? "Carnet" : "Mon carnet",
    info.project.name,
  );
  await expect(page.getByText("La première page est à toi.")).toBeVisible();
  await nav(
    page,
    info.project.name === "mobile" ? "Chouette" : "Maman Chouette",
    info.project.name,
  );
  await expect(page.getByLabel("Ma question à Maman Chouette")).toBeVisible();
  expect(errors).toEqual([]);
  await noOverflow(page);
});

test("lesson phases, steps, notes, quiz and real resume", async ({
  page,
}, info) => {
  await page.getByRole("button", { name: "Reprendre mon cours" }).click();
  await page.getByRole("button", { name: "Passer à la pratique" }).click();
  await expect(
    page.getByRole("heading", { name: "Échauffe ta main" }),
  ).toBeVisible();
  await page.getByLabel("Ce geste est fait").check();
  await page.getByRole("button", { name: "Étape suivante" }).click();
  await expect(
    page.getByRole("heading", { name: "Crée ton nuancier" }),
  ).toBeVisible();
  if (info.project.name === "desktop") {
    await page.locator(".lesson-side-tools > summary").click();
    await page
      .locator(".side-quiet")
      .locator("summary")
      .filter({ hasText: "Mes notes" })
      .click();
    await page
      .locator(".side-quiet")
      .getByRole("textbox", { name: "Mes notes" })
      .fill("Moins d’eau sur le pinceau.");
  } else {
    await page
      .getByText("Matériel & notes personnelles", { exact: true })
      .click();
    await page
      .locator(".mobile-lesson-help")
      .getByRole("textbox", { name: "Mes notes" })
      .fill("Moins d’eau sur le pinceau.");
  }
  await expect
    .poll(async () => {
      const r = await page.request.get("/api/state");
      return (await r.json()).progress[1]?.notes;
    })
    .toBe("Moins d’eau sur le pinceau.");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Crée ton nuancier" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Terminer", exact: true }).click();
  await page.getByRole("button", { name: "Ça allait", exact: true }).click();
  await page
    .getByText("Une question pour faire le point", { exact: true })
    .click();
  await page.getByRole("radio").first().check();
  await expect(page.locator(".check-feedback")).toContainText("Exact");
  await page.getByRole("button", { name: "J’ai terminé ma leçon" }).click();
  await expect(page.locator(".save-status")).toHaveText("Enregistré");
  await page.goto("/#atelier");
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "1",
  );
  await noOverflow(page);
});

test("photo upload, metadata, edit, PDF and delete", async ({ page }, info) => {
  await nav(
    page,
    info.project.name === "mobile" ? "Carnet" : "Mon carnet",
    info.project.name,
  );
  await page
    .getByRole("button", { name: "Ajouter mon premier dessin" })
    .click();
  const buffer = await sharp({
    create: { width: 400, height: 300, channels: 3, background: "#bd8d78" },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel("Importer une image", { exact: true })
    .setInputFiles({ name: "ours.png", mimeType: "image/png", buffer });
  await page
    .getByRole("textbox", { name: "Titre", exact: true })
    .fill("Mon ours");
  await page.getByLabel("Une note (facultative)").fill("Un premier essai.");
  await page.getByRole("button", { name: "Garder ce dessin" }).click();
  await expect(
    page.getByRole("heading", { name: "Mon ours", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".work-art img")).toBeVisible();
  expect(
    await page
      .locator(".work-art img")
      .evaluate((i: HTMLImageElement) => i.naturalWidth),
  ).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Modifier", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Titre", exact: true })
    .fill("Mon ours brun");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Mon ours brun", exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exporter mon carnet en PDF" })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "mon-carnet-atelier-de-lours.pdf",
  );
  await page.getByRole("button", { name: "Supprimer", exact: true }).click();
  await page
    .getByRole("button", { name: "Supprimer la photo", exact: true })
    .click();
  await expect(page.getByText("La première page est à toi.")).toBeVisible();
  await noOverflow(page);
});

test("animal studio draws, erases and saves a real sketch", async ({
  page,
}, info) => {
  await page.goto("/#studio");
  await expect(
    page.getByRole("button", { name: "Garder mon croquis" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Étude n° 02" }).click();
  await page
    .getByLabel("Zone de dessin au doigt ou à la souris")
    .scrollIntoViewIfNeeded();
  const box = await page
    .getByLabel("Zone de dessin au doigt ou à la souris")
    .boundingBox();
  if (info.project.name === "mobile") {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: box!.x + 30, y: box!.y + 40 }],
    });
    for (let i = 1; i <= 8; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: box!.x + 30 + i * 10, y: box!.y + 40 + i * 7 }],
      });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await cdp.detach();
  } else {
    await page.mouse.move(box!.x + 30, box!.y + 40);
    await page.mouse.down();
    await page.mouse.move(box!.x + 120, box!.y + 110, { steps: 15 });
    await page.mouse.up();
  }
  await page.getByLabel("Couleur du trait").fill("#ab5e40");
  await page.getByLabel("Épaisseur du trait").fill("8");
  await page.getByRole("button", { name: "Gomme", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Gomme active" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Garder mon croquis" }).click();
  await expect(page.getByAltText("Dessin à ajouter")).toBeVisible();
  await page.getByRole("button", { name: "Garder ce dessin" }).click();
  await page.goto("/#carnet");
  await expect(
    page.getByRole("heading", { name: "Étude de chouette", exact: true }),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-notebook.png`,
    fullPage: true,
  });
});

test("owl questions and explicit image consent; no fake analysis", async ({
  page,
}) => {
  await page.goto("/#chouette/1");
  await page
    .getByLabel("Ma question à Maman Chouette")
    .fill("Comment faire mon ciel ?");
  await page.getByRole("button", { name: "Envoyer" }).click();
  await expect(page.getByRole("log")).toContainText(
    "Pose trois formes légères",
  );
  const buffer = await sharp({
    create: { width: 100, height: 100, channels: 3, background: "#fff" },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel("Joindre une photo à ma question")
    .setInputFiles({ name: "test.png", mimeType: "image/png", buffer });
  await page
    .getByLabel("Ma question à Maman Chouette")
    .fill("Regarde mon dessin");
  await expect(page.getByRole("button", { name: "Envoyer" })).toBeDisabled();
  await page.getByLabel("J’autorise l’envoi de cette photo").check();
  await page.getByRole("button", { name: "Envoyer" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Ta photo n’a pas été transmise",
  );
  await noOverflow(page);
});

test("settings are keyboard accessible and gift stays disabled", async ({
  page,
}, info) => {
  await page
    .getByRole("button", { name: "Mes préférences", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Mes préférences",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await page.getByText("La formation et les emails", { exact: true }).click();
  await expect(
    dialog.getByText("Les envois à Papa sont désactivés."),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Recevoir le courrier de l’Ours",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Recevoir le courrier de l’Ours",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mes préférences", exact: true }),
  ).toBeFocused();
  await page.reload();
  await page
    .getByRole("button", { name: "Mes préférences", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Recevoir le courrier de l’Ours",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Reprendre mon cours" }),
  ).toBeVisible();
  await expect(page.getByLabel("Ton adresse email")).toHaveCount(0);
  await noOverflow(page);
});

test("contextual lesson chat preserves the gesture, saves text and photo history, and closes immediately", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.request.post("/__test/vision");
  await page.getByRole("button", { name: "Reprendre mon cours" }).click();
  await page.getByRole("button", { name: "Passer à la pratique" }).click();
  await page.getByLabel("Ce geste est fait").check();
  await page.getByRole("button", { name: "Étape suivante" }).click();
  await expect(
    page.getByRole("heading", { name: "Crée ton nuancier" }),
  ).toBeVisible();
  const original = page.url();
  const trigger =
    info.project.name === "desktop"
      ? page.getByRole("button", { name: "Lui demander de l’aide" })
      : page.getByRole("button", { name: "Demander à Maman Chouette" });
  await trigger.click();
  const panel =
    info.project.name === "desktop"
      ? page.locator(".lesson-chat-panel")
      : page.getByRole("dialog", { name: "Maman Chouette" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Dessiner · Geste 2");
  if (info.project.name === "desktop")
    await expect(
      page.getByRole("heading", { name: "Crée ton nuancier" }),
    ).toBeInViewport();
  await panel
    .getByLabel("Ma question à Maman Chouette")
    .fill("Comment doser l’eau dans ce nuancier ?");
  await expect(
    panel.getByLabel("Ma question à Maman Chouette"),
  ).toBeInViewport();
  const sent = page.waitForRequest(
    (r) => r.url().endsWith("/api/chat") && r.method() === "POST",
  );
  await panel.getByRole("button", { name: "Envoyer" }).click();
  expect((await sent).postDataJSON().stage).toEqual({ phase: "draw", step: 1 });
  await expect(panel.getByRole("log")).toContainText(
    "Pose trois formes légères",
  );
  expect(page.url()).toBe(original);
  if (info.project.name === "mobile") {
    await page.setViewportSize({ width: 390, height: 460 });
    await expect(
      panel.getByLabel("Ma question à Maman Chouette"),
    ).toBeInViewport();
    await expect(
      panel.getByRole("button", { name: "Envoyer" }),
    ).toBeInViewport();
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await panel
    .getByLabel("Ma question à Maman Chouette")
    .fill("Mon brouillon reste ici");
  await panel.getByRole("button", { name: "Fermer la conversation" }).click();
  await expect(panel).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Crée ton nuancier" }),
  ).toBeVisible();
  await trigger.click();
  await expect(panel.getByLabel("Ma question à Maman Chouette")).toHaveValue(
    "Mon brouillon reste ici",
  );
  const photo = await sharp({
    create: { width: 100, height: 100, channels: 3, background: "#dfcaaa" },
  })
    .png()
    .toBuffer();
  await panel.getByLabel("Joindre une photo à ma question").setInputFiles({
    name: "nuancier.png",
    mimeType: "image/png",
    buffer: photo,
  });
  await panel
    .getByLabel("Ma question à Maman Chouette")
    .fill("Voici mon nuancier, quel geste améliorer ?");
  await expect(panel.getByRole("button", { name: "Envoyer" })).toBeDisabled();
  await panel.getByLabel("J’autorise l’envoi de cette photo").check();
  await panel.getByRole("button", { name: "Envoyer" }).click();
  await expect(panel.getByRole("log")).toContainText("Une photo a été jointe");
  await noOverflow(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-lesson-chat.png`,
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
  const state = await (await page.request.get("/api/state")).json();
  expect(state.progress[1].step).toBe(1);
  expect(state.progress[1].checked_steps).toContain(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Crée ton nuancier" }),
  ).toBeVisible();
  await page.goto("/#chouette/1");
  await expect(page.getByRole("log")).toContainText("Comment doser l’eau");
  await expect(page.getByRole("log")).toContainText("Voici mon nuancier");
  await expect(page.getByRole("log")).toContainText("Dessiner · Geste 2");
  expect(errors).toEqual([]);
});

test("animal photographs recover from broken sources", async ({ page }) => {
  await page.route("**/photos/oursRiviere.webp", (r) => r.abort());
  await page.route("https://images.unsplash.com/**", (r) => r.abort());
  await page.goto("/#studio");
  const image = page.locator(".animal-select").first().locator("img");
  await expect(image).toHaveAttribute("src", "/photos/oursForet.webp");
  await expect
    .poll(() => image.evaluate((i: HTMLImageElement) => i.naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.getByText("Photographie indisponible")).toHaveCount(0);
});

test("the next message follows the page and gesture currently displayed", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.getByRole("button", { name: "Reprendre mon cours" }).click();
  await page.getByRole("button", { name: "Passer à la pratique" }).click();
  const trigger = page.getByRole("button", {
    name:
      info.project.name === "desktop"
        ? "Lui demander de l’aide"
        : "Demander à Maman Chouette",
    exact: true,
  });
  const panel =
    info.project.name === "desktop"
      ? page.locator(".lesson-chat-panel")
      : page.getByRole("dialog", { name: "Maman Chouette" });
  async function ask(expected: { phase: string; step: number }) {
    await panel
      .getByLabel("Ma question à Maman Chouette")
      .fill("Que dois-je faire ici ?");
    const sent = page.waitForRequest(
      (r) => r.url().endsWith("/api/chat") && r.method() === "POST",
    );
    const answered = page.waitForResponse(
      (r) => r.url().endsWith("/api/chat") && r.request().method() === "POST",
    );
    await panel.getByRole("button", { name: "Envoyer" }).click();
    const body = (await sent).postDataJSON();
    expect(body.stage).toEqual(expected);
    expect(body.page).toBe("lesson");
    expect((await answered).status()).toBe(200);
    await expect(
      panel.getByLabel("Ma question à Maman Chouette"),
    ).toBeEnabled();
  }
  await expect(
    page.getByRole("heading", { name: "Échauffe ta main" }),
  ).toBeVisible();
  await trigger.click();
  await ask({ phase: "draw", step: 0 });
  if (info.project.name !== "desktop")
    await panel.getByRole("button", { name: "Fermer la conversation" }).click();
  await page.getByRole("button", { name: "Étape suivante" }).click();
  await page.getByRole("button", { name: "Étape suivante" }).click();
  await expect(
    page.getByRole("heading", { name: "Ajoute une goutte d’eau" }),
  ).toBeVisible();
  if (info.project.name !== "desktop") await trigger.click();
  await ask({ phase: "draw", step: 2 });
  if (info.project.name !== "desktop")
    await panel.getByRole("button", { name: "Fermer la conversation" }).click();
  await page.getByRole("button", { name: "Regarder", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Regarde, puis essaie." }),
  ).toBeVisible();
  if (info.project.name !== "desktop") await trigger.click();
  await ask({ phase: "observe", step: 2 });
  await panel.getByRole("button", { name: "Fermer la conversation" }).click();
  await page.goto("/#chouette/1");
  await page
    .getByLabel("Ma question à Maman Chouette")
    .fill("Je suis dans ton bureau.");
  const sent = page.waitForRequest(
    (r) => r.url().endsWith("/api/chat") && r.method() === "POST",
  );
  await page.getByRole("button", { name: "Envoyer" }).click();
  expect((await sent).postDataJSON().page).toBe("owl");
  await expect(page.getByRole("log")).toContainText("Je suis dans ton bureau.");
  expect(errors).toEqual([]);
});

test("future lessons stay locked until a confirmed save, and a saved success unlocks the next one", async ({
  page,
}) => {
  await page.goto("/#cours");
  const rows = page.locator(".lesson-row");
  await expect(rows.nth(0)).toBeEnabled();
  await expect(rows.nth(1)).toBeDisabled();
  await page.goto("/#cours/2");
  await expect(
    page.getByRole("heading", { name: "Une séance à la fois." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reprendre ma séance" }).click();
  await page.getByRole("button", { name: "Terminer", exact: true }).click();
  await page.route("**/api/lessons/1", async (route) => {
    if (route.request().postDataJSON()?.completed)
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Enregistrement indisponible" }),
      });
    return route.continue();
  });
  await page.getByRole("button", { name: "J’ai terminé ma leçon" }).click();
  await expect(page.locator(".save-warning")).toBeVisible();
  await expect(page.locator(".success-moment")).toHaveCount(0);
  await page.goto("/#cours/2");
  await expect(
    page.getByRole("heading", { name: "Une séance à la fois." }),
  ).toBeVisible();
  await page.unroute("**/api/lessons/1");
  await page.getByRole("button", { name: "Réessayer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Un soleil se couche" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Terminer", exact: true }).click();
  await page.getByRole("button", { name: "J’ai terminé ma leçon" }).click();
  await expect(page.locator(".success-moment")).toBeVisible();
  await expect(page.locator(".success-tick")).toHaveCSS(
    "animation-name",
    "success-pop",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".success-tick")).toHaveCSS(
    "animation-name",
    "none",
  );
  await page.getByRole("button", { name: "Le cours suivant" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("weekly email preview shows a branded message and a working application destination", async ({
  page,
}, info) => {
  await page
    .getByRole("button", { name: "Mes préférences", exact: true })
    .click();
  await page
    .getByText("Le courrier des huit semaines", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Aperçu", exact: true })
    .first()
    .click();
  const preview = page.frameLocator('iframe[title="Aperçu de l’email"]');
  await expect(
    preview.getByRole("heading", {
      name: "Faire connaissance avec les feutres",
    }),
  ).toBeVisible();
  await expect(
    preview.getByRole("link", { name: "Ouvrir ma séance" }),
  ).toHaveAttribute("href", "https://atelier-de-lours.netlify.app/#cours/1");
  await page
    .locator('iframe[title="Aperçu de l’email"]')
    .scrollIntoViewIfNeeded();
  await preview.locator("body").screenshot({
    path: `test-results/${info.project.name}-email-preview.png`,
  });
  await expect
    .poll(() =>
      preview
        .locator("body")
        .evaluate(
          (e) => e.scrollWidth <= e.ownerDocument.documentElement.clientWidth,
        ),
    )
    .toBe(true);
  await noOverflow(page);
});

test("direct formation controls reset the course and explicitly send only one invitation (mock SMTP)", async ({
  page,
}, info) => {
  await page
    .getByRole("button", { name: "Mes préférences", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Accès propriétaire" }),
  ).toHaveCount(0);
  await page.getByText("La formation et les emails", { exact: true }).click();
  await page
    .getByText("Recommencer la formation de Papa", { exact: true })
    .click();
  const reset = page.getByRole("button", {
    name: "Réinitialiser la formation de Papa",
  });
  await expect(reset).toBeDisabled();
  await expect(
    page.getByLabel("Supprimer aussi les dessins"),
  ).not.toBeChecked();
  await page
    .getByLabel("Écris « RECOMMENCER » pour confirmer")
    .fill("RECOMMENCER");
  await reset.click();
  await expect(page.locator(".toast")).toContainText("remise à zéro");
  await page.getByText("Inviter Papa à commencer", { exact: true }).click();
  const send = page.getByRole("button", {
    name: "Envoyer l’invitation à Papa",
  });
  await expect(send).toBeDisabled();
  const preview = page.frameLocator('iframe[title="Aperçu de l’invitation"]');
  await expect(
    preview.getByRole("link", { name: "Ouvrir ma séance" }),
  ).toHaveAttribute("href", "https://atelier-de-lours.netlify.app/#cours/1");
  await page
    .getByLabel("Écris « INVITER PAPA » pour confirmer l’envoi")
    .fill("INVITER PAPA");
  await send.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `test-results/${info.project.name}-owner-controls.png`,
    fullPage: true,
  });
  await send.click();
  await expect(
    page.getByText("L’invitation a déjà été envoyée pour ce parcours."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Recevoir le courrier de l’Ours",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  const inbox = await (await page.request.get("/__test/inbox")).json();
  expect(inbox.filter((m: any) => m.to === "papa@example.test")).toHaveLength(
    1,
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Mes préférences", exact: true })
    .click();
  await page.getByText("La formation et les emails", { exact: true }).click();
  await page.getByText("Inviter Papa à commencer", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Envoyer l’invitation à Papa" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Suspendre les envois à Papa" })
    .click();
  await expect(
    page.getByText("Les envois à Papa sont désactivés."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Réautoriser les courriers de formation" })
    .click();
  await expect(page.getByText("Le cadeau est ouvert.")).toBeVisible();
  const finalInbox = await (await page.request.get("/__test/inbox")).json();
  expect(
    finalInbox.filter((m: any) => m.to === "papa@example.test"),
  ).toHaveLength(1);
});
