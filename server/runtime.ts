import { getStore } from "@netlify/blobs";
import nodemailer from "nodemailer";
import { database, migrate } from "./db";
import type { Services } from "./types";
import { normalizeEmail } from "./security";

let ready: Promise<void> | undefined;
export async function runtime(): Promise<Services> {
  const db = database();
  ready ??= migrate(db).catch((e) => {
    ready = undefined;
    throw e;
  });
  await ready;
  const store = () =>
    getStore({ name: "atelier-carnet-private", consistency: "strong" });
  return {
    db,
    env: process.env,
    fetch: globalThis.fetch,
    store: {
      set: async (key, data) => {
        await store().set(key, new Uint8Array(data).buffer);
      },
      get: (key) => store().get(key, { type: "arrayBuffer" }),
      delete: async (key) => {
        await store().delete(key);
      },
    },
    send: async (mail) => {
      const owner = normalizeEmail(process.env.EMAIL_FROM);
      const papa = normalizeEmail(process.env.PAPA_EMAIL);
      if (!owner || !process.env.GMAIL_APP_PASSWORD || !papa || owner === papa)
        throw new Error("MAIL_UNAVAILABLE");
      if (![owner, papa].includes(normalizeEmail(mail.to)))
        throw new Error("MAIL_RECIPIENT_DENIED");
      // Every real learner send is independently gated here, including magic links.
      if (normalizeEmail(mail.to) === papa && papa !== owner) {
        const { rows } = await db.query(
          "SELECT enabled FROM atelier_settings WHERE key='gift_activated'",
        );
        if (!rows[0]?.enabled) throw new Error("GIFT_NOT_ACTIVATED");
      }
      const smtp = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          user: owner,
          pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, ""),
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        tls: { rejectUnauthorized: true },
      });
      try {
        await smtp.sendMail({
          ...mail,
          from: `L’Atelier de l’Ours <${process.env.EMAIL_FROM}>`,
          disableFileAccess: true,
          disableUrlAccess: true,
        });
      } finally {
        smtp.close();
      }
    },
  };
}
