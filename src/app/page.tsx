import { Button } from "@/components/ui/button";

const themeChecks = [
  "Dark mode is always active from the root document.",
  "Shared surfaces use solid dark neutrals with no gradients.",
  "Accent, border, and focus tokens all inherit the same blue family.",
];

const tokenSwatches = [
  {
    label: "App Background",
    value: "background",
    className: "bg-background",
  },
  {
    label: "Primary Surface",
    value: "card",
    className: "bg-card",
  },
  {
    label: "Muted Surface",
    value: "muted",
    className: "bg-muted",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 sm:py-12">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 rounded-[28px] border border-border bg-card px-5 py-6 shadow-2xl shadow-black/20 sm:px-8 sm:py-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-4">
            <p className="text-xs font-semibold tracking-[0.24em] text-primary uppercase">
              T-002 Theme Validation
            </p>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Finance Tracker now starts in a dark-only system.
              </h1>
              <p className="max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
                This page is a smoke test for the shared theme contract. It
                checks solid dark surfaces, the blue accent derived from
                `#0077ff`, touch-friendly controls, and focus visibility before
                we build the authenticated shell.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button>Primary Action</Button>
            <Button variant="outline">Outline Surface</Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.35fr_0.95fr]">
          <article className="rounded-[24px] border border-border bg-background p-4 sm:p-5">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                  Dark only
                </span>
                <span className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  Accent: #0077ff
                </span>
                <span className="inline-flex rounded-full border border-ring/50 px-3 py-1 text-xs font-medium text-foreground ring-2 ring-ring/25">
                  Ring token preview
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {tokenSwatches.map((swatch) => (
                  <div
                    key={swatch.value}
                    className="rounded-2xl border border-border bg-card p-3"
                  >
                    <div
                      className={`h-20 rounded-xl border border-border ${swatch.className}`}
                    />
                    <div className="mt-3 space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        {swatch.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        token: {swatch.value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-border bg-muted p-4">
                <p className="text-sm font-medium text-foreground">
                  Mobile readiness
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Buttons use larger default heights in the shared component
                  layer so basic actions stay comfortable on narrow screens
                  without page-specific overrides.
                </p>
              </div>
            </div>
          </article>

          <aside className="rounded-[24px] border border-border bg-background p-4 sm:p-5">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Shared contract checks
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tab through the buttons to confirm the ring treatment and use
                  the swatches to verify surface contrast.
                </p>
              </div>

              <div className="space-y-3">
                {themeChecks.map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-border bg-card px-4 py-3"
                  >
                    <p className="text-sm leading-6 text-foreground">{item}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
                <Button size="lg">Touch-Friendly Primary</Button>
                <Button variant="secondary" size="lg">
                  Secondary Surface
                </Button>
                <Button variant="ghost" size="lg">
                  Ghost Action
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
