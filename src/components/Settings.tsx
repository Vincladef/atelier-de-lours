import { Fragment, useEffect, useState } from "react";
import { mailContent } from "../lib/mailContent";
import { weeklyEmails } from "../lib/curriculum";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import { Credits, ErrorMessage, Modal } from "./Common";
export function Settings({ close }: { close: () => void }) {
  const s = useStore();
  const user = s.data!.user;
  const [status, setStatus] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(0),
    [confirmation, setConfirmation] = useState(""),
    [resetConfirmation, setResetConfirmation] = useState(""),
    [eraseNotebook, setEraseNotebook] = useState(false),
    [inviteNotifications, setInviteNotifications] = useState(true);
  async function load() {
    try {
      setStatus(await api("/settings/status"));
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
    <Modal title="Mes préférences" close={close}>
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
            <Fragment key={m.week}>
              <div className="mail-row">
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
              {preview === m.week && (
                <div className="mail-preview">
                  <h3>{weeklyEmails[preview - 1].subject}</h3>
                  <iframe
                    title="Aperçu de l’email"
                    className="mail-preview-frame"
                    sandbox=""
                    srcDoc={mailContent("weekly", preview).html}
                  />
                  {
                    <button
                      className="button ghost"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setError("");
                        try {
                          await api("/settings/test-email", "POST", {
                            week: preview,
                          });
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
                      Envoyer un test à l’adresse de préparation
                    </button>
                  }
                </div>
              )}
            </Fragment>
          ))}
        </details>
        {
          <details className="dropdown">
            <summary>La formation et les emails</summary>
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
                {status.gift_activated && (
                  <button
                    className="textbutton"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        await api("/settings/pause", "POST", {});
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
                )}
                <details className="dropdown">
                  <summary>Inviter Papa à commencer</summary>
                  {status.invitation?.status === "sent" ? (
                    <>
                      <p role="status">
                        L’invitation a déjà été envoyée pour ce parcours.
                      </p>
                      {!status.gift_activated && (
                        <button
                          className="button ghost"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            setError("");
                            try {
                              await api("/settings/activation", "POST", {
                                confirmation: "ACTIVER LES ENVOIS À PAPA",
                              });
                              await load();
                            } catch (e) {
                              setError((e as Error).message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Réautoriser les courriers de formation
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <p>
                        Ce premier email sera envoyé immédiatement à Papa, avec
                        un bouton vers l’atelier. Cette action ouvre les envois
                        pour le cadeau.
                      </p>
                      <iframe
                        title="Aperçu de l’invitation"
                        className="mail-preview-frame"
                        sandbox=""
                        srcDoc={mailContent("welcome", 1).html}
                      />
                      <form
                        className="stack"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          setBusy(true);
                          setError("");
                          try {
                            const result = await api<{ already_sent: boolean }>(
                              "/settings/invite",
                              "POST",
                              {
                                confirmation,
                                notifications: inviteNotifications,
                              },
                            );
                            setConfirmation("");
                            await load();
                            s.notify(
                              result.already_sent
                                ? "L’invitation était déjà envoyée."
                                : "Invitation envoyée à Papa.",
                            );
                          } catch (e) {
                            setError((e as Error).message);
                            await load();
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <label className="consent">
                          <input
                            type="checkbox"
                            checked={inviteNotifications}
                            onChange={(e) =>
                              setInviteNotifications(e.target.checked)
                            }
                            disabled={busy}
                          />
                          Activer ensuite les courriers de formation. Papa
                          pourra les désactiver dans ses préférences.
                        </label>
                        <label>
                          Écris « INVITER PAPA » pour confirmer l’envoi
                          <input
                            className="simple-input"
                            value={confirmation}
                            onChange={(e) => setConfirmation(e.target.value)}
                            autoComplete="off"
                          />
                        </label>
                        {status.invitation &&
                          ["sending", "uncertain"].includes(
                            status.invitation.status,
                          ) && (
                            <p role="status">
                              L’envoi est en cours ou non confirmé. Aucun nouvel
                              envoi n’est autorisé pour éviter un doublon.
                            </p>
                          )}
                        <button
                          className="button primary"
                          disabled={
                            busy ||
                            confirmation !== "INVITER PAPA" ||
                            (status.invitation &&
                              ["sending", "uncertain"].includes(
                                status.invitation.status,
                              ))
                          }
                        >
                          Envoyer l’invitation à Papa
                        </button>
                      </form>
                    </>
                  )}
                </details>
                <details className="dropdown">
                  <summary>Recommencer la formation de Papa</summary>
                  <p>
                    Remet la progression à 0 % et efface les notes de cours, les
                    bilans et les conversations avec Maman Chouette. Les envois
                    sont suspendus. Le carnet est conservé par défaut. Une
                    nouvelle invitation pourra ensuite être envoyée.
                  </p>
                  <form
                    className="stack"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setBusy(true);
                      setError("");
                      try {
                        await s.refresh();
                        await api("/settings/reset", "POST", {
                          confirmation: resetConfirmation,
                          erase_notebook: eraseNotebook,
                        });
                        setResetConfirmation("");
                        setEraseNotebook(false);
                        await s.refresh();
                        await load();
                        s.notify("La formation de Papa est remise à zéro.");
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <label className="consent">
                      <input
                        type="checkbox"
                        checked={eraseNotebook}
                        onChange={(e) => setEraseNotebook(e.target.checked)}
                        disabled={busy}
                      />
                      Supprimer aussi les dessins et les photographies du
                      carnet. Cette suppression est définitive.
                    </label>
                    <label>
                      Écris « RECOMMENCER » pour confirmer
                      <input
                        className="simple-input"
                        value={resetConfirmation}
                        onChange={(e) => setResetConfirmation(e.target.value)}
                        autoComplete="off"
                      />
                    </label>
                    <button
                      className="button ghost"
                      disabled={busy || resetConfirmation !== "RECOMMENCER"}
                    >
                      Réinitialiser la formation de Papa
                    </button>
                  </form>
                </details>
              </>
            ) : (
              <p role="status">Vérification de la configuration…</p>
            )}
          </details>
        }
        <Credits />
        <ErrorMessage message={error} />
      </div>
    </Modal>
  );
}
