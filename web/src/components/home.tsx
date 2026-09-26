import { Link } from "react-router-dom";
import {
  CalendarCheck,
  CalendarClock,
  ChevronRight,
  CircleAlert,
  ReceiptText,
} from "lucide-react";
import type { CurrencyTotal, Summary } from "@/api/types";
import { useCategories, useSummary, useWallets } from "@/cache/queries";
import { dueLabel, fullDate, monthLabel, shortDate } from "@/lib/dates";
import { compareDecimal, fillPercent, subtractDecimal } from "@/money/compare";
import { isZero } from "@/money/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  EmptyState,
  List,
  ListRow,
  ListSkeleton,
  LoadError,
  Meter,
  RowIcon,
  Section,
} from "@/components/layout";
import { Money } from "@/components/money";
import { RecordRow } from "@/components/activity";
import { useAddRecord } from "@/components/add-record";

// Where the household stands, from one server read (GET /summary): cash, card debt, this
// month's spending against its target, bills that need attention, and the latest records.
// Every figure is the server's; this screen only lays them out.
export function Home() {
  const summary = useSummary();
  const data = summary.data;
  return (
    <>
      <LoadError
        error={summary.error}
        hasData={Boolean(data)}
        onRetry={() => void summary.refetch()}
        what="the summary"
      />
      {!data && summary.isPending ? <HomeSkeleton /> : null}
      {data ? <HomeContent summary={data} /> : null}
    </>
  );
}

function HomeContent({ summary }: { summary: Summary }) {
  const bdt = summary.totals.find((total) => total.currency === "BDT");
  // USD appears only once the household holds or owes any.
  const others = summary.totals.filter(
    (total) =>
      total.currency !== "BDT" &&
      !(isZero(total.cash) && isZero(total.card_debt) && isZero(total.available_credit)),
  );
  return (
    <div data-testid="home" className="flex min-w-0 flex-col gap-6">
      {summary.legacy_debit_cards > 0 ? (
        <Alert variant="warning" role="note" data-testid="legacy-debit-notice">
          <CircleAlert aria-hidden />
          <AlertDescription>
          {summary.legacy_debit_cards === 1
            ? "One debit card was added before cards were linked to a bank account. "
            : `${summary.legacy_debit_cards} debit cards were added before cards were linked to a bank account. `}
          It keeps its own balance until you move that money out. Add a new card linked to its
          bank in <Link className="font-medium underline underline-offset-2" to="/wallets">Wallets</Link>, then
          archive the old one.
          </AlertDescription>
        </Alert>
      ) : null}
      {bdt ? <BalanceCard total={bdt} others={others} /> : null}
      <MonthCard summary={summary} />
      <BillsRow summary={summary} />
      <RecentRecords summary={summary} />
    </div>
  );
}

function BalanceCard({ total, others }: { total: CurrencyTotal; others: CurrencyTotal[] }) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex flex-col gap-4 px-5 py-5">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-label text-muted-foreground">Cash</p>
          <p className="@container min-w-0 text-display tracking-tight">
            <Money data-testid="home-cash-BDT" amount={total.cash} currency="BDT" />
          </p>
          <p className="text-caption font-normal text-muted-foreground">
            Every cash, bank, and digital wallet. Card credit is not counted.
          </p>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-4 border-t pt-4">
          <Figure label="Card debt">
            <Money data-testid="home-debt-BDT" amount={total.card_debt} currency="BDT" debt />
          </Figure>
          <Figure label="Available credit">
            <Money data-testid="home-available-BDT" amount={total.available_credit} currency="BDT" />
          </Figure>
        </div>
        {others.map((other) => (
          <div
            key={other.currency}
            data-testid={`home-totals-${other.currency}`}
            className="grid min-w-0 grid-cols-2 gap-4 border-t pt-4"
          >
            <Figure label={`${other.currency} cash`}>
              <Money data-testid={`home-cash-${other.currency}`} amount={other.cash} currency={other.currency} />
            </Figure>
            <Figure label={`${other.currency} card debt`}>
              <Money amount={other.card_debt} currency={other.currency} debt />
            </Figure>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <p className="text-label text-muted-foreground">{label}</p>
      <p className="min-w-0 truncate text-heading">{children}</p>
    </div>
  );
}

function MonthCard({ summary }: { summary: Summary }) {
  const { month, spent, target } = summary.month;
  const hasTarget = target.amount !== "";
  const over = hasTarget && compareDecimal(spent, target.amount) > 0;
  const difference = hasTarget ? subtractDecimal(target.amount, spent) : "";
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex flex-col gap-3 px-5 py-5">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <h2 className="text-heading">{monthLabel(month)}</h2>
          <Button asChild variant="ghost" size="sm" className="-mr-2 text-primary">
            <Link to="/monthly">
              See month
              <ChevronRight data-icon="inline-end" />
            </Link>
          </Button>
        </div>
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-title">
            <Money data-testid="home-spent" amount={spent} currency="BDT" />
          </span>
          <span className="text-label font-normal text-muted-foreground">
            {hasTarget ? (
              <>
                spent of <Money data-testid="home-target" amount={target.amount} currency="BDT" /> target
              </>
            ) : (
              "spent this month"
            )}
          </span>
        </div>
        {hasTarget ? (
          <>
            <Meter
              label="Spent against this month's target"
              percent={fillPercent(spent, target.amount)}
              tone={over ? "danger" : "primary"}
            />
            {over ? (
              <p
                data-testid="home-over-target"
                className="flex items-center gap-1.5 text-label text-destructive"
              >
                <CircleAlert aria-hidden className="size-4 shrink-0" />
                <span>
                  <Money amount={difference.replace(/^-/, "")} currency="BDT" /> over target
                </span>
              </p>
            ) : (
              <p className="text-label font-normal text-muted-foreground">
                <Money amount={difference} currency="BDT" /> left this month
                {target.inherited_from ? ` · target from ${monthLabel(target.inherited_from)}` : ""}
              </p>
            )}
          </>
        ) : (
          <p className="text-label font-normal text-muted-foreground">
            No spending target set.{" "}
            <Link className="font-medium text-primary underline-offset-2 hover:underline" to="/monthly">
              Set one
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function BillsRow({ summary }: { summary: Summary }) {
  const { due_count: count, oldest_due_date: oldest, next_due_date: next } = summary.bills;
  const late = oldest ? dueLabel(oldest, summary.today) : undefined;
  const subtitle =
    count > 0 && late
      ? late.tone === "overdue"
        ? <span className="text-warning">Oldest {late.text}</span>
        : "Due today"
      : next
        ? `Next due ${shortDate(next, summary.today)}`
        : "No bills in the next 90 days";
  return (
    <List>
      <ListRow
        to="/bills"
        data-testid="home-bills"
        leading={
          <RowIcon tone={count > 0 ? "warning" : "neutral"}>
            {count > 0 ? <CalendarClock /> : <CalendarCheck />}
          </RowIcon>
        }
        title={
          count > 0 ? (
            <span data-testid="home-due-count">
              {count} {count === 1 ? "bill" : "bills"} due
            </span>
          ) : (
            "Nothing due"
          )
        }
        subtitle={
          <>
            {subtitle}
            {count > 0 && next ? (
              <span className="text-muted-foreground"> · next {fullDate(next).replace(/ \d{4}$/, "")}</span>
            ) : null}
          </>
        }
        trailing={<ChevronRight aria-hidden className="size-5 text-muted-foreground" />}
      />
    </List>
  );
}

function RecentRecords({ summary }: { summary: Summary }) {
  const wallets = useWallets();
  const categories = useCategories();
  const addRecord = useAddRecord();
  return (
    <Section
      title="Recent records"
      action={
        summary.recent.length ? (
          <Button asChild variant="ghost" size="sm" className="-mr-2 text-primary">
            <Link to="/activity">
              See all
              <ChevronRight data-icon="inline-end" />
            </Link>
          </Button>
        ) : undefined
      }
    >
      {!summary.recent.length ? (
        <EmptyState
          icon={<ReceiptText />}
          title="No records yet"
          description="Add a wallet, then record your first income or expense."
          action={
            <Button variant="outline" onClick={(event) => addRecord.open(event)}>
              Add a record
            </Button>
          }
        />
      ) : wallets.data ? (
        <List data-testid="home-recent">
          {summary.recent.map((record) => (
            <RecordRow
              key={record.id}
              record={record}
              wallets={wallets.data}
              categories={categories.data ?? []}
              link="/activity"
              showDate
            />
          ))}
        </List>
      ) : (
        <ListSkeleton rows={Math.min(5, summary.recent.length)} />
      )}
    </Section>
  );
}

// Shaped like the loaded screen, shown only on the first load.
function HomeSkeleton() {
  return (
    <div aria-hidden data-testid="home-skeleton" className="flex flex-col gap-6">
      <Skeleton className="h-52 w-full rounded-xl" />
      <Skeleton className="h-36 w-full rounded-xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
      <ListSkeleton rows={3} />
    </div>
  );
}
