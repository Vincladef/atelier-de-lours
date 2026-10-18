import type { Lesson, LessonStage } from "./curriculum";

export type ChatPage = "lesson" | "owl";

/** Canonical content shared by the displayed exercise and the teacher's prompt. */
export function lessonPageContext(
  lesson: Lesson,
  stage: LessonStage,
  completed = false,
) {
  const phase = { observe: "Regarder", draw: "Dessiner", finish: "Terminer" }[
    stage.phase
  ];
  return {
    title:
      stage.phase === "draw"
        ? lesson.steps[stage.step][0]
        : stage.phase === "observe"
          ? "Regarde, puis essaie."
          : completed
            ? "Cette séance est dans le carnet."
            : "Et voilà pour aujourd’hui.",
    lesson_title: lesson.title,
    lesson_id: lesson.index,
    phase,
    instruction:
      stage.phase === "draw"
        ? lesson.steps[stage.step][1]
        : stage.phase === "observe"
          ? lesson.watch
          : lesson.end,
    explanations: stage.phase === "observe" ? [lesson.welcome] : [],
    optional_advice:
      stage.phase === "draw"
        ? [lesson.tip, lesson.help]
        : stage.phase === "observe"
          ? [lesson.video.focus, lesson.video.fit]
          : [lesson.anchor],
    optional_exercise: stage.phase === "draw" ? lesson.challenge : null,
    objective: lesson.objective,
  };
}
