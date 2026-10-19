import { lessons, weeklyEmails, weeks } from "./curriculum";
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function mailContent(
  kind: string,
  week: number | null,
  options: {
    siteUrl?: string;
    nextLessonId?: number | null;
    test?: boolean;
  } = {},
) {
  const w = Math.min(8, Math.max(1, week || 1));
  const site = new URL(
    options.siteUrl || "https://atelier-de-lours.netlify.app",
  ).origin;
  const nextId =
    options.nextLessonId === undefined
      ? kind === "congratulations"
        ? w === 8
          ? null
          : w * 2 + 1
        : (w - 1) * 2 + 1
      : options.nextLessonId;
  const lesson = nextId ? lessons[nextId - 1] : null;
  const subject =
    kind === "welcome"
      ? "Bienvenue dans ton atelier"
      : kind === "congratulations"
        ? "Une semaine de dessin dans le carnet"
        : kind === "reminder"
          ? "Une feuille t’attend"
          : weeklyEmails[w - 1].subject;
  const intro =
    kind === "welcome"
      ? "Joyeux anniversaire, Papa Ours ! Une feuille, tes feutres et un peu de temps pour toi : ton atelier est ouvert."
      : kind === "congratulations"
        ? `Tu as terminé les deux séances de « ${weeks[w - 1].name} ». ${weeks[w - 1].completion.message}`
        : kind === "reminder"
          ? "Tes feutres sont toujours là. Si tu as un moment, reprends ta séance. Maman Chouette garde la place."
          : `Cette semaine : ${weeks[w - 1].name}. ${weeks[w - 1].subtitle}`;
  const description = lesson
    ? `Séance ${lesson.index} · ${lesson.title}\n${lesson.objective}\n${lesson.minutes} minutes · ${lesson.desc}`
    : "Les seize séances sont terminées. Tu peux revenir sur tes exercices et retrouver tous tes dessins dans ton carnet.";
  const href = `${site}/#${lesson ? `cours/${lesson.index}` : "carnet"}`;
  const button = lesson ? "Ouvrir ma séance" : "Retrouver mon carnet";
  const footer =
    "Pour arrêter ces messages : ouvre Préférences dans l’atelier et désactive le courrier.";
  const test = options.test
    ? "Email de test réservé au propriétaire. Aucun envoi à Papa."
    : "";
  const text = `Bonjour Papa Ours,\n\n${intro}\n\n${lesson ? "Ta prochaine séance" : "Ton carnet reste ouvert"}\n${description}\n\n${button} : ${href}\n\nÀ ton rythme,\nMaman Chouette\n\n${footer}${test ? `\n\n${test}` : ""}`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head><body style="margin:0;background:#f7f2e7;color:#282e25;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${escape(lesson ? `Ta prochaine séance : ${lesson.title}` : "Les dessins continuent dans ton carnet.")}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f2e7"><tr><td align="center" style="padding:28px 16px"><table role="presentation" width="560" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px"><tr><td style="padding:0 0 22px;border-bottom:1px solid #dfd9c8;font-family:Georgia,serif;font-size:27px;color:#304c3e">L’Atelier de l’Ours</td></tr><tr><td style="padding:24px 0;font-size:17px;line-height:1.65"><p style="margin:0 0 16px">Bonjour Papa Ours,</p><p style="margin:0">${escape(intro)}</p></td></tr><tr><td style="padding:24px;background:#fffdf8;border:1px solid #dfd9c8"><p style="margin:0 0 10px;color:#77553d;font-size:14px">${lesson ? `TA PROCHAINE SÉANCE · ${lesson.index}/16` : "TON CARNET"}</p><h1 style="font-family:Georgia,serif;font-size:27px;font-weight:normal;line-height:1.2;margin:0 0 14px">${escape(lesson?.title || "La suite t’appartient.")}</h1><p style="font-size:17px;line-height:1.6;margin:0 0 12px">${escape(lesson?.objective || description)}</p>${lesson ? `<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#60665c">${lesson.minutes} minutes · ${escape(lesson.desc)}</p>` : ""}<table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#304c3e" style="border-radius:7px"><a href="${escape(href)}" style="background:#304c3e;border:14px solid #304c3e;border-left-width:22px;border-right-width:22px;display:inline-block;border-radius:7px;color:#ffffff;text-decoration:none;font-size:17px;font-weight:bold">${button} →</a></td></tr></table></td></tr><tr><td style="padding:22px 0;font-size:16px;line-height:1.6">À ton rythme,<br><em>Maman Chouette</em></td></tr><tr><td style="padding:18px 0;border-top:1px solid #dfd9c8;font-size:13px;line-height:1.6;color:#60665c">${footer}<br>Si le bouton ne fonctionne pas : <a href="${escape(href)}" style="color:#304c3e">ouvrir l’atelier</a>${test ? `<p>${test}</p>` : ""}</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}
