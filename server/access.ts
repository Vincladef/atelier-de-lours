import { firstRequiredLesson } from "../src/lib/curriculum";
import { HttpError } from "./security";
import type { Database } from "./types";
export async function requireLessonAccess(
  db: Database,
  userId: string,
  lessonId: number,
) {
  const { rows } = await db.query(
    "SELECT lesson_id,completed_at FROM atelier_lessons WHERE user_id=$1 AND lesson_id<$2 AND completed_at IS NOT NULL",
    [userId, lessonId],
  );
  const missing = firstRequiredLesson(
    lessonId,
    Object.fromEntries(rows.map((r) => [r.lesson_id, r])),
  );
  if (missing)
    throw new HttpError(
      403,
      `Termine la séance ${missing} pour ouvrir celle-ci.`,
    );
}
