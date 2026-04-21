import { Skeleton } from "@/components/ui/skeleton";

export function TransactionSkeletons() {
  return (
    <div className="flex flex-col gap-4">
      {[1, 2, 3].map((group) => (
        <div key={group} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-20" />
          {[1, 2].map((item) => (
            <div
              key={item}
              className="flex items-center gap-3 rounded-lg bg-card px-3 py-2.5 ring-1 ring-foreground/10"
            >
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
