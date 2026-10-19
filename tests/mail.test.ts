import { test } from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import { mailContent } from "../src/lib/mailContent";
test("all eight weekly emails contain a short lesson preview and HTML plus text application links", () => {
  for (let week = 1; week <= 8; week++) {
    const mail = mailContent("weekly", week);
    assert.match(mail.html, /Ouvrir ma séance/);
    assert.match(
      mail.html,
      new RegExp(`https://atelier-de-lours.netlify.app/#cours/${week * 2 - 1}`),
    );
    assert.match(mail.text, new RegExp(`/#cours/${week * 2 - 1}`));
    assert.match(mail.html, /TA PROCHAINE SÉANCE/);
    assert.ok(!mail.html.includes("<script"));
    assert.ok(mail.text.length < 1600);
  }
  for (const kind of ["welcome", "congratulations", "reminder"])
    assert.match(
      mailContent(kind, 1).html,
      /href="https:\/\/atelier-de-lours.netlify.app\/#cours\//,
    );
  assert.match(
    mailContent("congratulations", 8, { nextLessonId: null }).html,
    /#carnet/,
  );
});
test("Nodemailer generates a multipart message with the real HTML button without contacting SMTP", async () => {
  const smtp = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "unix",
  });
  const message = await smtp.sendMail({
    from: "owner@example.test",
    to: "owner@example.test",
    ...mailContent("weekly", 1, { test: true }),
  });
  const mime = message.message.toString();
  assert.match(mime, /multipart\/alternative/);
  assert.match(mime, /text\/plain/);
  assert.match(mime, /text\/html/);
  assert.match(mime, /atelier-de-lours.netlify.app/);
});
