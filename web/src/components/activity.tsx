import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useCategories, useWallets } from "@/cache/queries";
import { filtersFromParams, paramsFromFilters, type ActivityFilters } from "@/activity/filters";
import { ActivityFeed } from "@/components/activity-feed";
import { ActivityFilterBar } from "@/components/activity-filters";

// Home shows recent records with the same row.
export { RecordRow } from "@/components/activity-feed";

// Every record of the household, newest first, filtered by the URL's search params.
export function Activity() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const wallets = useWallets();
  const categories = useCategories();
  // Filter changes replace the history entry: Back leaves Activity instead of stepping
  // through every chip that was tapped.
  const setFilters = useCallback(
    (next: ActivityFilters) => setParams((current) => paramsFromFilters(next, current), { replace: true }),
    [setParams],
  );
  return (
    <>
      <ActivityFilterBar
        filters={filters}
        wallets={wallets.data ?? []}
        categories={categories.data ?? []}
        onChange={setFilters}
      />
      <ActivityFeed filters={filters} onClearFilters={() => setFilters({})} />
    </>
  );
}
