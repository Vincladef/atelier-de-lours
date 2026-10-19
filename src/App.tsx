import { useEffect, useRef, useState } from "react";
import { api } from "./lib/api";
import { useStore } from "./lib/store";
import { ErrorMessage, go, Photo } from "./components/Common";
import { canOpenLesson } from "./lib/curriculum";
import { Home, Program, Letter, LockedLesson } from "./components/Pages";
import { LessonPage } from "./components/Lesson";
import { Notebook } from "./components/Notebook";
import { Studio } from "./components/Studio";
import { Owl } from "./components/Owl";
import { Settings } from "./components/Settings";

const nav = [
  ["atelier", "Mon atelier", "⌂", "Atelier"],
  ["cours", "Les cours", "▤", "Cours"],
  ["carnet", "Mon carnet", "▧", "Carnet"],
  ["chouette", "Maman Chouette", "✳", "Chouette"],
];
export function App() {
  const s = useStore();
  const [route, setRoute] = useState(() => location.hash.slice(1) || "atelier");
  const [settings, setSettings] = useState(false);
  const [loginError, setLoginError] = useState("");
  const consumed = useRef(false);
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    const change = () => {
      setRoute(location.hash.slice(1) || "atelier");
      window.scrollTo(0, 0);
      setTimeout(() => main.current?.focus(), 0);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const token = new URLSearchParams(route.split("?")[1]).get("token");
  useEffect(() => {
    if (!token || consumed.current) return;
    consumed.current = true;
    history.replaceState(null, "", location.pathname + "#connexion");
    s.login(token)
      .then(() => go("atelier"))
      .catch((e) => setLoginError(e.message));
  }, [token]);
  const [root, param] = route.split("/");
  const active = root === "studio" || root === "lettre" ? "carnet" : root;
  let content;
  if (s.loading || (token && !s.data && !loginError))
    content = (
      <div className="loading" role="status">
        Ouverture de l’atelier…
      </div>
    );
  else if (root.split("?")[0] === "connexion")
    content = <Login error={loginError} />;
  else if (!s.data)
    content = (
      <div className="loading">
        <ErrorMessage
          message={
            s.authError || "L’atelier ne peut pas s’ouvrir pour le moment."
          }
        />
        <button className="button primary" onClick={() => void s.refresh()}>
          Réessayer
        </button>
      </div>
    );
  else if (
    root === "cours" &&
    param &&
    Number.isInteger(Number(param)) &&
    Number(param) >= 1 &&
    Number(param) <= 16
  )
    content = canOpenLesson(Number(param), s.data.progress) ? (
      <LessonPage key={param} id={Number(param)} />
    ) : (
      <LockedLesson id={Number(param)} />
    );
  else if (root === "cours") content = <Program />;
  else if (root === "carnet") content = <Notebook />;
  else if (root === "studio") content = <Studio />;
  else if (root === "chouette") content = <Owl />;
  else if (root === "lettre") content = <Letter />;
  else content = <Home />;
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#contenu"
        onClick={(e) => {
          e.preventDefault();
          main.current?.focus();
        }}
      >
        Aller au contenu
      </a>
      <header className="site-head">
        <div className="head-inner">
          <button
            className="brand"
            onClick={() => go("atelier")}
            aria-label="Accueil L’Atelier de l’Ours"
          >
            <span className="seal">O.</span>
            <span>
              <strong>
                L’Atelier
                <br />
                de l’Ours
              </strong>
              <small>Carnet d’artiste</small>
            </span>
          </button>
          {s.data && (
            <>
              <nav className="mainnav" aria-label="Navigation principale">
                {nav.map(([path, label]) => (
                  <button
                    key={path}
                    className={"navbtn " + (active === path ? "on" : "")}
                    aria-current={active === path ? "page" : undefined}
                    onClick={() => go(path)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <div className="head-end">
                <button
                  className="head-avatar"
                  onClick={() => setSettings(true)}
                  aria-label="Préférences"
                >
                  ⚙
                </button>
              </div>
            </>
          )}
        </div>
      </header>
      <main className="site-main" id="contenu" tabIndex={-1} ref={main}>
        {s.data && s.failures > 0 && (
          <div className="save-warning" role="alert">
            Certaines modifications ne sont pas encore enregistrées.{" "}
            <button className="textbutton" onClick={() => void s.retry()}>
              Réessayer
            </button>
          </div>
        )}
        {content}
        <div className="save-status" role="status" aria-live="polite">
          {s.saved}
        </div>
      </main>
      <footer className="footer">
        <span>L’Atelier de l’Ours</span>
        {s.data && (
          <div>
            <button onClick={() => go("lettre")}>Un mot pour Papa ♡</button> ·{" "}
            <button onClick={() => setSettings(true)}>
              Préférences & crédits
            </button>
          </div>
        )}
      </footer>
      {s.data && (
        <nav className="mobile-nav" aria-label="Navigation mobile">
          {nav.map(([path, , icon, label]) => (
            <button
              key={path}
              aria-current={active === path ? "page" : undefined}
              className={active === path ? "on" : ""}
              onClick={() => go(path)}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </button>
          ))}
        </nav>
      )}
      {settings && <Settings close={() => setSettings(false)} />}
      <div
        role="status"
        aria-live="polite"
        className={"toast " + (s.toast ? "show" : "")}
      >
        {s.toast}
      </div>
    </div>
  );
}
function Login({ error }: { error: string }) {
  const [email, setEmail] = useState(""),
    [message, setMessage] = useState(""),
    [localError, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="hero login-hero">
      <div className="hero-copy">
        <span className="p-eyebrow">Un atelier pour toi</span>
        <h1 className="title">Accès propriétaire</h1>
        <p className="deck">
          Entre l’adresse du propriétaire pour administrer le cadeau.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const r = await api("/auth/request", "POST", { email });
              setMessage(r.message);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
          className="stack"
        >
          <label htmlFor="login-email">Ton adresse email</label>
          <input
            id="login-email"
            className="simple-input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
          />
          <button className="button primary" disabled={busy}>
            {busy ? "Envoi du lien…" : "Recevoir mon lien →"}
          </button>
          <ErrorMessage message={localError || error} />
          {message && <p role="status">{message}</p>}
        </form>
      </div>
      <div className="hero-visual">
        <Photo name="oursClairiere" eager />
        <div className="tape" />
      </div>
    </div>
  );
}
