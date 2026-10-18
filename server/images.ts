import sharp from "sharp";
import { HttpError } from "./security";
export async function image(data: unknown) {
  if (typeof data !== "string" || data.length > 2900000)
    throw new HttpError(
      413,
      "Choisis une image de moins de 2 Mo après compression.",
    );
  const match = /^data:image\/(jpeg|png|webp);base64,([a-zA-Z0-9+/]+=*)$/.exec(
    data,
  );
  if (!match)
    throw new HttpError(400, "Choisis une photographie JPG, PNG ou WebP.");
  const input = Buffer.from(match[2], "base64");
  if (input.length > 2100000)
    throw new HttpError(413, "La photographie est trop volumineuse.");
  try {
    const instance = sharp(input, {
      limitInputPixels: 25000000,
      failOn: "warning",
      animated: false,
    });
    const meta = await instance.metadata();
    if (
      !["jpeg", "png", "webp"].includes(meta.format || "") ||
      (meta.pages || 1) > 1
    )
      throw new Error("format");
    const { data: bytes, info } = await instance
      .rotate()
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#fffdf7" })
      .jpeg({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return {
      bytes,
      width: info.width,
      height: info.height,
      dataUrl: "data:image/jpeg;base64," + bytes.toString("base64"),
    };
  } catch {
    throw new HttpError(
      400,
      "Cette image est abîmée ou trop grande. Essaie une autre photographie.",
    );
  }
}
