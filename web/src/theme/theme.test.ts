import { expect, test } from "bun:test";
import {
  applyTheme,
  readPreference,
  resolveTheme,
  themeStorageKey,
  writePreference,
} from "./theme";

function memoryStore(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
}

const throwing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

test("a saved light or dark choice wins; anything else follows the system", () => {
  expect(readPreference(memoryStore({ [themeStorageKey]: "dark" }))).toBe("dark");
  expect(readPreference(memoryStore({ [themeStorageKey]: "light" }))).toBe("light");
  expect(readPreference(memoryStore({ [themeStorageKey]: "purple" }))).toBe("system");
  expect(readPreference(memoryStore())).toBe("system");
  expect(readPreference(undefined)).toBe("system");
});

test("blocked storage never breaks the theme", () => {
  expect(readPreference(throwing)).toBe("system");
  expect(() => writePreference(throwing, "dark")).not.toThrow();
});

test("the choice is stored for this device", () => {
  const store = memoryStore();
  writePreference(store, "dark");
  expect(store.data[themeStorageKey]).toBe("dark");
  expect(readPreference(store)).toBe("dark");
});

test("system follows the device setting; explicit choices ignore it", () => {
  expect(resolveTheme("system", true)).toBe("dark");
  expect(resolveTheme("system", false)).toBe("light");
  expect(resolveTheme("light", true)).toBe("light");
  expect(resolveTheme("dark", false)).toBe("dark");
});

test("applying a theme toggles the dark class", () => {
  const classes = new Set<string>();
  const root = {
    classList: { toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)) },
    dataset: {} as Record<string, string>,
  } as unknown as HTMLElement;
  applyTheme(root, "dark");
  expect(classes.has("dark")).toBe(true);
  expect(root.dataset.theme).toBe("dark");
  applyTheme(root, "light");
  expect(classes.has("dark")).toBe(false);
});
