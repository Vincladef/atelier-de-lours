import { useEffect, useRef, useState, type PointerEvent } from "react";
import { bonusVideos } from "../lib/curriculum";
import { go, Photo } from "./Common";
import { Upload } from "./Notebook";
export function Studio() {
  const canvas = useRef<HTMLCanvasElement>(null),
    active = useRef<number | null>(null);
  const [animal, setAnimal] = useState(0),
    [color, setColor] = useState("#3e5543"),
    [width, setWidth] = useState(3),
    [eraser, setEraser] = useState(false),
    [image, setImage] = useState(""),
    [hasDrawn, setHasDrawn] = useState(false);
  useEffect(() => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio, 2);
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fffdf7";
    ctx.fillRect(0, 0, c.width, c.height);
  }, []);
  function draw(e: PointerEvent<HTMLCanvasElement>, start = false) {
    if (start) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      active.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (active.current !== e.pointerId) return;
    const c = canvas.current!,
      r = c.getBoundingClientRect(),
      ctx = c.getContext("2d")!,
      ratio = c.width / r.width;
    const x = (e.clientX - r.left) * ratio,
      y = (e.clientY - r.top) * ratio;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = eraser ? "#fffdf7" : color;
    ctx.lineWidth = (eraser ? width * 4 : width) * ratio;
    if (start) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 0.01, y + 0.01);
    } else ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  }
  return (
    <>
      <button className="back" onClick={() => go("carnet")}>
        ← Mon carnet
      </button>
      <span className="p-eyebrow">Atelier facultatif · Le bestiaire</span>
      <h1 className="page-title">Deux sujets qui ont du caractère.</h1>
      <p className="deck">
        Observe la photo. Dessine sur ton papier, ou essaie ici à la souris ou
        au doigt.
      </p>
      <div className="natural-wrap">
        {(["oursRiviere", "chouettePortrait"] as const).map((photo, i) => (
          <button
            key={photo}
            className={"animal-select " + (animal === i ? "on" : "")}
            aria-pressed={animal === i}
            onClick={() => setAnimal(i)}
          >
            <Photo name={photo} />
            <strong>
              {i ? "Étude n° 02 · La chouette" : "Étude n° 01 · L’ours"}
            </strong>
          </button>
        ))}
      </div>
      <div className="studio-layout">
        <div>
          <canvas
            ref={canvas}
            className="studio-canvas"
            aria-label="Zone de dessin au doigt ou à la souris"
            onPointerDown={(e) => draw(e, true)}
            onPointerMove={(e) => draw(e)}
            onPointerUp={() => (active.current = null)}
            onPointerCancel={() => (active.current = null)}
            onLostPointerCapture={() => (active.current = null)}
          />
          <div className="studio-tools">
            <label className="brush-color">
              Couleur{" "}
              <input
                type="color"
                aria-label="Couleur du trait"
                value={color}
                onChange={(e) => {
                  setColor(e.target.value);
                  setEraser(false);
                }}
              />
            </label>
            {[
              ["#3e5543", "vert"],
              ["#8e5f46", "brun"],
              ["#c77f61", "rouille"],
              ["#32332c", "encre"],
            ].map(([v, name]) => (
              <button
                key={v}
                className={
                  "swatch " + (v === color && !eraser ? "selected" : "")
                }
                style={{ background: v }}
                onClick={() => {
                  setColor(v);
                  setEraser(false);
                }}
                aria-label={name}
                aria-pressed={v === color && !eraser}
              />
            ))}
            <label>
              Épaisseur{" "}
              <input
                type="range"
                min={1}
                max={12}
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                aria-label="Épaisseur du trait"
              />
            </label>
            <button
              className={"button " + (eraser ? "primary" : "ghost")}
              onClick={() => setEraser(!eraser)}
              aria-pressed={eraser}
            >
              {eraser ? "Gomme active" : "Gomme"}
            </button>
            <button
              className="button ghost"
              onClick={() => {
                if (hasDrawn && !window.confirm("Recommencer ce croquis ?"))
                  return;
                const c = canvas.current!,
                  ctx = c.getContext("2d")!;
                ctx.fillStyle = "#fffdf7";
                ctx.fillRect(0, 0, c.width, c.height);
                setHasDrawn(false);
              }}
            >
              Recommencer
            </button>
            <button
              className="button primary"
              disabled={!hasDrawn}
              onClick={() =>
                setImage(canvas.current!.toDataURL("image/jpeg", 0.82))
              }
            >
              Garder mon croquis
            </button>
          </div>
        </div>
        <aside className="panel-soft">
          <span className="p-eyebrow">Fiche d’observation</span>
          <h2 className="subhead">Une silhouette, pas un portrait-robot.</h2>
          <ol>
            <li>Observe les grandes masses.</li>
            <li>Trace la direction générale.</li>
            <li>Ajoute la tête et les proportions.</li>
            <li>Termine avec deux ou trois détails.</li>
          </ol>
          <a
            className="textbutton"
            href={bonusVideos[animal].url}
            target="_blank"
            rel="noreferrer"
          >
            La démonstration sur YouTube
          </a>
          <p>
            <button className="textbutton" onClick={() => go("chouette/3")}>
              Un conseil de Maman Chouette
            </button>
          </p>
        </aside>
      </div>
      {image && (
        <Upload
          initialImage={image}
          initialTitle={animal ? "Étude de chouette" : "Étude d’ours"}
          close={() => setImage("")}
        />
      )}
    </>
  );
}
