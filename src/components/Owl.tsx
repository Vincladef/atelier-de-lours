import { useEffect, useRef, useState } from "react";
import { api, compress } from "../lib/api";
import { lessons, nextLesson, type LessonStage } from "../lib/curriculum";
import { useStore, type Chat } from "../lib/store";
import { ErrorMessage, Photo } from "./Common";

export function Owl() {
  const s = useStore();
  const routeLesson = Number(location.hash.split("/")[1]);
  const [context, setContext] = useState(
    routeLesson >= 1 && routeLesson <= 16
      ? routeLesson
      : nextLesson(s.data!.progress).index,
  );
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
        <Conversation key={context} lessonId={context} onContext={setContext} />
      </div>
    </>
  );
}

/** One composer and one API for both the lesson panel and the full conversation. */
export function Conversation({
  lessonId,
  stage,
  onContext,
  active = true,
}: {
  lessonId: number;
  stage?: LessonStage;
  active?: boolean;
  onContext?: (id: number) => void;
}) {
  const s = useStore();
  const [question, setQuestion] = useState(""),
    [attachment, setAttachment] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [attaching, setAttaching] = useState(false),
    [error, setError] = useState(""),
    [messages, setMessages] = useState<Chat[]>([]),
    [older, setOlder] = useState(false),
    [loading, setLoading] = useState(true);
  const log = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const follow = useRef(true);
  async function history(before?: number) {
    const result = await api<{ messages: Chat[]; has_more: boolean }>(
      `/chat?lesson_id=${lessonId}${before ? `&before=${before}` : ""}`,
    );
    if (!mounted.current) return;
    follow.current = !before;
    setMessages((prev) =>
      before ? [...result.messages, ...prev] : result.messages,
    );
    setOlder(result.has_more);
  }
  useEffect(() => {
    mounted.current = true;
    void history()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    return () => {
      mounted.current = false;
    };
  }, [lessonId]);
  useEffect(() => {
    if (active && follow.current && log.current)
      log.current.scrollTop = log.current.scrollHeight;
  }, [messages, busy, active]);
  async function attach(file?: File) {
    if (!file) return;
    setError("");
    setAttaching(true);
    try {
      setAttachment(await compress(file));
      setConsent(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAttaching(false);
    }
  }
  return (
    <>
      <div className={onContext ? "paper chat-card" : "lesson-conversation"}>
        {onContext && (
          <label className="chat-context">
            À propos de
            <select
              className="simple-input"
              value={lessonId}
              onChange={(e) => onContext(Number(e.target.value))}
            >
              {lessons.map((l) => (
                <option key={l.index} value={l.index}>
                  Séance {l.index} · {l.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <div
          className="chatlog"
          ref={log}
          role="log"
          aria-label="Conversation avec Maman Chouette"
          aria-live="polite"
          aria-busy={busy || loading}
        >
          {older && (
            <button
              className="textbutton"
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                setError("");
                const height = log.current?.scrollHeight || 0;
                try {
                  await history(messages[0]?.id);
                  requestAnimationFrame(() => {
                    if (log.current)
                      log.current.scrollTop +=
                        log.current.scrollHeight - height;
                  });
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setLoading(false);
                }
              }}
            >
              Échanges précédents
            </button>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={"msg " + (m.role === "user" ? "user" : "bot")}
            >
              <span className="sr-only">
                {m.role === "user" ? "Toi : " : "Maman Chouette : "}
              </span>
              {m.phase && m.role === "user" && (
                <small className="message-stage">
                  {m.phase === "draw"
                    ? `Dessiner · Geste ${(m.step ?? 0) + 1}`
                    : m.phase === "observe"
                      ? "Regarder"
                      : "Terminer"}
                </small>
              )}
              {m.content}
              {m.has_image && (
                <small>Une photo a été jointe à cette question.</small>
              )}
            </div>
          ))}
          {!loading && !messages.length && (
            <p className="subtle">
              Qu’est-ce qui te pose difficulté dans cette séance ?
            </p>
          )}
          {(busy || loading) && (
            <p role="status">
              {busy
                ? "Maman Chouette regarde ta question…"
                : "Ouverture de la conversation…"}
            </p>
          )}
        </div>
        <form
          className="chat-compose"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy || attaching) return;
            setBusy(true);
            setError("");
            follow.current = true;
            try {
              await api("/chat", "POST", {
                lesson_id: lessonId,
                question,
                image: attachment || undefined,
                consent,
                stage,
              });
              setQuestion("");
              setAttachment("");
              setConsent(false);
              await history();
              await s.refresh();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
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
              disabled={busy || attaching}
              onChange={(e) => {
                void attach(e.target.files?.[0]);
                e.target.value = "";
              }}
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
            disabled={busy}
          />
          <button
            className="button primary"
            disabled={
              busy ||
              attaching ||
              !question.trim() ||
              Boolean(attachment && !consent)
            }
          >
            {busy ? "Un instant…" : "Envoyer"}
          </button>
          {attaching && <p role="status">Préparation de la photo…</p>}
          {attachment && (
            <div className="attachment-preview">
              <img src={attachment} alt="Photo à analyser" />
              <div>
                <button
                  type="button"
                  className="textbutton"
                  disabled={busy}
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
                    disabled={busy}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  J’autorise l’envoi de cette photo à DeepSeek pour analyser mon
                  dessin.
                </label>
              </div>
            </div>
          )}
          <ErrorMessage message={error} />
        </form>
      </div>
      {onContext && (
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
      )}
    </>
  );
}
