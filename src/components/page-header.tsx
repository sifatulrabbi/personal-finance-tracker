import type { ReactNode } from "react";

import { cn } from "@/libs/utils";

export function PageHeader({
  title,
  actions,
  className,
}: {
  title: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background px-4 py-3",
        className,
      )}
    >
      <h1 className="text-lg font-semibold">{title}</h1>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
