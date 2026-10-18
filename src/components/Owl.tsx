import { useEffect, useRef, useState } from "react";
import { api, compress } from "../lib/api";
import { lessons, nextLesson } from "../lib/curriculum";
import { useStore } from "../lib/store";
import { ErrorMessage, Photo } from "./Common";
export function Owl() {
  const s = useStore();
  const routeLesson = Number(location.hash.split("/")[1]);
  const [context, setContext] = useState(
      routeLesson >= 1 && routeLesson <= 16
        ? routeLesson
        : nextLesson(s.data!.progress).index,
    ),
    [question, setQuestion] = useState(""),
    [attachment, setAttachment] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const log = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null);
  const messages = s.data!.chat.filter((m) => m.lesson_id === context);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages.length, busy]);
  async function attach(file?: File) {
    if (!file) return;
    setError("");
    try {
      setAttachment(await compress(file));
      setConsent(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="chat-hero">
        <Photo name="chouetteBranche" />
        <div>
          <span className="p-eyebrow">Le bureau de la chouette</span>
          <h1 className="page-title">Tu as une question, mon Ours ?</h1>
          <p className="deck">
            Un geste difficile, une couleur ou un dessin à regarder.
          </p>
        </div>
      </div>
      <div className="chat-layout">
        <div className="paper chat-card">
          <label className="chat-context">
            À propos de
            <select
              className="simple-input"
              value={context}
              onChange={(e) => setContext(Number(e.target.value))}
            >
              {lessons.map((l) => (
                <option key={l.index} value={l.index}>
                  Séance {l.index} · {l.title}
                </option>
              ))}
            </select>
          </label>
          <div
            className="chatlog"
            ref={log}
            role="log"
            aria-label="Conversation avec Maman Chouette"
            aria-live="polite"
          >
            {messages.length ? (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={"msg " + (m.role === "user" ? "user" : "bot")}
                >
                  <span className="sr-only">
                    {m.role === "user" ? "Toi : " : "Maman Chouette : "}
                  </span>
                  {m.content}
                  {m.has_image && (
                    <small>Une photo a été jointe à cette question.</small>
                  )}
                </div>
              ))
            ) : (
              <p className="subtle">
                Qu’est-ce qui te pose difficulté dans cette séance ?
              </p>
            )}
            {busy && <p role="status">Maman Chouette regarde ta question…</p>}
          </div>
          <form
            className="chat-compose"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setError("");
              try {
                await api("/chat", "POST", {
                  lesson_id: context,
                  question,
                  image: attachment || undefined,
                  consent,
                });
                await s.refresh();
                setQuestion("");
                setAttachment("");
                setConsent(false);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
                input.current?.focus();
              }
            }}
          >
            <label className="icon-button" title="Joindre une photo">
              ＋
              <input
                className="file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Joindre une photo à ma question"
                onChange={(e) => void attach(e.target.files?.[0])}
              />
            </label>
            <input
              ref={input}
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={1500}
              aria-label="Ma question à Maman Chouette"
              placeholder="Explique ce qui te bloque…"
              required
            />
            <button
              className="button primary"
              disabled={
                busy || !question.trim() || Boolean(attachment && !consent)
              }
            >
              {busy ? "Un instant…" : "Envoyer"}
            </button>
            {attachment && (
              <div className="attachment-preview">
                <img src={attachment} alt="Photo à analyser" />
                <div>
                  <button
                    type="button"
                    className="textbutton"
                    onClick={() => {
                      setAttachment("");
                      setConsent(false);
                    }}
                  >
                    Retirer la photo
                  </button>
                  <label className="consent">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    J’autorise l’envoi de cette photo à DeepSeek pour analyser
                    mon dessin.
                  </label>
                </div>
              </div>
            )}
            <ErrorMessage message={error} />
          </form>
        </div>
        <aside className="paper chat-side">
          <h2 className="subhead">On peut parler de…</h2>
          {[
            "Mon feutre fait des taches.",
            "Comment réussir les dégradés ?",
            "Comment observer les proportions ?",
            "Peux-tu m’aider à comprendre l’exercice ?",
          ].map((q) => (
            <button
              key={q}
              className="prompt-btn"
              onClick={() => {
                setQuestion(q);
                input.current?.focus();
              }}
            >
              {q}
            </button>
          ))}
        </aside>
      </div>
    </>
  );
}
