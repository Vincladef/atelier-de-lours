import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError } from "./api";
export interface Progress {
  lesson_id: number;
  phase: "observe" | "draw" | "finish";
  step: number;
  checked_steps: number[];
  notes: string;
  quiz_answer?: number;
  ease: string;
  joy: string;
  completed_at: string | null;
  updated_at: string;
}
export interface Artwork {
  id: string;
  lesson_id: number | null;
  title: string;
  drawn_on: string;
  note: string;
  width: number;
  height: number;
  created_at: string;
}
export interface Review {
  easy: string;
  difficult: string;
  repeat: string;
}
export interface Chat {
  id: number;
  lesson_id: number;
  role: "user" | "assistant";
  content: string;
  has_image: boolean;
}
export interface State {
  user: {
    role: "owner" | "learner";
    notifications: boolean;
    reminders: boolean;
  };
  progress: Record<string, Progress>;
  artworks: Artwork[];
  reviews: Record<string, Review>;
  chat: Chat[];
}
type Save = { path: string; patch: unknown };
interface Store {
  data: State | null;
  loading: boolean;
  authError: string;
  saved: string;
  failures: number;
  login: (token: string) => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  lesson: (
    id: number,
    patch: Partial<Progress> & { completed?: boolean },
  ) => Promise<void>;
  review: (id: number, patch: Review) => Promise<void>;
  preferences: (notifications: boolean, reminders: boolean) => Promise<void>;
  retry: () => Promise<void>;
  notify: (s: string) => void;
  toast: string;
}
const Context = createContext<Store>(null!);
export const useStore = () => useContext(Context);
export function Provider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<State | null>(null),
    [loading, setLoading] = useState(true),
    [authError, setAuthError] = useState("");
  const [saved, setSaved] = useState(""),
    [failures, setFailures] = useState(0),
    [toast, setToast] = useState("");
  const queue = useRef(Promise.resolve());
  const failed = useRef<Save[]>([]);
  const pending = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const notify = (s: string) => {
    setToast(s);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4500);
  };
  async function refresh() {
    await queue.current;
    try {
      const next = await api<State>("/state");
      for (const item of failed.current) {
        if (item.path.startsWith("/lessons/")) {
          const id = item.path.split("/")[2];
          const patch = item.patch as Partial<Progress> & {
            completed?: boolean;
          };
          next.progress[id] = Object.assign(
            {},
            next.progress[id],
            patch,
            patch.completed ? { completed_at: new Date().toISOString() } : {},
          );
        } else if (item.path.startsWith("/reviews/"))
          next.reviews[item.path.split("/")[2]] = item.patch as Review;
      }
      setData(next);
      setAuthError("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setData(null);
      else setAuthError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current || failed.current.length) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  async function login(raw: string) {
    await api("/auth/consume", "POST", { token: raw });
    await refresh();
  }
  async function logout() {
    await queue.current;
    if (failed.current.length)
      throw new Error(
        "Enregistre d’abord tes modifications avec « Réessayer ».",
      );
    await api("/auth/logout", "POST", {});
    setData(null);
  }
  function save(path: string, patch: unknown) {
    pending.current++;
    setSaved("Enregistrement…");
    const task = queue.current.then(async () => {
      try {
        await api(path, "PATCH", patch);
        // A newer successful edit supersedes failed edits of those same fields.
        const keys = new Set(Object.keys(patch as object));
        failed.current = failed.current.flatMap((item) => {
          if (item.path !== path) return [item];
          const remaining = Object.fromEntries(
            Object.entries(item.patch as object).filter(([k]) => !keys.has(k)),
          );
          return Object.keys(remaining).length
            ? [{ ...item, patch: remaining }]
            : [];
        });
        setFailures(failed.current.length);
      } catch (e) {
        failed.current.push({ path, patch });
        setFailures(failed.current.length);
        notify((e as Error).message);
      } finally {
        pending.current--;
        setSaved(
          failed.current.length
            ? "Modifications non enregistrées"
            : pending.current
              ? "Enregistrement…"
              : "Enregistré",
        );
      }
    });
    queue.current = task;
    return task;
  }
  async function lesson(
    id: number,
    patch: Partial<Progress> & { completed?: boolean },
  ) {
    setData(
      (prev) =>
        prev && {
          ...prev,
          progress: {
            ...prev.progress,
            [id]: Object.assign(
              {
                lesson_id: id,
                phase: "observe",
                step: 0,
                checked_steps: [],
                notes: "",
                ease: "",
                joy: "",
                completed_at: null,
              },
              prev.progress[id],
              patch,
              patch.completed ? { completed_at: new Date().toISOString() } : {},
              { updated_at: new Date().toISOString() },
            ),
          },
        },
    );
    await save("/lessons/" + id, patch);
  }
  async function review(id: number, patch: Review) {
    setData((p) => p && { ...p, reviews: { ...p.reviews, [id]: patch } });
    await save("/reviews/" + id, patch);
  }
  async function preferences(notifications: boolean, reminders: boolean) {
    await api("/preferences", "PATCH", { notifications, reminders });
    setData(
      (p) => p && { ...p, user: { ...p.user, notifications, reminders } },
    );
  }
  async function retry() {
    await queue.current;
    const items = failed.current;
    failed.current = [];
    setFailures(0);
    for (const item of items) await save(item.path, item.patch);
  }
  return (
    <Context.Provider
      value={{
        data,
        loading,
        authError,
        saved,
        failures,
        login,
        logout,
        refresh,
        lesson,
        review,
        preferences,
        retry,
        notify,
        toast,
      }}
    >
      {children}
    </Context.Provider>
  );
}
