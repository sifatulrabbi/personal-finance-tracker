import { matchPath } from "react-router-dom";

export const pages = [
  { name: "Activity", path: "/activity" },
  { name: "Wallets", path: "/wallets" },
  { name: "Bills", path: "/bills" },
  { name: "Monthly spending", path: "/monthly" },
  { name: "Settings", path: "/settings" },
] as const;

export type Page = (typeof pages)[number];

export const homePath = pages[0].path;

// Uses the router's own matcher so the header label never disagrees with the rendered route.
export function pageForPath(pathname: string): Page | undefined {
  return pages.find((page) => matchPath(page.path, pathname));
}
