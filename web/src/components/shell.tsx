import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "cn";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  ChartPie,
  Ellipsis,
  List,
  LogOut,
  Monitor,
  Moon,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
  Sun,
  Wallet as WalletIcon,
} from "lucide-react";
import type { User } from "@/api/types";
import { errorMessage } from "@/api/errors";
import { useSession } from "@/session/session";
import { useTheme } from "@/theme/provider";
import type { ThemePreference } from "@/theme/theme";
import { pages, type Page } from "@/routes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AddRecordProvider, useAddRecord } from "@/components/add-record";
import { notifyError } from "@/components/feedback";

type Path = Page["path"];

const icons: Record<Path, typeof List> = {
  "/activity": List,
  "/wallets": WalletIcon,
  "/bills": CalendarClock,
  "/monthly": ChartPie,
  "/settings": SettingsIcon,
};

// Phones show three tabs, the Add button, and More; the rest live in More.
const tabPaths: Path[] = ["/activity", "/wallets", "/bills"];
const morePaths: Path[] = ["/monthly", "/settings"];
const pageByPath = (path: Path) => pages.find((page) => page.path === path)!;

export const themeOptions: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function useSignOut() {
  const { signOut } = useSession();
  return () =>
    void signOut().catch((error) =>
      notifyError(errorMessage(error, "Could not sign out. Please retry.")),
    );
}

// The signed-in frame: a bottom tab bar on phones and tablets, a left sidebar from 1024px,
// and a page header with the page name. Only one navigation is displayed at a time, so
// only one is exposed to assistive technology.
export function AppShell({
  page,
  user,
  children,
}: {
  page: Page | undefined;
  user: User;
  children: ReactNode;
}) {
  return (
    <AddRecordProvider>
      <div className="min-h-dvh min-w-0">
        <Sidebar current={page} user={user} />
        <div className="flex min-h-dvh min-w-0 flex-col lg:pl-64">
          <PageHeader title={page?.name ?? "Page not found"} />
          <main
            className={cn(
              "mx-auto flex w-full max-w-3xl min-w-0 flex-1 flex-col gap-6 pt-2",
              "pr-[max(1rem,var(--safe-area-right))] pl-[max(1rem,var(--safe-area-left))]",
              // Room for the tab bar and the home indicator under it.
              "pb-[calc(var(--tab-bar-height)+var(--safe-area-bottom)+2rem)] lg:px-8 lg:pb-12",
            )}
          >
            {children}
          </main>
        </div>
        <TabBar current={page} />
      </div>
    </AddRecordProvider>
  );
}

function PageHeader({ title }: { title: string }) {
  const queryClient = useQueryClient();
  const fetching = useIsFetching() > 0;
  return (
    <header
      className={cn(
        "sticky top-0 z-30 bg-background",
        "pt-[max(0.5rem,var(--safe-area-top))] pr-[max(1rem,var(--safe-area-right))] pl-[max(1rem,var(--safe-area-left))] lg:px-8",
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-3xl min-w-0 items-center justify-between gap-3">
        {/* Receives focus when the element that opened a sheet no longer exists. */}
        <h1
          data-page-heading=""
          tabIndex={-1}
          className="min-w-0 truncate text-title outline-none"
        >
          {title}
        </h1>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full text-muted-foreground"
          aria-label="Refresh records"
          aria-busy={fetching}
          disabled={fetching}
          // Refreshes what is on screen; loaded content stays visible meanwhile.
          onClick={() => void queryClient.invalidateQueries()}
        >
          <RefreshCw className={fetching ? "animate-spin" : undefined} />
        </Button>
      </div>
    </header>
  );
}

function TabBar({ current }: { current: Page | undefined }) {
  const addRecord = useAddRecord();
  const signOut = useSignOut();
  const { preference, setPreference } = useTheme();
  const moreActive = current ? morePaths.includes(current.path) : false;
  const tab = (path: Path) => {
    const page = pageByPath(path);
    const Icon = icons[path];
    const active = current?.path === path;
    return (
      <Link
        key={path}
        to={path}
        aria-current={active ? "page" : undefined}
        className={cn(tabClass, active ? "text-primary" : "text-muted-foreground")}
      >
        <Icon aria-hidden className="size-6" strokeWidth={active ? 2.25 : 1.75} />
        <span>{page.name}</span>
      </Link>
    );
  };
  return (
    <nav
      aria-label="Main navigation"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t bg-card lg:hidden",
        "pr-[var(--safe-area-right)] pb-[var(--safe-area-bottom)] pl-[var(--safe-area-left)]",
      )}
    >
      <div className="mx-auto grid h-(--tab-bar-height) max-w-lg grid-cols-5 items-stretch">
        {tab("/activity")}
        {tab("/wallets")}
        <div className="flex items-center justify-center">
          <button
            type="button"
            aria-label="Add record"
            onClick={(event) => addRecord.open(event)}
            className="flex size-14 -translate-y-3 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition-transform outline-none hover:bg-primary/90 focus-visible:ring-ring/60 active:scale-95"
          >
            <Plus aria-hidden className="size-7" strokeWidth={2.25} />
          </button>
        </div>
        {tab("/bills")}
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              tabClass,
              "cursor-pointer",
              moreActive ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Ellipsis aria-hidden className="size-6" strokeWidth={moreActive ? 2.25 : 1.75} />
            <span>More</span>
          </DropdownMenuTrigger>
          {/* No close animation: after choosing a page, the menu must not linger over it. */}
          <DropdownMenuContent
            side="top"
            align="end"
            className="w-64 data-[state=closed]:animate-none"
          >
            {morePaths.map((path) => {
              const Icon = icons[path];
              const active = current?.path === path;
              return (
                <DropdownMenuItem key={path} asChild>
                  <Link to={path} aria-current={active ? "page" : undefined}>
                    <Icon aria-hidden />
                    {pageByPath(path).name}
                  </Link>
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Theme</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={preference}
              onValueChange={(value) => setPreference(value as ThemePreference)}
            >
              {themeOptions.map(({ value, label, icon: Icon }) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  <Icon aria-hidden />
                  {label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut}>
              <LogOut aria-hidden />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}

const tabClass =
  "flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md text-caption outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:ring-inset";

function Sidebar({ current, user }: { current: Page | undefined; user: User }) {
  const addRecord = useAddRecord();
  const signOut = useSignOut();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 border-r bg-card px-4 py-6 lg:flex">
      <div className="flex items-center gap-3 px-2">
        <div
          aria-hidden
          className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"
        >
          <WalletIcon className="size-5" />
        </div>
        <span className="text-heading">Simply Finance</span>
      </div>
      <Button className="w-full" onClick={(event) => addRecord.open(event)}>
        <Plus data-icon="inline-start" />
        Add record
      </Button>
      <nav aria-label="Main navigation" className="flex flex-col gap-1">
        {[...tabPaths, ...morePaths].map((path) => {
          const Icon = icons[path];
          const active = current?.path === path;
          return (
            <Link
              key={path}
              to={path}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-lg px-3 font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/60",
                active
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon aria-hidden className={cn("size-5", active && "text-primary")} />
              {pageByPath(path).name}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-4">
        <ThemeChoice />
        <div className="flex min-w-0 items-center gap-2 border-t pt-4">
          <div className="flex min-w-0 flex-1 flex-col px-2">
            <span className="truncate text-label">{user.name || user.email}</span>
            <span className="truncate text-caption font-normal text-muted-foreground">
              {user.email}
            </span>
          </div>
          <Button variant="ghost" size="icon" aria-label="Sign out" onClick={signOut}>
            <LogOut />
          </Button>
        </div>
      </div>
    </aside>
  );
}

// Light, dark, or follow the device. Stored on this device only.
export function ThemeChoice() {
  const { preference, setPreference } = useTheme();
  return (
    <ToggleGroup
      type="single"
      aria-label="Theme"
      value={preference}
      // Radix sends "" when the chosen item is pressed again; keep the current choice.
      onValueChange={(value) => value && setPreference(value as ThemePreference)}
    >
      {themeOptions.map(({ value, label, icon: Icon }) => (
        <ToggleGroupItem key={value} value={value} aria-label={label}>
          <Icon aria-hidden />
          <span>{label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
