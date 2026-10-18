import { useEffect, useRef } from "react";
import type { LessonStage } from "../lib/curriculum";
import { Conversation } from "./Owl";
import { Photo } from "./Common";

export function LessonChat({
  id,
  stage,
  compact,
  open,
  close,
}: {
  id: number;
  stage: LessonStage;
  compact: boolean;
  open: boolean;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLElement>(null);
  const dismiss = useRef(close);
  dismiss.current = close;
  useEffect(() => {
    if (!compact && open) {
      panel.current
        ?.querySelector<HTMLButtonElement>("button")
        ?.focus({ preventScroll: true });
      const escape = (e: KeyboardEvent) => {
        if (e.key === "Escape" && !document.querySelector("dialog[open]")) {
          e.preventDefault();
          dismiss.current();
        }
      };
      document.addEventListener("keydown", escape);
      return () => document.removeEventListener("keydown", escape);
    }
    if (!compact || !open || !dialog.current) return;
    const el = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    const viewport = window.visualViewport;
    const position = () => {
      const height = viewport?.height || innerHeight;
      const panel = Math.min(innerHeight * 0.82, height - 12);
      el.style.height = `${panel}px`;
      el.style.top = `${(viewport?.offsetTop || 0) + height - panel}px`;
    };
    position();
    el.showModal();
    viewport?.addEventListener("resize", position);
    viewport?.addEventListener("scroll", position);
    window.addEventListener("resize", position);
    return () => {
      viewport?.removeEventListener("resize", position);
      viewport?.removeEventListener("scroll", position);
      window.removeEventListener("resize", position);
      el.close();
      previous?.focus({ preventScroll: true });
    };
  }, [open, compact]);
  const content = (
    <>
      <div className="lesson-chat-head">
        <Photo name="chouettePortrait" className="owl-portrait" />
        <div>
          <h2 id="lesson-chat-title">Maman Chouette</h2>
          <p>
            {stage.phase === "draw"
              ? `Dessiner · Geste ${stage.step + 1}`
              : stage.phase === "observe"
                ? "Regarder"
                : "Terminer"}
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Fermer la conversation"
          onClick={close}
        >
          ×
        </button>
      </div>
      <Conversation lessonId={id} stage={stage} active={open} />
    </>
  );
  if (compact)
    return (
      <dialog
        ref={dialog}
        className="lesson-chat-sheet"
        aria-labelledby="lesson-chat-title"
        onCancel={(e) => {
          e.preventDefault();
          dismiss.current();
        }}
        onClick={(e) => {
          if (e.target === dialog.current) dismiss.current();
        }}
      >
        {content}
      </dialog>
    );
  return (
    <section
      ref={panel}
      id="lesson-conversation"
      className="lesson-chat-panel"
      hidden={!open}
      aria-labelledby="lesson-chat-title"
    >
      {content}
    </section>
  );
}
