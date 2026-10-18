import { useEffect, useRef, useState } from "react";
import { lessons, weeks } from "../lib/curriculum";
import { useStore } from "../lib/store";
import { ErrorMessage, go, Photo } from "./Common";
import { LessonChat } from "./LessonChat";
import { Upload } from "./Notebook";
import { weekPhotos } from "./Pages";
export function LessonPage({ id }: { id: number }) {
  const s = useStore();
  const l = lessons[id - 1],
    w = weeks[l.week - 1],
    p = s.data!.progress[id];
  const phase = p?.phase || "observe",
    step = p?.step || 0;
  const chatTrigger = useRef<HTMLButtonElement>(null);
  const closeChat = () => {
    setChatOpen(false);
    requestAnimationFrame(() =>
      chatTrigger.current?.focus({ preventScroll: true }),
    );
  };
  const [video, setVideo] = useState(false),
    [upload, setUpload] = useState(false),
    [chatOpen, setChatOpen] = useState(false);
  const [compact, setCompact] = useState(
    () => matchMedia("(max-width:880px)").matches,
  );
  useEffect(() => {
    const q = matchMedia("(max-width:880px)");
    const update = () => setCompact(q.matches);
    q.addEventListener("change", update);
    return () => q.removeEventListener("change", update);
  }, []);
  const switchPhase = (value: "observe" | "draw" | "finish") =>
    void s.lesson(id, { phase: value });
  const next = () => {
    const checked = [...new Set([...(p?.checked_steps || []), step])];
    void s.lesson(
      id,
      step === 3
        ? { checked_steps: checked, phase: "finish" }
        : { checked_steps: checked, step: step + 1 },
    );
  };
  return (
    <>
      <div className="lesson-top">
        <button className="back" onClick={() => go("cours")}>
          ← Toutes les semaines
        </button>
        <div className="row wrap">
          <span className="p-eyebrow">
            Semaine {l.week} · Séance {id} / 16
          </span>
          {p?.completed_at && <span className="pill">✓ Terminée</span>}
        </div>
        <h1 className="page-title">{l.title}</h1>
        <div className="lesson-tools">
          <span>{l.minutes} min</span>
          <span>·</span>
          <span>{l.objective}</span>
        </div>
      </div>
      <div className="lesson-stage">
        <div className="lesson-main">
          <div className="phase-nav" aria-label="Étapes de la séance">
            {[
              ["observe", "Regarder"],
              ["draw", "Dessiner"],
              ["finish", "Terminer"],
            ].map(([v, label], i) => (
              <button
                key={v}
                className={"phase-btn " + (phase === v ? "active" : "")}
                aria-current={phase === v ? "step" : undefined}
                onClick={() => switchPhase(v as typeof phase)}
              >
                <span className="phase-index" aria-hidden="true">
                  {i + 1}.
                </span>
                {label}
              </button>
            ))}
          </div>
          {compact && (
            <button
              ref={chatTrigger}
              className="lesson-chat-trigger"
              aria-label="Demander à Maman Chouette"
              aria-expanded={chatOpen}
              aria-haspopup="dialog"
              onClick={() => setChatOpen(true)}
            >
              <Photo name="chouettePortrait" className="owl-portrait" />
              Demander à Maman Chouette
            </button>
          )}
          <div className="content-sheet">
            {phase === "observe" ? (
              <>
                <span className="p-eyebrow">
                  01 · Prendre le temps d’observer
                </span>
                <h2>Regarde, puis essaie.</h2>
                <p>{l.welcome}</p>
                <p>{l.watch}</p>
                <div className="video-frame">
                  {video ? (
                    <iframe
                      src={l.video.embed + "?autoplay=1"}
                      title={l.video.title}
                      allow="autoplay; encrypted-media; picture-in-picture"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  ) : (
                    <>
                      <Photo name={weekPhotos[l.week - 1]} />
                      <button
                        className="play-overlay"
                        onClick={() => setVideo(true)}
                        aria-label={"Lire la vidéo : " + l.video.title}
                      >
                        ▶
                      </button>
                    </>
                  )}
                </div>
                <p className="small">
                  <a href={l.video.url} target="_blank" rel="noreferrer">
                    Ouvrir sur YouTube
                  </a>{" "}
                  · {l.video.creator}
                </p>
                <details className="dropdown">
                  <summary>À observer dans la vidéo</summary>
                  <p>{l.video.focus}</p>
                  <p>{l.video.fit}</p>
                </details>
                <div className="lesson-foot">
                  <button className="button plain" onClick={() => go("cours")}>
                    ← Le programme
                  </button>
                  <button
                    className="button primary"
                    onClick={() => switchPhase("draw")}
                  >
                    Passer à la pratique →
                  </button>
                </div>
              </>
            ) : phase === "draw" ? (
              <>
                <span className="p-eyebrow">02 · À toi de jouer</span>
                <div className="task-progress" aria-hidden="true">
                  {[0, 1, 2, 3].map((n) => (
                    <span key={n} className={n <= step ? "on" : ""} />
                  ))}
                </div>
                <div className="task-area">
                  <span className="task-number">GESTE {step + 1} SUR 4</span>
                  <h2>{l.steps[step][0]}</h2>
                  <p>{l.steps[step][1]}</p>
                  <label className="check-step">
                    <input
                      type="checkbox"
                      checked={p?.checked_steps?.includes(step) || false}
                      onChange={(e) =>
                        void s.lesson(id, {
                          checked_steps: e.target.checked
                            ? [...new Set([...(p?.checked_steps || []), step])]
                            : (p?.checked_steps || []).filter(
                                (n) => n !== step,
                              ),
                        })
                      }
                    />
                    Ce geste est fait
                  </label>
                </div>
                <details className="dropdown lesson-optional">
                  <summary>Outils facultatifs</summary>
                  <details className="dropdown">
                    <summary>Un indice de Maman Chouette</summary>
                    <p>{l.tip}</p>
                    <p>{l.help}</p>
                    <button
                      className="textbutton"
                      onClick={() => setChatOpen(true)}
                    >
                      J’ai encore une question
                    </button>
                  </details>
                  <details className="dropdown">
                    <summary>Un petit chronomètre ?</summary>
                    <Timer />
                  </details>
                  <details className="dropdown">
                    <summary>Pour aller un peu plus loin</summary>
                    <p>{l.challenge}</p>
                  </details>
                </details>
                <div className="lesson-foot">
                  <button
                    className="button plain"
                    onClick={() =>
                      step
                        ? void s.lesson(id, { step: step - 1 })
                        : switchPhase("observe")
                    }
                  >
                    ← Précédent
                  </button>
                  <button className="button primary" onClick={next}>
                    {step === 3 ? "Terminer le dessin" : "Étape suivante"} →
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="p-eyebrow">03 · Garder une trace</span>
                <h2>
                  {p?.completed_at
                    ? "Cette séance est dans le carnet."
                    : "Et voilà pour aujourd’hui."}
                </h2>
                <p>{l.end}</p>
                <button
                  className="button ghost"
                  onClick={() => setUpload(true)}
                >
                  Ajouter une photo à mon carnet
                </button>
                <span className="optional"> Facultatif</span>
                <div className="form-row">
                  <label>Comment as-tu trouvé cette séance ?</label>
                  <div className="select-pills">
                    {["Un peu difficile", "Ça allait", "Plutôt facile"].map(
                      (v) => (
                        <button
                          key={v}
                          className={
                            "choice " + (p?.ease === v ? "chosen" : "")
                          }
                          aria-pressed={p?.ease === v}
                          onClick={() => void s.lesson(id, { ease: v })}
                        >
                          {v}
                        </button>
                      ),
                    )}
                  </div>
                </div>
                <details className="dropdown">
                  <summary>Une question pour faire le point</summary>
                  <div className="quiz">
                    <h3>{l.quiz}</h3>
                    {l.choices.map((v, i) => (
                      <label key={i}>
                        <input
                          type="radio"
                          name={"quiz-" + id}
                          checked={p?.quiz_answer === i}
                          onChange={() => void s.lesson(id, { quiz_answer: i })}
                        />
                        {v}
                      </label>
                    ))}
                    {p?.quiz_answer != null && (
                      <p className="check-feedback">
                        {p.quiz_answer === l.answer
                          ? "Exact. "
                          : "La bonne réponse : " + l.choices[l.answer] + ". "}
                        {l.anchor}
                      </p>
                    )}
                  </div>
                </details>
                {id % 2 === 0 && <WeeklyReview week={l.week} />}
                <div className="lesson-foot">
                  <button
                    className="button plain"
                    onClick={() => switchPhase("draw")}
                  >
                    ← Mon dessin
                  </button>
                  {p?.completed_at ? (
                    <button
                      className="button primary"
                      onClick={() =>
                        go(id === 16 ? "carnet" : "cours/" + (id + 1))
                      }
                    >
                      {id === 16 ? "Ouvrir mon carnet" : "Le cours suivant"} →
                    </button>
                  ) : (
                    <button
                      className="button primary"
                      onClick={() => void s.lesson(id, { completed: true })}
                    >
                      J’ai terminé ma leçon ✓
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="mobile-lesson-help">
            <details className="dropdown">
              <summary>Matériel & notes personnelles</summary>
              <p>{w.materials.join(" · ")}</p>
              {compact && <Note id={id} />}
            </details>
          </div>
        </div>
        <aside className="side-quiet">
          {!compact && !chatOpen && (
            <div className="owl-invitation">
              <Photo name="chouettePortrait" className="owl-portrait" />
              <div>
                <h3>Maman Chouette</h3>
                <button
                  ref={chatTrigger}
                  className="textbutton"
                  aria-expanded={chatOpen}
                  aria-controls="lesson-conversation"
                  onClick={() => setChatOpen(true)}
                >
                  Lui demander de l’aide
                </button>
              </div>
            </div>
          )}
          {!compact && (
            <LessonChat
              id={id}
              stage={{ phase, step }}
              compact={false}
              open={chatOpen}
              close={closeChat}
            />
          )}
          <details className="dropdown lesson-side-tools">
            <summary>Outils facultatifs</summary>
            <details className="dropdown">
              <summary>Le matériel de la semaine</summary>
              <ul>
                {w.materials.map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ul>
            </details>
            <details className="dropdown">
              <summary>Mes notes</summary>
              {!compact && <Note id={id} />}
            </details>
          </details>
        </aside>
      </div>
      {compact && (
        <LessonChat
          id={id}
          stage={{ phase, step }}
          compact
          open={chatOpen}
          close={closeChat}
        />
      )}
      {upload && <Upload lessonId={id} close={() => setUpload(false)} />}
    </>
  );
}
function Note({ id }: { id: number }) {
  const s = useStore();
  const [value, setValue] = useState(s.data!.progress[id]?.notes || "");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined),
    current = useRef(value),
    dirty = useRef(false);
  const save = useRef(s.lesson);
  save.current = s.lesson;
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      clearTimeout(timer.current);
      if (dirty.current) void save.current(id, { notes: current.current });
    };
  }, [id]);
  return (
    <label className="note-field">
      Mes notes
      <textarea
        className="simple-textarea"
        maxLength={5000}
        value={value}
        placeholder="Une remarque pour plus tard…"
        onBlur={() => {
          if (dirty.current) {
            clearTimeout(timer.current);
            dirty.current = false;
            void save.current(id, { notes: current.current });
          }
        }}
        onChange={(e) => {
          const v = e.target.value;
          current.current = v;
          dirty.current = true;
          setValue(v);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            dirty.current = false;
            void save.current(id, { notes: v });
          }, 600);
        }}
      />
    </label>
  );
}
function Timer() {
  const [time, setTime] = useState(0),
    [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTime((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return (
    <div className="row wrap">
      <output className="timer-value">
        {String(Math.floor(time / 60)).padStart(2, "0")}:
        {String(time % 60).padStart(2, "0")}
      </output>
      <button
        className="button ghost small"
        onClick={() => setRunning(!running)}
      >
        {running ? "Pause" : "Démarrer"}
      </button>
      <button
        className="textbutton"
        onClick={() => {
          setRunning(false);
          setTime(0);
        }}
      >
        Remettre à zéro
      </button>
    </div>
  );
}
function WeeklyReview({ week }: { week: number }) {
  const s = useStore();
  const [review, setReview] = useState(
      s.data!.reviews[week] || { easy: "", difficult: "", repeat: "" },
    ),
    [saved, setSaved] = useState(false),
    [error] = useState("");
  return (
    <details className="dropdown">
      <summary>Mon bilan de la semaine (facultatif)</summary>
      <p>{weeks[week - 1].completion.question}</p>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          await s.review(week, review);
          setSaved(true);
        }}
      >
        {[
          ["easy", "Quelle technique te semble la plus facile ?"],
          ["difficult", "Qu’est-ce qui reste difficile ?"],
          ["repeat", "Quel exercice souhaites-tu refaire ?"],
        ].map(([key, label]) => (
          <label key={key}>
            {label}
            <textarea
              className="simple-textarea"
              value={review[key as keyof typeof review]}
              maxLength={1000}
              onChange={(e) => {
                setSaved(false);
                setReview({ ...review, [key]: e.target.value });
              }}
            />
          </label>
        ))}
        <ErrorMessage message={error} />
        <button className="button ghost" type="submit">
          Enregistrer mon bilan
        </button>
        {saved && (
          <p role="status">
            Bilan pris en compte.{" "}
            {s.failures > 0 ? "Vérifie la sauvegarde en haut de la page." : ""}
          </p>
        )}
      </form>
    </details>
  );
}
