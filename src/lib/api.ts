export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api" + path, {
      method,
      credentials: "same-origin",
      headers: data === undefined ? {} : { "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  } catch {
    throw new ApiError(
      "La connexion est interrompue. Vérifie ton accès à Internet, puis réessaie.",
      0,
    );
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      result.error || "Cette action n’a pas abouti. Réessaie.",
      response.status,
    );
  return result;
}
export async function compress(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Choisis une image JPG, PNG ou WebP.");
  if (file.size > 20000000)
    throw new Error("Choisis une photographie de moins de 20 Mo.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new Error(
        "Cette image n’a pas pu être ouverte. Essaie une autre photographie.",
      );
    }
    if (img.width * img.height > 25000000)
      throw new Error(
        "Cette photo est trop grande. Réduis-la à moins de 25 mégapixels.",
      );
    const ratio = Math.min(1, 1600 / img.width, 1600 / img.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * ratio);
    canvas.height = Math.round(img.height * ratio);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fffdf7";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}
