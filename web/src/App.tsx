import { useLayoutEffect, useState, type FormEvent } from "react";
import { Wallet as WalletIcon, CloudOff, SearchX } from "lucide-react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ApiClient } from "@/api/client";
import { errorMessage, isApiError } from "@/api/errors";
import type { User } from "@/api/types";
import { SessionProvider, useSession } from "@/session/session";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { TextField, ErrorMessage } from "@/components/forms";
import { EmptyState } from "@/components/layout";
import { AppShell } from "@/components/shell";
import { ThemeProvider } from "@/theme/provider";
import { Wallets } from "@/components/wallets";
import { Activity } from "@/components/activity";
import { Bills } from "@/components/bills";
import { Settings } from "@/components/settings";
import { Monthly } from "@/components/monthly";
import { homePath, pageForPath } from "@/routes";

// The API client and query cache are passed in, so tests and future clients can supply
// their own.
export function App({
  api,
  queryClient,
}: {
  api: ApiClient;
  queryClient: QueryClient;
}) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider api={api}>
          <Root />
        </SessionProvider>
      </QueryClientProvider>
      <Toaster
        position="top-center"
        offset={{ top: "max(1rem, env(safe-area-inset-top))" }}
        mobileOffset={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
      />
    </ThemeProvider>
  );
}

function Root() {
  const { state, retry } = useSession();
  switch (state.status) {
    case "checking":
      return (
        <main className={`${loginFrame} gap-4`}>
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-48 w-full" />
        </main>
      );
    case "unreachable":
      // A signed-in user must not think they were logged out because the server is down.
      return (
        <main className={`${loginFrame} justify-center gap-6`}>
          <Card>
            <CardHeader>
              <div
                aria-hidden
                className="mb-2 flex size-11 items-center justify-center rounded-full bg-destructive-muted text-destructive"
              >
                <CloudOff className="size-5" />
              </div>
              <CardTitle role="heading" aria-level={1}>
                Cannot reach Simply Finance
              </CardTitle>
              <CardDescription>{state.message}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={retry}>Try again</Button>
            </CardContent>
          </Card>
        </main>
      );
    case "signedOut":
      return <LoginScreen />;
    case "signedIn":
      return (
        <>
          <AuthenticatedApp user={state.user} />
          {/* Shown over the app instead of replacing it, so an open form keeps its input. */}
          <SessionExpired open={state.expired} email={state.user.email} />
        </>
      );
  }
}

function AuthenticatedApp({ user }: { user: User }) {
  const location = useLocation();
  // Each page opens at the top instead of at the previous page's scroll position.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  if (location.pathname === "/") return <Navigate to={homePath} replace />;
  const page = pageForPath(location.pathname);
  return (
    <AppShell page={page} user={user}>
      {page ? (
        <section aria-label={page.name} className="flex min-w-0 flex-col gap-6">
          {page.path === "/activity" && <Activity />}
          {page.path === "/wallets" && <Wallets />}
          {page.path === "/bills" && <Bills />}
          {page.path === "/monthly" && <Monthly />}
          {page.path === "/settings" && <Settings user={user} />}
        </section>
      ) : (
        <NotFound />
      )}
    </AppShell>
  );
}

function NotFound() {
  return (
    <EmptyState
      icon={<SearchX />}
      title="Page not found"
      description="This address does not match a Simply Finance page."
      action={
        <Button asChild>
          <Link to={homePath}>Go to Activity</Link>
        </Button>
      }
    />
  );
}

// The signed-out screens: one centered column inside the safe area.
const loginFrame =
  "mx-auto flex min-h-dvh w-full max-w-md min-w-0 flex-col pt-[max(3rem,var(--safe-area-top))] pr-[max(1.25rem,var(--safe-area-right))] pb-[max(3rem,var(--safe-area-bottom))] pl-[max(1.25rem,var(--safe-area-left))]";

// Wrong credentials come back as 401. The legacy body says "authentication required",
// which reads like a timeout, so it gets a clearer sentence; a server message is kept.
function loginMessage(error: unknown) {
  if (isApiError(error) && error.unauthenticated && !error.fromServer)
    return "Email or password is incorrect.";
  return errorMessage(error, "Could not sign in.");
}

function LoginForm({
  email,
  submitLabel = "Sign in",
}: {
  email?: string;
  submitLabel?: string;
}) {
  const { signIn } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await signIn({
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
      });
    } catch (problem) {
      setError(loginMessage(problem));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={email}
          required
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <ErrorMessage error={error} />
        <Button size="lg" disabled={busy}>
          {busy ? "Signing in…" : submitLabel}
        </Button>
      </FieldGroup>
    </form>
  );
}

function SessionExpired({ open, email }: { open: boolean; email: string }) {
  const { signOut } = useSession();
  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-md"
        showCloseButton={false}
        // Only signing in (or out) dismisses this prompt.
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="shrink-0 border-b px-5 pt-5 pb-4">
          <DialogTitle>Sign in again</DialogTitle>
          <DialogDescription>
            Your session ended. Sign in to continue; anything you were typing
            is still there.
          </DialogDescription>
        </DialogHeader>
        <div data-slot="dialog-body" className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <FieldGroup>
            <LoginForm email={email} submitLabel="Sign in and continue" />
            <Button variant="ghost" onClick={() => void signOut().catch(() => {})}>
              Sign out instead
            </Button>
          </FieldGroup>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LoginScreen() {
  return (
    <main className={`${loginFrame} justify-center gap-8`}>
      <div className="flex flex-col gap-3">
        <div
          aria-hidden
          className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground"
        >
          <WalletIcon className="size-6" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">
          A little clarity, every day.
        </p>
        <h1 className="text-display tracking-tight">
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
          <LoginForm />
        </CardContent>
      </Card>
      <p className="text-center text-xs text-muted-foreground">
        Private records. Shared peace of mind.
      </p>
    </main>
  );
}
