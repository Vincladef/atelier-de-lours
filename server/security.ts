import { createHash, randomBytes } from "node:crypto";
import type { Database, User } from "./types";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const token = () => randomBytes(32).toString("base64url");
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const normalizeEmail = (s: string | undefined) =>
  (s || "").trim().toLowerCase();
export function sessionCookie(value: string, secure = true, clear = false) {
  return `atelier_session=${value}; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Path=/; Max-Age=${clear ? 0 : 60 * 60 * 24 * 30}`;
}
export async function authenticate(req: Request, db: Database): Promise<User> {
  const cookie = /(?:^|;\s*)atelier_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(
    req.headers.get("cookie") || "",
  )?.[1];
  if (!cookie)
    throw new HttpError(401, "Connecte-toi pour ouvrir ton atelier.");
  const { rows } = await db.query<User>(
    "SELECT u.* FROM atelier_users u JOIN atelier_sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()",
    [hash(cookie)],
  );
  if (!rows[0])
    throw new HttpError(401, "Ta connexion a expiré. Demande un nouveau lien.");
  return rows[0];
}
export function sameOrigin(
  req: Request,
  env: Record<string, string | undefined>,
) {
  const origin = req.headers.get("origin");
  const allowed = [
    new URL(req.url).origin,
    env.URL,
    env.DEPLOY_PRIME_URL,
  ].filter(Boolean);
  if (
    !origin ||
    !allowed.includes(origin) ||
    req.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new HttpError(
      403,
      "Cette action doit être effectuée depuis ton atelier.",
    );
}
export async function body(
  req: Request,
  maxBytes = 12000,
): Promise<Record<string, any>> {
  if (!(req.headers.get("content-type") || "").startsWith("application/json"))
    throw new HttpError(415, "Le format de la demande est incorrect.");
  if (Number(req.headers.get("content-length") || 0) > maxBytes)
    throw new HttpError(413, "Le fichier est trop volumineux.");
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "La demande est vide.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, "Le fichier est trop volumineux.");
    }
    chunks.push(part.value);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object")
      throw new Error();
    return parsed;
  } catch {
    throw new HttpError(400, "La demande est illisible. Réessaie.");
  }
}
export function text(value: unknown, max = 3000) {
  if (typeof value !== "string" || value.length > max)
    throw new HttpError(
      400,
      `Le texte est trop long ou invalide (maximum ${max} caractères).`,
    );
  return value.trim();
}
export function integer(v: unknown, min: number, max: number) {
  if (!Number.isInteger(v) || Number(v) < min || Number(v) > max)
    throw new HttpError(400, "Le numéro indiqué est invalide.");
  return Number(v);
}
export function uuid(v: string) {
  if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(v))
    throw new HttpError(404, "Ce dessin est introuvable.");
  return v;
}
export async function limit(
  db: Database,
  key: string,
  max: number,
  seconds: number,
) {
  const { rows } = await db.query(
    `INSERT INTO atelier_limits(key,hits,resets_at) VALUES ($1,1,now()+($2 * interval '1 second'))
    ON CONFLICT (key) DO UPDATE SET hits=CASE WHEN atelier_limits.resets_at<=now() THEN 1 ELSE atelier_limits.hits+1 END,
    resets_at=CASE WHEN atelier_limits.resets_at<=now() THEN excluded.resets_at ELSE atelier_limits.resets_at END RETURNING hits`,
    [key, seconds],
  );
  if (rows[0].hits > max)
    throw new HttpError(
      429,
      "Un peu de patience : la limite de demandes est atteinte. Réessaie plus tard.",
    );
}
export function json(
  data: unknown,
  status = 200,
  extra: Record<string, string> = {},
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
}
