import { Skeleton } from "@/components/ui/skeleton";

export function AccountSkeletons() {
  return (
    <div className="flex flex-col gap-3">
      {/* Balance header skeleton */}
      <div className="flex flex-col items-center gap-1 py-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-36" />
      </div>

      {/* Card skeletons */}
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="h-4 w-40" />
        </div>
      ))}
    </div>
  );
}
