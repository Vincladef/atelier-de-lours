import { useState } from "react";
import {
  lessons,
  nextLesson,
  weeks,
  canOpenLesson,
  firstRequiredLesson,
} from "../lib/curriculum";
import { useStore, type Artwork } from "../lib/store";
import { go, Photo, type PhotoName } from "./Common";
export const weekPhotos: PhotoName[] = [
  "oursForet",
  "chouetteBranche",
  "oursPortrait",
  "chouetteBois",
  "oursMousse",
  "chouettePortrait",
  "oursEau",
  "chouetteMoyenne",
];
export function WorkImage({ work }: { work: Artwork }) {
  return (
    <img
      src={"/api/artworks/" + work.id + "/image"}
      alt={work.title}
      loading="lazy"
    />
  );
}
export function Home() {
  const { data } = useStore();
  const d = data!;
  const n = nextLesson(d.progress);
  const count = Object.values(d.progress).filter((p) => p.completed_at).length;
  const percent = Math.round((count / 16) * 100);
  const last = Object.values(d.progress)
    .filter((p) => !p.completed_at && canOpenLesson(p.lesson_id, d.progress))
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )[0];
  const resume = last ? lessons[last.lesson_id - 1] : n;
  return (
    <>
      <div className="hero">
        <div className="hero-copy">
          <span className="p-eyebrow">Carnet d’artiste · Édition privée</span>
          <h1 className="title">Le dessin, ça se prend à la patte.</h1>
          <p className="deck">
            {count === 0
              ? "Bonjour Papa Ours. Une feuille, tes feutres et un peu d’eau : ton premier cours t’attend."
              : count === 16
                ? "Les seize séances sont terminées. Le carnet reste ouvert."
                : "Bonjour Papa Ours. Installe-toi, on reprend là où tu en étais."}
          </p>
          <button
            className="button primary"
            onClick={() => go("cours/" + resume.index)}
          >
            Reprendre mon cours
          </button>
        </div>
        <div className="hero-visual">
          <Photo name="oursClairiere" eager />
          <div className="tape" />
          <div className="editorial-mark">L’atelier de Papa Ours</div>
        </div>
      </div>
      <div
        className="featureline"
        role="progressbar"
        aria-label="Progression du parcours"
        aria-valuenow={count}
        aria-valuemin={0}
        aria-valuemax={16}
      >
        <span className="num">
          {count}
          <small> / 16</small>
        </span>
        <div>
          <strong>Leçons terminées</strong>
        </div>
        <div className="progress" aria-hidden="true">
          <span style={{ width: percent + "%" }} />
        </div>
        <strong className="progresslabel">{percent} %</strong>
      </div>
      <div className="section-head">
        <h2>Sur la table aujourd’hui</h2>
        <button className="textbutton" onClick={() => go("cours")}>
          Les 8 semaines
        </button>
      </div>
      <div className="single-focus paper">
        <div>
          <span className="p-eyebrow">
            Semaine {resume.week} · Séance {resume.index}
          </span>
          <h2>{resume.title}</h2>
          <p>{resume.desc}</p>
          <span className="subtle">
            {resume.minutes} minutes · {resume.objective}
          </span>
        </div>
        <Photo name="chouetteMoyenne" className="focus-photo" />
      </div>
      <div className="section-head">
        <h2>Les dernières pages du carnet</h2>
        <button className="textbutton" onClick={() => go("carnet")}>
          Ouvrir mon carnet
        </button>
      </div>
      {d.artworks.length ? (
        <div className="book-strip">
          {d.artworks.slice(0, 4).map((w) => (
            <button
              key={w.id}
              className="sample-thumb"
              onClick={() => go("carnet")}
            >
              <div className="art">
                <WorkImage work={w} />
              </div>
              <span>{w.title}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-notebook">
          <p>Ton carnet attend ton premier dessin.</p>
          <button className="textbutton" onClick={() => go("carnet")}>
            Ajouter une photo
          </button>
        </div>
      )}
    </>
  );
}
export function Program() {
  const { data } = useStore();
  const progress = data!.progress;
  const next = nextLesson(progress);
  const [open, setOpen] = useState(next.week),
    [filter, setFilter] = useState("all");
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="p-eyebrow">Le parcours de Papa Ours</span>
          <h1 className="page-title">Huit semaines, une belle habitude.</h1>
          <p className="deck">Seize séances. À ton rythme.</p>
        </div>
      </div>
      <div className="tabbuttons" aria-label="Filtrer les semaines">
        {[
          ["all", "Toutes les semaines"],
          ["todo", "À découvrir"],
          ["done", "Terminées"],
        ].map(([v, l]) => (
          <button
            key={v}
            className={filter === v ? "on" : ""}
            aria-pressed={filter === v}
            onClick={() => setFilter(v)}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="chapters">
        {weeks
          .filter((w) => {
            const c = w.lessons.filter(
              (l) => progress[l.index]?.completed_at,
            ).length;
            return filter === "all" || (filter === "done" ? c === 2 : c < 2);
          })
          .map((w) => {
            const c = w.lessons.filter(
              (l) => progress[l.index]?.completed_at,
            ).length;
            return (
              <section
                className={"chapter " + (open === w.index ? "open" : "")}
                key={w.index}
              >
                <button
                  className="chapter-head"
                  onClick={() => setOpen(open === w.index ? 0 : w.index)}
                  aria-expanded={open === w.index}
                  aria-controls={"week-" + w.index}
                >
                  <Photo
                    name={weekPhotos[w.index - 1]}
                    className="chapter-photo"
                  />
                  <div className="chapter-copy">
                    <span className="p-eyebrow">
                      Semaine {String(w.index).padStart(2, "0")}
                    </span>
                    <h2>{w.name}</h2>
                    <p>{w.subtitle}</p>
                  </div>
                  <div className="chapter-state">
                    <span className="hide-mobile">
                      {c === 2
                        ? "Terminée"
                        : c === 0
                          ? "À découvrir"
                          : "En cours"}
                    </span>
                    <span className={"pill " + (c === 2 ? "" : "ochre")}>
                      {c}/2
                    </span>
                    <span className="chapter-arrow" aria-hidden="true">
                      ›
                    </span>
                  </div>
                </button>
                {open === w.index && (
                  <div id={"week-" + w.index} className="chapter-lessons">
                    {w.lessons.map((l) => (
                      <button
                        key={l.index}
                        className="lesson-row"
                        disabled={!canOpenLesson(l.index, progress)}
                        onClick={() => go("cours/" + l.index)}
                      >
                        <span
                          className={
                            "round-num " +
                            (progress[l.index]?.completed_at ? "done" : "")
                          }
                        >
                          {progress[l.index]?.completed_at ? "✓" : l.index}
                        </span>
                        <span>
                          <strong>{l.title}</strong>
                          <small>
                            {l.minutes} minutes ·{" "}
                            {!canOpenLesson(l.index, progress)
                              ? `Après la séance ${firstRequiredLesson(l.index, progress)}`
                              : progress[l.index]?.completed_at
                                ? "Terminée"
                                : progress[l.index]
                                  ? "En cours"
                                  : "À faire"}
                          </small>
                        </span>
                        <span className="row-end">
                          {canOpenLesson(l.index, progress)
                            ? "Ouvrir"
                            : "Verrouillé"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
      </div>
      <div className="bonus-note">
        <div>
          <span className="p-eyebrow">Bonus naturaliste</span>
          <h3>L’ours et la chouette posent pour toi.</h3>
        </div>
        <button className="button ghost" onClick={() => go("studio")}>
          Ouvrir le studio
        </button>
      </div>
    </>
  );
}
export function Letter() {
  return (
    <>
      <button className="back" onClick={() => go("atelier")}>
        ← Mon atelier
      </button>
      <div className="letter">
        <span className="p-eyebrow">
          Une lettre à glisser entre deux feuilles
        </span>
        <Photo name="oursEau" />
        <h1 className="page-title">Pour toi, Papa.</h1>
        <p>
          Il paraît que les ours aiment leur tanière. Mais celui-ci a désormais
          un atelier, des feutres aquarellables et une chouette qui commente les
          opérations.
        </p>
        <p>
          Ces petites séances sont surtout une invitation à prendre du temps
          pour toi, à regarder autrement, à essayer sans te presser. Les dessins
          réussis seront les bienvenus ; les ratés auront également leur place.
        </p>
        <p>Joyeux anniversaire, et que le carnet soit bien rempli !</p>
        <p>
          <em>Avec affection ♡</em>
        </p>
      </div>
    </>
  );
}

export function LockedLesson({ id }: { id: number }) {
  const { data } = useStore();
  const required = firstRequiredLesson(id, data!.progress)!;
  return (
    <div className="content-sheet locked-lesson">
      <h1 className="page-title">Une séance à la fois.</h1>
      <p>
        Termine la séance {required}, « {lessons[required - 1].title} », pour
        ouvrir ce cours.
      </p>
      <button
        className="button primary"
        onClick={() => go(`cours/${required}`)}
      >
        Reprendre ma séance
      </button>
      <button className="button plain" onClick={() => go("cours")}>
        Voir le programme
      </button>
    </div>
  );
}
