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
  if (project === "desktop") await button.click(); else await button.tap();
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
  await expect(page.getByRole("button", { name: "Reprendre mon cours" })).toBeVisible();
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
  await page.getByLabel("Zone de dessin au doigt ou à la souris").scrollIntoViewIfNeeded();
  const box = await page
    .getByLabel("Zone de dessin au doigt ou à la souris")
    .boundingBox();
  if (info.project.name === "mobile") {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {type:"touchStart", touchPoints:[{x:box!.x+30,y:box!.y+40}]});
    for(let i=1;i<=8;i++) await cdp.send("Input.dispatchTouchEvent", {type:"touchMove", touchPoints:[{x:box!.x+30+i*10,y:box!.y+40+i*7}]});
    await cdp.send("Input.dispatchTouchEvent", {type:"touchEnd", touchPoints:[]});
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
  await page.goto("/#chouette/2");
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
  await login(page);
  await page.getByRole("button", { name: "Préférences", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.getByText("Administration du cadeau", { exact: true }).click();
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
    page.getByRole("button", { name: "Préférences", exact: true }),
  ).toBeFocused();
  await page.reload();
  await page.getByRole("button", { name: "Préférences", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Recevoir le courrier de l’Ours",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Quitter l’administration" }).click();
  await expect(page.getByRole("button", { name: "Reprendre mon cours" })).toBeVisible();
  await expect(page.getByLabel("Ton adresse email")).toHaveCount(0);
  await noOverflow(page);
});
