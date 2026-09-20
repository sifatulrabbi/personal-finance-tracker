export const pages = [
  { name: "Activity", path: "/activity" },
  { name: "Wallets", path: "/wallets" },
  { name: "Bills", path: "/bills" },
  { name: "Monthly spending", path: "/monthly" },
  { name: "Settings", path: "/settings" },
] as const;

export type Page = (typeof pages)[number];

export function pageForPath(pathname: string): Page | undefined {
  if (pathname === "/") return pages[0];
  return pages.find((page) => page.path === pathname);
}
