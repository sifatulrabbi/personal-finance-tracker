export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-border bg-card p-8 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">
            Finance Tracker
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in to your household account
          </p>
        </div>

        {params.error === "not_invited" && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            You must be invited first to access this app.
          </div>
        )}

        <a
          href="/api/auth/sign-in"
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-all hover:brightness-110 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Sign in with Google
        </a>
      </div>
    </main>
  );
}
