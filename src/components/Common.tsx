import { useEffect, useRef, useState, type ReactNode } from "react";
import photos from "../data/photos.json";
export type PhotoName = keyof typeof photos;
export function Photo({
  name,
  className = "",
  eager = false,
}: {
  name: PhotoName;
  className?: string;
  eager?: boolean;
}) {
  const p = photos[name];
  const [localFailed, setLocalFailed] = useState(false),
    [failed, setFailed] = useState(false);
  return (
    <div className={"photo-wrap " + className}>
      {failed ? (
        <div className="photo-unavailable">Photographie indisponible</div>
      ) : (
        <img
          className="photo-img"
          src={localFailed ? p.url : p.local}
          alt={p.alt}
          loading={eager ? "eager" : "lazy"}
          onError={() => (localFailed ? setFailed(true) : setLocalFailed(true))}
        />
      )}
    </div>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => {
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      className="modal"
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
      aria-label={title}
    >
      <button className="close" onClick={close} aria-label="Fermer">
        ×
      </button>
      <h2 className="subhead">{title}</h2>
      {children}
    </dialog>
  );
}
export function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <p className="error-message" role="alert">
      {message}
    </p>
  ) : null;
}
export function go(path: string) {
  if (location.hash === "#" + path)
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = path;
}
export function Credits() {
  return (
    <details className="dropdown">
      <summary>Photographies & crédits</summary>
      <p>
        Photographies de la maquette, sous{" "}
        <a href="https://unsplash.com/license" target="_blank" rel="noreferrer">
          licence Unsplash
        </a>
        .
      </p>
      <ul>
        {Object.entries(photos).map(([k, p]) => (
          <li key={k}>
            <a href={p.link} target="_blank" rel="noreferrer">
              {p.credit}
            </a>
          </li>
        ))}
      </ul>
      <p>
        Typographies : DM Sans et Fraunces, licences SIL Open Font License,
        hébergées avec le site.{" "}
        <a href="/licenses/DM-Sans.txt">Licence DM Sans</a> ·{" "}
        <a href="/licenses/Fraunces.txt">Licence Fraunces</a>
      </p>
    </details>
  );
}
