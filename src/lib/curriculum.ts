import data from "../data/curriculum.json";
export const weeks = data.weeks;
export const lessons = data.weeks.flatMap((w) => w.lessons);
export const weeklyEmails = data.weeklyEmails;
export const bonusVideos = data.bonusVideos;
export type Lesson = (typeof lessons)[number];
export const nextLesson = (
  progress: Record<string, { completed_at?: string | null }>,
) => lessons.find((l) => !progress[l.index]?.completed_at) || lessons[15];
export function parisDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export interface LessonStage {
  phase: "observe" | "draw" | "finish";
  step: number;
}
