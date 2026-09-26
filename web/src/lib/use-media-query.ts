import { useCallback, useSyncExternalStore } from "react";

// Subscribes to a CSS media query, so layout choices made in React follow the same
// breakpoints as the stylesheet.
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

// Tablets and computers get centered dialogs; phones get bottom sheets.
export const desktopDialogQuery = "(min-width: 768px)";
// Computers get the left sidebar instead of the bottom tab bar.
export const sidebarQuery = "(min-width: 1024px)";
