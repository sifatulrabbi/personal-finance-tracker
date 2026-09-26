import { useEffect, useMemo, useRef, type MouseEvent, type ReactNode } from "react";
import { cn } from "cn";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ReceiptText, Scale, SearchX } from "lucide-react";
import type { Category, Transaction, Wallet } from "@/api/types";
import { useCategories, useSettings, useTransactionList, useWallets } from "@/cache/queries";
import { groupByDay } from "@/activity/days";
import { hasFilters, listFilters, type ActivityFilters } from "@/activity/filters";
import { authorName } from "@/activity/people";
import { useSession } from "@/session/session";
import { directionForKind } from "@/money/format";
import { shortDate } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/forms";
import {
  EmptyState,
  List,
  ListRow,
  ListSkeleton,
  LoadError,
  Modal,
  RowIcon,
  useEditor,
} from "@/components/layout";
import { Money } from "@/components/money";
import { RecordDetail, kindLabels, recordTitle } from "@/components/record-detail";
import { useAddRecord } from "@/components/add-record";

// The day headers stick under the page header, whose height is the safe area plus 3.5rem
// (4rem from the lg breakpoint, where the safe area is not used).
const stickyTop = "top-[calc(max(0.5rem,var(--safe-area-top))+3.5rem)] lg:top-[4.5rem]";

// A list of records, grouped by Asia/Dhaka day, with its own detail sheet. Activity shows it
// with the filters from the URL; a wallet page can show one wallet's records with `walletId`.
export function ActivityFeed({
  filters = {},
  walletId,
  onClearFilters,
}: {
  filters?: ActivityFilters;
  // Limits the list to one wallet (its own and, for a bank, its debit cards' records).
  walletId?: string;
  onClearFilters?: () => void;
}) {
  const effective = walletId ? { ...filters, wallet: walletId } : filters;
  const list = useTransactionList(listFilters(effective));
  const walletsQuery = useWallets();
  const categoriesQuery = useCategories();
  const settingsQuery = useSettings();
  const addRecord = useAddRecord();
  const { state } = useSession();
  const me = state.status === "signedIn" ? state.user.email : undefined;
  const wallets = walletsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const editor = useEditor<Transaction>();
  const groups = useMemo(() => groupByDay(list.records), [list.records]);
  const filtered = hasFilters(filters);
  // Show the latest copy of the open record, falling back to the one that was opened.
  const open = editor.value;
  const detail = open ? (list.records.find((r) => r.id === open.id) ?? open) : undefined;
  const ready = Boolean(walletsQuery.data && categoriesQuery.data && settingsQuery.data);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <LoadError
        error={list.isFetchNextPageError ? null : list.error}
        hasData={Boolean(list.data)}
        onRetry={() => void list.refetch()}
        what="records"
      />
      {list.isPending ? <ListSkeleton rows={6} data-testid="activity-skeleton" /> : null}
      {list.data && !list.records.length && !list.isPlaceholderData ? (
        filtered ? (
          <EmptyState
            icon={<SearchX />}
            title="No records match"
            description="Nothing recorded fits these filters. Try another wallet, category or date range."
            action={
              onClearFilters ? (
                <Button variant="outline" onClick={onClearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <EmptyState
            icon={<ReceiptText />}
            title={walletId ? "No records yet" : "A fresh start"}
            description={
              walletId
                ? "Records made with this wallet will appear here."
                : "Record your first income or expense. You will need a wallet first."
            }
            action={
              <Button variant="outline" onClick={(event) => addRecord.open(event)}>
                Add your first record
              </Button>
            }
          />
        )
      ) : null}
      {groups.length ? (
        <div
          data-testid="activity-list"
          aria-busy={list.isPlaceholderData || undefined}
          className={cn(
            "flex min-w-0 flex-col gap-4 transition-opacity",
            list.isPlaceholderData && "opacity-60",
          )}
        >
          {groups.map((group) => (
            <section key={`${group.date}-${group.records[0].id}`} aria-label={group.label} data-testid="activity-day">
              <h2
                className={cn(
                  "sticky z-20 bg-background py-2 text-label text-muted-foreground",
                  stickyTop,
                )}
              >
                <time dateTime={group.date}>{group.label}</time>
              </h2>
              <List>
                {group.records.map((record) => (
                  <RecordRow
                    key={record.id}
                    record={record}
                    wallets={wallets}
                    categories={categories}
                    onOpen={(event) => editor.open(record, event)}
                  />
                ))}
              </List>
            </section>
          ))}
        </div>
      ) : null}
      {list.isFetchNextPageError ? (
        <ErrorMessage error="Could not load more records. Please retry." />
      ) : null}
      {list.hasNextPage ? (
        <LoadMore
          loading={list.isFetchingNextPage}
          // After a failed page, only the button retries, so a broken connection is not
          // hammered by scrolling.
          auto={!list.isFetchNextPageError && !list.isPlaceholderData}
          onLoad={() => void list.fetchNextPage()}
        />
      ) : null}
      <Modal
        open={editor.isOpen}
        onClose={editor.close}
        returnFocus={editor.trigger}
        title="Record details"
        description="Corrections keep every earlier version and who made it."
      >
        {ready && detail ? (
          <RecordDetail
            key={detail.id}
            record={detail}
            wallets={wallets}
            categories={categories}
            settings={settingsQuery.data!}
            me={me}
            onDone={editor.close}
          />
        ) : null}
      </Modal>
    </div>
  );
}

// Loads the next page when the user scrolls near the end, with a real button as the
// fallback (keyboard users, screen readers, browsers without IntersectionObserver).
function LoadMore({ loading, auto, onLoad }: { loading: boolean; auto: boolean; onLoad: () => void }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const load = useRef(onLoad);
  load.current = onLoad;
  useEffect(() => {
    const element = sentinel.current;
    if (!auto || loading || !element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) load.current();
      },
      { rootMargin: "0px 0px 600px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [auto, loading]);
  return (
    <div ref={sentinel} className="flex justify-center">
      <Button variant="outline" disabled={loading} onClick={onLoad}>
        {loading ? "Loading…" : "Load more records"}
      </Button>
    </div>
  );
}

function KindIcon({ kind }: { kind: Transaction["kind"] }) {
  const icon: Record<Transaction["kind"], ReactNode> = {
    income: <ArrowDownLeft />,
    transfer: <ArrowLeftRight />,
    expense: <ArrowUpRight />,
    opening: <Scale />,
    adjustment: <Scale />,
  };
  return (
    <RowIcon tone={kind === "income" ? "income" : kind === "transfer" ? "transfer" : "neutral"}>
      {icon[kind]}
    </RowIcon>
  );
}

// One compact record row: title, wallet and category, the signed amount, and who recorded
// it. It opens the record in place, or links elsewhere (Home links each recent record to
// Activity). Outside a day-grouped list, `showDate` adds the record's date.
export function RecordRow({
  record,
  wallets,
  categories,
  onOpen,
  link,
  showDate = false,
}: {
  record: Transaction;
  wallets: Wallet[];
  categories: Category[];
  onOpen?: (event: MouseEvent<HTMLButtonElement>) => void;
  link?: string;
  showDate?: boolean;
}) {
  const { state } = useSession();
  const me = state.status === "signedIn" ? state.user.email : undefined;
  const wallet = wallets.find((w) => w.id === record.wallet_id);
  const to = record.to_wallet_id ? wallets.find((w) => w.id === record.to_wallet_id) : undefined;
  const category = record.category_id ? categories.find((c) => c.id === record.category_id)?.name : undefined;
  const title = recordTitle(record, categories);
  const meta = [
    record.to_wallet_id ? `${wallet?.name ?? "Wallet"} → ${to?.name ?? "Wallet"}` : wallet?.name,
    // The category is the title when there is no note; it is not repeated.
    category && category !== title ? category : undefined,
    record.kind === "opening" || record.kind === "adjustment"
      ? title === kindLabels[record.kind]
        ? undefined
        : kindLabels[record.kind]
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <ListRow
      data-testid="activity-row"
      data-voided={record.voided ? "" : undefined}
      onClick={onOpen}
      to={link}
      leading={<KindIcon kind={record.kind} />}
      title={
        <span
          className={cn("block truncate", record.voided && "text-muted-foreground line-through decoration-1")}
          title={title}
        >
          {title}
        </span>
      }
      subtitle={
        <span className="block truncate" title={meta}>
          {meta}
        </span>
      }
      trailing={
        <Money
          className="font-semibold"
          amount={record.amount}
          currency={wallet?.currency ?? "BDT"}
          direction={directionForKind(record.kind)}
          voided={record.voided}
        />
      }
      meta={
        <span className="flex items-center gap-1.5 text-caption font-normal text-muted-foreground">
          {record.voided ? <Badge variant="outline">Voided</Badge> : null}
          <span title={record.actor_email}>{authorName(record.actor_email, me)}</span>
          {showDate ? (
            <>
              <span aria-hidden>·</span>
              <time dateTime={record.date}>{shortDate(record.date)}</time>
            </>
          ) : null}
        </span>
      }
    />
  );
}
