import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-20">
      <section className="flex w-full max-w-2xl flex-col gap-6 rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            Foundation Bootstrap
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Finance Tracker
          </h1>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            The Next.js App Router project is scaffolded with Bun, Tailwind CSS,
            and shadcn/ui. This placeholder confirms the foundation is ready for
            the next tickets.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button>Foundation Ready</Button>
          <Button variant="outline">T-001 Complete</Button>
        </div>
      </section>
    </main>
  );
}
