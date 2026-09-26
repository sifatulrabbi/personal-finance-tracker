// The color theme is a per-device preference: it lives in this browser's storage, not on
// the server, because two people sharing the household may like different themes.
export type ThemePreference = "light" | "dark" | "system";
export type Theme = "light" | "dark";

export const themeStorageKey = "simply-finance-theme";
export const themePreferences: ThemePreference[] = ["light", "dark", "system"];

// Storage can be missing or throw (private mode, blocked site data). The app still works
// and simply follows the system theme.
type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

export function readPreference(store: KeyValueStore | undefined): ThemePreference {
  try {
    const value = store?.getItem(themeStorageKey);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function writePreference(store: KeyValueStore | undefined, preference: ThemePreference) {
  try {
    store?.setItem(themeStorageKey, preference);
  } catch {
    // Not saved; the choice still applies until the page is closed.
  }
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): Theme {
  if (preference === "system") return systemDark ? "dark" : "light";
  return preference;
}

// Keep in sync with the inline script in index.html, which runs before first paint.
export function applyTheme(root: HTMLElement, theme: Theme) {
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
}
