import { useEffect, useState } from "react";
import { weeklyEmails } from "../lib/curriculum";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import { Credits, ErrorMessage, Modal, go } from "./Common";
export function Settings({ close }: { close: () => void }) {
  const s = useStore();
  const user = s.data!.user;
  const [status, setStatus] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(0),
    [activation, setActivation] = useState(false),
    [confirmation, setConfirmation] = useState("");
  async function load() {
    if (user.role === "owner")
      try {
        setStatus(await api("/admin/status"));
      } catch (e) {
        setError((e as Error).message);
      }
  }
  useEffect(() => {
    void load();
  }, []);
  async function preference(k: "notifications" | "reminders") {
    setBusy(true);
    setError("");
    try {
      await s.preferences(
        k === "notifications" ? !user.notifications : user.notifications,
        k === "reminders" ? !user.reminders : user.reminders,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="À ma manière." close={close}>
      <div className="settings-page">
        {[
          [
            "notifications",
            "Recevoir le courrier de l’Ours",
            "Une nouvelle semaine, un dessin terminé.",
          ],
          [
            "reminders",
            "Recevoir un rappel doux",
            "Après une semaine sans dessiner.",
          ],
        ].map(([k, title, desc]) => (
          <div className="setting" key={k}>
            <div>
              <strong>{title}</strong>
              <small>{desc}</small>
            </div>
            <button
              className={
                "toggle " +
                (user[k as "notifications" | "reminders"] ? "on" : "")
              }
              aria-label={title}
              aria-pressed={user[k as "notifications" | "reminders"]}
              disabled={busy}
              onClick={() =>
                void preference(k as "notifications" | "reminders")
              }
            />
          </div>
        ))}
        <details className="dropdown">
          <summary>Le courrier des huit semaines</summary>
          {weeklyEmails.map((m) => (
            <div className="mail-row" key={m.week}>
              <span>{m.week}</span>
              <div className="mail-subject">
                <strong>{m.subject}</strong>
              </div>
              <button
                className="textbutton"
                onClick={() => setPreview(preview === m.week ? 0 : m.week)}
              >
                Aperçu
              </button>
            </div>
          ))}
          {preview > 0 && (
            <div className="mail-preview">
              <h3>{weeklyEmails[preview - 1].subject}</h3>
              <p className="preserve-lines">{weeklyEmails[preview - 1].body}</p>
              {user.role === "owner" && (
                <button
                  className="button ghost"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await api("/admin/test-email", "POST", { week: preview });
                      s.notify(
                        "Email de test envoyé au propriétaire uniquement.",
                      );
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  M’envoyer ce test (propriétaire)
                </button>
              )}
            </div>
          )}
        </details>
        {user.role === "owner" && (
          <details className="dropdown">
            <summary>Administration du cadeau</summary>
            {status ? (
              <>
                <p>
                  {status.gift_activated
                    ? "Le cadeau est ouvert."
                    : "Les envois à Papa sont désactivés."}
                </p>
                <p className="small">
                  {status.database_connected ? "Base connectée. " : ""}
                  {status.mail_configured ? "Email configuré. " : ""}
                  {status.ai_configured ? "Clé IA configurée." : ""}
                </p>
                <p className="small">
                  Ton compte propriétaire possède son propre carnet. Les essais
                  ne remplissent pas celui de Papa.
                </p>
                {status.gift_activated ? (
                  <button
                    className="button ghost"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await api("/admin/pause", "POST", {});
                        await load();
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Suspendre les envois à Papa
                  </button>
                ) : (
                  <button
                    className="button ghost"
                    onClick={() => setActivation(true)}
                  >
                    Préparer l’ouverture du cadeau
                  </button>
                )}
                {activation && !status.gift_activated && (
                  <form
                    className="stack activation"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setBusy(true);
                      try {
                        await api("/admin/activation", "POST", {
                          confirmation,
                        });
                        await load();
                        setActivation(false);
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <p>
                      Cette action autorise les liens de connexion à Papa et les
                      courriers auxquels il s’abonne. Elle ne doit être faite
                      que lorsque le cadeau peut être découvert.
                    </p>
                    <label>
                      Écris « ACTIVER LES ENVOIS À PAPA »
                      <input
                        className="simple-input"
                        value={confirmation}
                        onChange={(e) => setConfirmation(e.target.value)}
                        autoComplete="off"
                      />
                    </label>
                    <button
                      className="button primary"
                      disabled={
                        busy || confirmation !== "ACTIVER LES ENVOIS À PAPA"
                      }
                    >
                      Ouvrir le cadeau et autoriser les envois
                    </button>
                    <button
                      type="button"
                      className="button plain"
                      onClick={() => setActivation(false)}
                    >
                      Annuler
                    </button>
                  </form>
                )}
              </>
            ) : (
              <p role="status">Vérification de la configuration…</p>
            )}
          </details>
        )}
        <Credits />
        <ErrorMessage message={error} />
        <div className="divider" />
        {user.role === "owner" ? (
        <button
          className="textbutton"
          onClick={async () => {
            try {
              await s.logout();
              close();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Quitter l’administration
        </button>
        ) : (
          <button className="textbutton" onClick={() => {
            close();
            go("connexion");
          }}>
            Accès propriétaire
          </button>
        )}
      </div>
    </Modal>
  );
}
