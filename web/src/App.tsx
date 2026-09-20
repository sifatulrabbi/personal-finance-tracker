import { useEffect, useState, type FormEvent } from "react";
import { Wallet as WalletIcon, RefreshCw, LogOut } from "lucide-react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api, APIError, loadData, type Data, type User } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { TextField, ErrorMessage } from "@/components/forms";
import { Wallets } from "@/components/wallets";
import { Activity } from "@/components/activity";
import { Bills } from "@/components/bills";
import { Settings } from "@/components/settings";
import { Navigation } from "@/components/navigation";
import { Monthly } from "@/components/monthly";
import { pageForPath, pages } from "@/routes";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  async function refresh() {
    try {
      setData(await loadData());
      setError("");
    } catch (error) {
      if (error instanceof APIError && error.status === 401) {
        setUser(null);
        setData(null);
      }
      setError(
        error instanceof Error
          ? error.message
          : "Could not load your records. Please refresh.",
      );
    }
  }
  useEffect(() => {
    let active = true;
    api<User>("/me")
      .then((user) => {
        if (active) setUser(user);
      })
      .catch((error) => {
        if (active && !(error instanceof APIError && error.status === 401))
          setError("Cannot reach the server. Please reload.");
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (user) void refresh();
  }, [user]);
  if (!ready)
    return (
      <main className="app-login mx-auto flex min-h-dvh max-w-md flex-col gap-4">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-48 w-full" />
      </main>
    );
  if (!user)
    return (
      <Login
        onLogin={(user) => {
          setUser(user);
          setError("");
        }}
        serverError={error}
      />
    );
  return (
    <AuthenticatedApp
      data={data}
      error={error}
      user={user}
      onRefresh={() => void refresh()}
      onLogout={async () => {
        try {
          await api("/logout", "POST", {});
          setUser(null);
          setData(null);
        } catch {
          setError("Could not sign out. Please retry.");
        }
      }}
    />
  );
}

function AuthenticatedApp({
  data,
  error,
  user,
  onRefresh,
  onLogout,
}: {
  data: Data | null;
  error: string;
  user: User;
  onRefresh: () => void;
  onLogout: () => Promise<void>;
}) {
  const location = useLocation();
  const page = pageForPath(location.pathname);
  return (
    <main className="app-shell mx-auto flex min-h-dvh max-w-md min-w-0 flex-col gap-6">
      <header className="app-header sticky top-0 z-40 flex min-w-0 items-center justify-between gap-3 bg-background pb-3">
        <Navigation />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">
            {page?.name ?? "Page not found"}
          </p>
          <h1 className="text-xl font-semibold tracking-tight">
            Simply Finance
          </h1>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label="Refresh records"
          onClick={onRefresh}
        >
          <RefreshCw />
        </Button>
      </header>
      <ErrorMessage error={error} />
      {data ? (
        <Routes>
          <Route path="/" element={<Navigate to="/activity" replace />} />
          {pages.map((page) => (
            <Route
              key={page.path}
              path={page.path}
              element={
                <section aria-label={page.name}>
                  {page.name === "Activity" && (
                    <Activity data={data} onSaved={onRefresh} />
                  )}
                  {page.name === "Wallets" && (
                    <Wallets
                      wallets={data.wallets}
                      onSaved={onRefresh}
                    />
                  )}
                  {page.name === "Bills" && (
                    <Bills data={data} onSaved={onRefresh} />
                  )}
                  {page.name === "Monthly spending" && (
                    <Monthly refreshToken={data} />
                  )}
                  {page.name === "Settings" && (
                    <Settings
                      categories={data.categories}
                      settings={data.settings}
                      user={user}
                      onSaved={onRefresh}
                    />
                  )}
                </section>
              }
            />
          ))}
          <Route path="*" element={<NotFound />} />
        </Routes>
      ) : (
        <Skeleton className="h-48 w-full" />
      )}
      <Button
        variant="ghost"
        onClick={() => void onLogout()}
      >
        <LogOut data-icon="inline-start" />
        Sign out
      </Button>
    </main>
  );
}

function NotFound() {
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Page not found
        </CardTitle>
        <CardDescription>
          This address does not match a Simply Finance page.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <Link to="/activity">Go to Activity</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function Login({
  onLogin,
  serverError,
}: {
  onLogin: (user: User) => void;
  serverError: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      onLogin(
        await api<User>("/login", "POST", {
          email: form.get("email"),
          password: form.get("password"),
        }),
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="app-login mx-auto flex min-h-dvh max-w-md min-w-0 flex-col justify-center gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <WalletIcon className="size-6" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">
          A little clarity, every day.
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Simply Finance
        </h1>
        <p className="text-muted-foreground">
          Your money. Your household.
          <br />
          One simple place to keep track.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Welcome home</CardTitle>
          <CardDescription>
            Sign in with your household account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit}>
            <FieldGroup>
              <TextField
                label="Email"
                name="email"
                type="email"
                autoComplete="username"
                required
              />
              <TextField
                label="Password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
              <ErrorMessage error={error || serverError} />
              <Button disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <p className="text-center text-xs text-muted-foreground">
        Private records. Shared peace of mind.
      </p>
    </main>
  );
}
