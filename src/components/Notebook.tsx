import { useState } from "react";
import { SuccessMoment } from "./SuccessMoment";
import { api, compress } from "../lib/api";
import { lessons, parisDate } from "../lib/curriculum";
import { useStore, type Artwork } from "../lib/store";
import { ErrorMessage, go, Modal, Photo } from "./Common";
import { WorkImage } from "./Pages";
export function Notebook() {
  const s = useStore();
  const works = s.data!.artworks;
  const [upload, setUpload] = useState(false),
    [edit, setEdit] = useState<Artwork | null>(null),
    [deleting, setDeleting] = useState<Artwork | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const oldest = [...works].sort(
    (a, b) =>
      a.drawn_on.localeCompare(b.drawn_on) ||
      a.created_at.localeCompare(b.created_at),
  );
  async function exportPdf() {
    setBusy(true);
    setError("");
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      for (let i = 0; i < oldest.length; i++) {
        const work = oldest[i];
        if (i) pdf.addPage();
        pdf.setFillColor("#f7f2e7");
        pdf.rect(0, 0, 210, 297, "F");
        pdf.setTextColor("#282e25");
        pdf.setFontSize(22);
        pdf.text("L’Atelier de l’Ours", 18, 22);
        pdf.setFontSize(16);
        pdf.text(pdf.splitTextToSize(work.title, 172), 18, 36);
        pdf.setFontSize(11);
        pdf.text(new Date(work.drawn_on).toLocaleDateString("fr-FR"), 18, 53);
        const response = await fetch("/api/artworks/" + work.id + "/image", {
          credentials: "same-origin",
        });
        if (!response.ok)
          throw new Error(
            "Une photographie n’a pas pu être exportée. Réessaie.",
          );
        const bytes = new Uint8Array(await response.arrayBuffer());
        const ratio = Math.min(174 / work.width, 174 / work.height);
        const width = work.width * ratio,
          height = work.height * ratio;
        pdf.addImage(bytes, "JPEG", 18 + (174 - width) / 2, 65, width, height);
        if (work.note) {
          pdf.setFontSize(11);
          pdf.text(pdf.splitTextToSize(work.note, 174).slice(0, 7), 18, 247);
        }
      }
      pdf.save("mon-carnet-atelier-de-lours.pdf");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="notebook-head">
        <div>
          <span className="p-eyebrow">Le carnet de Papa Ours</span>
          <h1 className="page-title">Tes dessins, tes histoires.</h1>
          <p className="deck">Une photo, une date, et la page est conservée.</p>
        </div>
        <Photo name="chouettePortrait" />
      </div>
      {s.achievement?.kind === "drawing" &&
        works.some((w) => w.id === s.achievement?.id) && (
          <SuccessMoment
            key={s.achievement.id}
            message="Un dessin de plus dans ton carnet."
          />
        )}
      <div className="section-head">
        <h2>Mes réalisations</h2>
        <div className="row wrap">
          <button
            className="button ghost small"
            onClick={() => setUpload(true)}
          >
            ＋ Ajouter un dessin
          </button>
          {works.length > 0 && (
            <button
              className="button plain small"
              disabled={busy}
              onClick={() => void exportPdf()}
            >
              {busy ? "Préparation du PDF…" : "Exporter mon carnet en PDF"}
            </button>
          )}
        </div>
      </div>
      <ErrorMessage message={error} />
      {works.length ? (
        <div className="notebook-gallery">
          {works.map((w, i) => (
            <article
              key={w.id}
              className={
                "work " +
                (s.achievement?.kind === "drawing" && s.achievement.id === w.id
                  ? "just-created"
                  : "")
              }
              style={
                {
                  "--angle": [0.3, -0.65, 1.1, -0.8, 0.4][i % 5] + "deg",
                } as React.CSSProperties
              }
            >
              <button
                className="work-art work-open"
                onClick={() => setEdit(w)}
                aria-label={"Ouvrir " + w.title}
              >
                <WorkImage work={w} />
              </button>
              <div className="work-meta">
                <h3>{w.title}</h3>
                <small>
                  {w.lesson_id ? "Séance " + w.lesson_id + " · " : ""}
                  {new Date(w.drawn_on).toLocaleDateString("fr-FR", {
                    timeZone: "UTC",
                  })}
                </small>
                {w.note && <p>{w.note}</p>}
                <div className="row">
                  <button className="textbutton" onClick={() => setEdit(w)}>
                    Modifier
                  </button>
                  <button className="textbutton" onClick={() => setDeleting(w)}>
                    Supprimer
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="paper empty-notebook">
          <h2 className="subhead">La première page est à toi.</h2>
          <p>
            Photographie un dessin sur papier ou garde un croquis du studio.
          </p>
          <button className="button primary" onClick={() => setUpload(true)}>
            Ajouter mon premier dessin
          </button>
        </div>
      )}
      {oldest.length > 1 && (
        <>
          <div className="section-head">
            <h2>Premier jour, aujourd’hui</h2>
          </div>
          <div className="panel-soft compare-grid">
            {[oldest[0], oldest.at(-1)!].map((w, i) => (
              <div key={i}>
                <div className="art">
                  <WorkImage work={w} />
                </div>
                <p className="small">
                  {i ? "Dernière réalisation" : "Première réalisation"} ·{" "}
                  {w.title}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="bonus-note">
        <h3>Un ours et une chouette à croquer.</h3>
        <button className="button ghost" onClick={() => go("studio")}>
          Entrer dans le studio
        </button>
      </div>
      {upload && <Upload close={() => setUpload(false)} />}{" "}
      {edit && <EditArtwork work={edit} close={() => setEdit(null)} />}
      {deleting && (
        <Modal
          title="Supprimer cette photographie ?"
          close={() => setDeleting(null)}
        >
          <p>« {deleting.title} » sera retiré de ton carnet et du stockage.</p>
          <ErrorMessage message={error} />
          <div className="row">
            <button className="button ghost" onClick={() => setDeleting(null)}>
              La garder
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await api("/artworks/" + deleting.id, "DELETE", {});
                  await s.refresh();
                  setDeleting(null);
                  s.notify("Photographie supprimée.");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Suppression…" : "Supprimer la photo"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function Upload({
  lessonId,
  initialImage,
  initialTitle,
  close,
}: {
  lessonId?: number;
  initialImage?: string;
  initialTitle?: string;
  close: () => void;
}) {
  const s = useStore();
  const [data, setData] = useState(initialImage || ""),
    [title, setTitle] = useState(
      initialTitle || (lessonId ? lessons[lessonId - 1].title : ""),
    ),
    [date, setDate] = useState(parisDate()),
    [lesson, setLesson] = useState(lessonId ? String(lessonId) : ""),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function select(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      setData(await compress(file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Une nouvelle page du carnet" close={close}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!data) return;
          setBusy(true);
          setError("");
          try {
            const result = await api<{ artwork: Artwork }>(
              "/artworks",
              "POST",
              {
                title,
                drawn_on: date,
                lesson_id: lesson ? Number(lesson) : null,
                note,
                image: data,
              },
            );
            await s.refresh();
            s.celebrate("drawing", result.artwork.id);
            close();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {!initialImage && (
          <div className="upload-actions">
            <label className="button ghost">
              Importer une image
              <input
                type="file"
                className="file-input"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Importer une image"
                onChange={(e) => void select(e.target.files?.[0])}
              />
            </label>
            <label className="button ghost">
              Photographier mon dessin
              <input
                type="file"
                className="file-input"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                aria-label="Photographier mon dessin"
                onChange={(e) => void select(e.target.files?.[0])}
              />
            </label>
          </div>
        )}
        {data && (
          <img src={data} alt="Dessin à ajouter" className="upload-preview" />
        )}
        <label>
          Titre
          <input
            className="simple-input"
            autoComplete="off"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            required
          />
        </label>
        <label>
          Date du dessin
          <input
            className="simple-input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <label>
          Séance associée
          <select
            className="simple-input"
            value={lesson}
            onChange={(e) => setLesson(e.target.value)}
          >
            <option value="">Dessin personnel</option>
            {lessons.map((l) => (
              <option key={l.index} value={l.index}>
                {l.index}. {l.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Une note (facultative)
          <textarea
            className="simple-textarea"
            maxLength={3000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <ErrorMessage message={error} />
        <button className="button primary" disabled={busy || !data}>
          {busy ? "Enregistrement…" : "Garder ce dessin"}
        </button>
      </form>
    </Modal>
  );
}
function EditArtwork({ work, close }: { work: Artwork; close: () => void }) {
  const s = useStore();
  const [title, setTitle] = useState(work.title),
    [note, setNote] = useState(work.note),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title={work.title} close={close}>
      <div className="edit-art">
        <WorkImage work={work} />
      </div>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api("/artworks/" + work.id, "PATCH", { title, note });
            await s.refresh();
            close();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Titre
          <input
            className="simple-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            required
          />
        </label>
        <label>
          Ma note
          <textarea
            className="simple-textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={3000}
          />
        </label>
        <ErrorMessage message={error} />
        <button className="button primary" disabled={busy}>
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>
    </Modal>
  );
}
