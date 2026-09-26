import { matchPath } from "react-router-dom";

export const pages = [
  { name: "Home", path: "/home" },
  { name: "Activity", path: "/activity" },
  { name: "Wallets", path: "/wallets" },
  { name: "Bills", path: "/bills" },
  { name: "Monthly spending", path: "/monthly" },
  { name: "Settings", path: "/settings" },
] as const;

export type Page = (typeof pages)[number];

export const homePath = pages[0].path;

const walletDetailPattern = "/wallets/:id";

export function walletPath(id: string) {
  return `/wallets/${encodeURIComponent(id)}`;
}

// Uses the router's own matcher so the header label never disagrees with the rendered route.
export function pageForPath(pathname: string): Page | undefined {
  return pages.find((page) => matchPath(page.path, pathname));
}

// What a URL shows: a top-level page, or one wallet's detail under Wallets. The detail
// keeps Wallets as its page, so the Wallets tab stays marked while it is open.
export type Route = { page: Page; walletID?: string };

export function routeForPath(pathname: string): Route | undefined {
  const page = pageForPath(pathname);
  if (page) return { page };
  const detail = matchPath(walletDetailPattern, pathname);
  if (detail?.params.id)
    return {
      page: pages.find((p) => p.path === "/wallets")!,
      walletID: decodeSegment(detail.params.id),
    };
  return undefined;
}

// The location keeps the path percent-encoded, as walletPath wrote it.
function decodeSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
