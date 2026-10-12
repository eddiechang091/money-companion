import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { awardBadge } from "@/features/gamification/awardBadges";
import type { ReactNode } from "react";
import { getKvStore } from "@/services/anna/storage";
import { STORAGE_KEYS } from "@/lib/constants";
import { DEFAULT_THEME, isThemeId } from "./themes";
import type { ThemeId } from "./themes";
import { THEME_BACKGROUNDS } from "./themeBackgrounds";

interface ThemeContextValue {
  theme: ThemeId;
  loaded: boolean;
  setTheme: (id: ThemeId) => void;
  /** Data-URI page background for the active theme. */
  background: string;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyThemeAttribute(id: ThemeId) {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = id;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Apply the default immediately to avoid a flash of unthemed UI.
    applyThemeAttribute(DEFAULT_THEME);
    let cancelled = false;
    (async () => {
      try {
        const store = await getKvStore();
        const saved = await store.get<unknown>(STORAGE_KEYS.theme);
        if (!cancelled && isThemeId(saved)) {
          setThemeState(saved);
          applyThemeAttribute(saved);
        }
      } catch {
        /* keep default */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const themeRef = useRef(theme);
  themeRef.current = theme;

  const setTheme = useCallback((id: ThemeId) => {
    const changed = id !== themeRef.current;
    setThemeState(id);
    applyThemeAttribute(id);
    (async () => {
      try {
        const store = await getKvStore();
        await store.set(STORAGE_KEYS.theme, id);
      } catch {
        /* non-fatal */
      }
    })();
    // Celebrate the first real theme change immediately.
    if (changed) void awardBadge("theme-changer");
  }, []);

  const value = useMemo(
    () => ({ theme, loaded, setTheme, background: THEME_BACKGROUNDS[theme] }),
    [theme, loaded, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Shared theme state — every consumer sees updates immediately. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
