import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyTheme,
  readPreference,
  resolveTheme,
  writePreference,
  type Theme,
  type ThemePreference,
} from "./theme";

type ThemeContextValue = {
  preference: ThemePreference;
  theme: Theme;
  setPreference(preference: ThemePreference): void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const darkQuery = "(prefers-color-scheme: dark)";

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState(() => readPreference(safeStorage()));
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(darkQuery).matches);
  useEffect(() => {
    const media = window.matchMedia(darkQuery);
    const update = () => setSystemDark(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const theme = resolveTheme(preference, systemDark);
  useEffect(() => {
    applyTheme(document.documentElement, theme);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#0f1512" : "#f7f8f4");
  }, [theme]);
  const setPreference = useCallback((next: ThemePreference) => {
    writePreference(safeStorage(), next);
    setPreferenceState(next);
  }, []);
  const value = useMemo(
    () => ({ preference, theme, setPreference }),
    [preference, theme, setPreference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme needs a ThemeProvider");
  return value;
}
