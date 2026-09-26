import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Archive,
  ArchiveRestore,
  Banknote,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CreditCard,
  Landmark,
  List as ListIcon,
  Pencil,
  Plus,
  SlidersHorizontal,
  Smartphone,
  Wallet as WalletIcon,
} from "lucide-react";
import type { CardType, Currency, Wallet, WalletType } from "@/api/types";
import { isApiError } from "@/api/errors";
import { useWallet, useWallets } from "@/cache/queries";
import { useWrites } from "@/cache/writes";
import { fillPercent } from "@/money/compare";
import { walletPath } from "@/routes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FieldDescription } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Choice,
  MoneyField,
  SaveForm,
  TextField,
  Notes,
  WarningMessage,
} from "@/components/forms";
import {
  EmptyState,
  List,
  ListRow,
  ListSkeleton,
  LoadError,
  Meter,
  Modal,
  PageIntro,
  RowIcon,
  Section,
  useEditor,
} from "@/components/layout";
import { Money } from "@/components/money";
import { useHeaderTitle } from "@/components/shell";

const types: { value: WalletType; label: string }[] = [
  { value: "physical", label: "Physical cash" },
  { value: "bank", label: "Bank account" },
  { value: "digital", label: "Digital wallet" },
  { value: "card", label: "Card" },
];

// The groups on the Wallets page. Cards stay apart from cash so debt is never read as money
// the household holds.
const groups: { title: string; types: WalletType[] }[] = [
  { title: "Cash & bank", types: ["physical", "bank"] },
  { title: "Digital", types: ["digital"] },
  { title: "Cards", types: ["card"] },
];

// A debit card created before bank linking keeps its own balance (ADR 0011).
const isLegacyDebit = (wallet: Wallet) =>
  wallet.type === "card" && wallet.card_type !== "credit" && !wallet.bank_wallet_id;

function typeLabel(wallet: Wallet) {
  if (wallet.card_type === "credit") return "Credit card";
  if (wallet.type === "card") return "Debit card";
  return types.find((type) => type.value === wallet.type)?.label ?? "Wallet";
}

function WalletIconFor({ wallet }: { wallet: Wallet }) {
  if (wallet.card_type === "credit")
    return (
      <RowIcon tone="warning">
        <CreditCard />
      </RowIcon>
    );
  const icon =
    wallet.type === "bank" ? (
      <Landmark />
    ) : wallet.type === "digital" ? (
      <Smartphone />
    ) : wallet.type === "card" ? (
      <CreditCard />
    ) : (
      <Banknote />
    );
  return <RowIcon tone={wallet.archived ? "neutral" : "primary"}>{icon}</RowIcon>;
}

type Editor =
  | { mode: "create" }
  | { mode: "edit" | "adjust" | "archive"; id: string };

export function Wallets() {
  const query = useWallets();
  const wallets = query.data ?? [];
  const editor = useEditor<Editor>();
  const [showArchived, setShowArchived] = useState(false);
  const active = wallets.filter((wallet) => !wallet.archived);
  const archived = wallets.filter((wallet) => wallet.archived);
  return (
    <>
      <PageIntro
        description="Cash you hold and credit you owe, kept separate."
        action={
          <Button size="sm" variant="outline" onClick={(e) => editor.open({ mode: "create" }, e)}>
            <Plus data-icon="inline-start" />
            Add wallet
          </Button>
        }
      />
      <LoadError
        error={query.error}
        hasData={Boolean(query.data)}
        onRetry={() => void query.refetch()}
        what="wallets"
      />
      {query.isPending ? <ListSkeleton rows={4} /> : null}
      {query.data && !wallets.length ? (
        <EmptyState
          icon={<WalletIcon />}
          title="Start with a wallet"
          description="Add your cash, bank account, bKash, or card with its current balance."
          action={
            <Button variant="outline" onClick={(e) => editor.open({ mode: "create" }, e)}>
              Add your first wallet
            </Button>
          }
        />
      ) : null}
      {groups.map((group) => {
        const members = active.filter((wallet) => group.types.includes(wallet.type));
        if (!members.length) return null;
        return (
          <section key={group.title} aria-label={group.title} className="min-w-0">
            <Section title={group.title}>
              <List>
                {members.map((wallet) => (
                  <WalletRow key={wallet.id} wallet={wallet} wallets={wallets} />
                ))}
              </List>
            </Section>
          </section>
        );
      })}
      {archived.length ? (
        <div className="flex min-w-0 flex-col gap-3">
          <Button
            variant="ghost"
            className="self-start text-muted-foreground"
            aria-expanded={showArchived}
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? <ChevronDown data-icon="inline-start" /> : <ChevronRight data-icon="inline-start" />}
            {showArchived ? "Hide" : "Show"} archived wallets ({archived.length})
          </Button>
          {showArchived ? (
            <section aria-label="Archived wallets" className="min-w-0">
              <List>
                {archived.map((wallet) => (
                  <WalletRow key={wallet.id} wallet={wallet} wallets={wallets} />
                ))}
              </List>
            </section>
          ) : null}
        </div>
      ) : null}
      <WalletEditors editor={editor} wallets={wallets} />
    </>
  );
}

// One compact wallet row, linking to the wallet's own page.
function WalletRow({ wallet, wallets }: { wallet: Wallet; wallets: Wallet[] }) {
  const credit = wallet.card_type === "credit";
  const bank = wallet.bank_wallet_id
    ? wallets.find((other) => other.id === wallet.bank_wallet_id)
    : undefined;
  const currency = wallet.currency !== "BDT" ? ` · ${wallet.currency}` : "";
  let subtitle: ReactNode = `${typeLabel(wallet)}${currency}`;
  if (wallet.bank_wallet_id) subtitle = `Spends from ${bank?.name ?? "its bank wallet"}`;
  else if (isLegacyDebit(wallet)) subtitle = "Debit card · not linked to a bank";
  else if (credit)
    subtitle = (
      <>
        <Money amount={wallet.available_credit ?? "0.00"} currency={wallet.currency} /> available
        of <Money amount={wallet.credit_limit} currency={wallet.currency} />
      </>
    );
  return (
    <ListRow
      to={walletPath(wallet.id)}
      data-testid="wallet-row"
      className={wallet.archived ? "opacity-75" : undefined}
      leading={<WalletIconFor wallet={wallet} />}
      title={
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 break-words">{wallet.name}</span>
          {wallet.archived ? <Badge variant="outline">Archived</Badge> : null}
        </span>
      }
      subtitle={subtitle}
      trailing={
        wallet.bank_wallet_id ? (
          <ChevronRight aria-hidden className="size-5 text-muted-foreground" />
        ) : (
          <span className="flex flex-col items-end">
            <Money
              data-testid="wallet-balance"
              className="font-semibold"
              amount={wallet.debt ?? wallet.balance}
              currency={wallet.currency}
              debt={credit}
            />
            {credit ? (
              <span className="text-caption font-normal text-muted-foreground">owed</span>
            ) : null}
          </span>
        )
      }
      below={
        credit && !wallet.archived ? (
          <Meter
            label={`${wallet.name} credit used`}
            tone="warning"
            percent={fillPercent(wallet.debt ?? "0", wallet.credit_limit)}
          />
        ) : undefined
      }
    />
  );
}

// One wallet's page (/wallets/:id), read with GET /wallets/{id}, with its actions.
export function WalletDetail({ id }: { id: string }) {
  const query = useWallet(id);
  const list = useWallets();
  const editor = useEditor<Editor>();
  const wallet = query.data;
  useHeaderTitle(wallet?.name);
  if (!wallet) {
    if (query.error && isApiError(query.error) && query.error.code === "not_found")
      return (
        <EmptyState
          icon={<WalletIcon />}
          title="Wallet not found"
          description="This wallet does not exist. It may have been opened from an old link."
          action={
            <Button asChild variant="outline">
              <Link to="/wallets">Back to Wallets</Link>
            </Button>
          }
        />
      );
    return (
      <>
        <LoadError
          error={query.error}
          hasData={false}
          onRetry={() => void query.refetch()}
          what="this wallet"
        />
        {query.isPending ? (
          <div aria-hidden className="flex flex-col gap-4">
            <Skeleton className="h-44 w-full rounded-xl" />
            <Skeleton className="h-11 w-2/3" />
          </div>
        ) : null}
      </>
    );
  }
  const wallets = list.data ?? [];
  const credit = wallet.card_type === "credit";
  const linked = Boolean(wallet.bank_wallet_id);
  const bank = linked ? wallets.find((other) => other.id === wallet.bank_wallet_id) : undefined;
  return (
    <>
      <LoadError
        error={query.error}
        hasData
        onRetry={() => void query.refetch()}
        what="this wallet"
      />
      <Card className="gap-0 py-0" data-testid="wallet-detail">
        <CardContent className="flex flex-col gap-4 px-5 py-5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <WalletIconFor wallet={wallet} />
            <span className="text-label">{typeLabel(wallet)}</span>
            <Badge variant="outline">{wallet.currency}</Badge>
            {wallet.archived ? <Badge variant="secondary">Archived</Badge> : null}
          </div>
          {linked ? (
            <div className="flex flex-col gap-1">
              <p className="text-heading">
                Spends from{" "}
                {bank ? (
                  <Link className="text-primary underline-offset-2 hover:underline" to={walletPath(bank.id)}>
                    {bank.name}
                  </Link>
                ) : (
                  "its bank wallet"
                )}
              </p>
              <p className="text-label font-normal text-muted-foreground">
                This card has no balance of its own. Spending with it comes out of the bank
                account.
              </p>
            </div>
          ) : (
            <div className="@container flex min-w-0 flex-col gap-1">
              <p className="text-label text-muted-foreground">{credit ? "Debt owed" : "Balance"}</p>
              <p
                data-testid="wallet-balance"
                className="text-[min(2rem,9cqi)] leading-tight font-semibold tracking-tight"
              >
                <Money amount={wallet.debt ?? wallet.balance} currency={wallet.currency} debt={credit} />
              </p>
            </div>
          )}
          {credit ? (
            <div className="flex flex-col gap-2">
              <Meter
                label="Credit used"
                tone="warning"
                percent={fillPercent(wallet.debt ?? "0", wallet.credit_limit)}
              />
              <p className="text-label font-normal text-muted-foreground">
                <Money amount={wallet.available_credit ?? "0.00"} currency={wallet.currency} />{" "}
                available of <Money amount={wallet.credit_limit} currency={wallet.currency} /> limit
              </p>
            </div>
          ) : null}
          {isLegacyDebit(wallet) ? (
            <Alert variant="warning" role="note">
              <CircleAlert aria-hidden />
              <AlertDescription>
                This card was added before cards were linked to a bank account, so it keeps
                its own balance. Move that money out, add a new card linked to its bank, and
                archive this one.
              </AlertDescription>
            </Alert>
          ) : null}
          {wallet.details ? (
            <p className="break-words whitespace-pre-wrap text-sm text-muted-foreground">
              {wallet.details}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => editor.open({ mode: "edit", id: wallet.id }, e)}
            >
              <Pencil data-icon="inline-start" />
              Edit wallet
            </Button>
            {!wallet.archived && !linked ? (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => editor.open({ mode: "adjust", id: wallet.id }, e)}
              >
                <SlidersHorizontal data-icon="inline-start" />
                Adjust {credit ? "debt" : "balance"}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={(e) => editor.open({ mode: "archive", id: wallet.id }, e)}
            >
              {wallet.archived ? (
                <ArchiveRestore data-icon="inline-start" />
              ) : (
                <Archive data-icon="inline-start" />
              )}
              {wallet.archived ? "Restore wallet" : "Archive wallet"}
            </Button>
          </div>
        </CardContent>
      </Card>
      <Section title="Recent activity">
        <EmptyState
          icon={<ListIcon />}
          title="Records for this wallet are coming soon"
          description="Until then, every record, including this wallet's, is in Activity."
          action={
            <Button asChild variant="outline">
              <Link to="/activity">Open Activity</Link>
            </Button>
          }
        />
      </Section>
      <WalletEditors editor={editor} wallets={wallets} detail={wallet} />
    </>
  );
}

// The create, edit, adjust, and archive sheets, shared by the list and the detail page.
function WalletEditors({
  editor,
  wallets,
  detail,
}: {
  editor: ReturnType<typeof useEditor<Editor>>;
  wallets: Wallet[];
  // On the detail page, the freshly read wallet is the one being edited.
  detail?: Wallet;
}) {
  // Read the wallet being edited from the cache so it is never a stale snapshot.
  const current =
    editor.value && editor.value.mode !== "create"
      ? detail?.id === (editor.value as { id: string }).id
        ? detail
        : wallets.find((w) => w.id === (editor.value as { id: string }).id)
      : undefined;
  return (
    <Modal
      open={editor.isOpen}
      onClose={editor.close}
      returnFocus={editor.trigger}
      {...modalText(editor.value, current)}
    >
      {editor.value?.mode === "create" ? <CreateWallet onSaved={editor.close} /> : null}
      {editor.value?.mode === "edit" && current ? (
        <EditWallet key={current.id} wallet={current} onSaved={editor.close} />
      ) : null}
      {editor.value?.mode === "adjust" && current ? (
        <AdjustWallet key={current.id} wallet={current} onSaved={editor.close} />
      ) : null}
      {editor.value?.mode === "archive" && current ? (
        <ArchiveWallet key={current.id} wallet={current} onSaved={editor.close} />
      ) : null}
    </Modal>
  );
}

function modalText(editor: Editor | undefined, wallet: Wallet | undefined) {
  if (editor?.mode === "edit")
    return {
      title: "Edit wallet",
      description:
        "Use adjustments to change the balance. Currency and wallet type stay fixed.",
    };
  if (editor?.mode === "adjust")
    return {
      title: wallet?.card_type === "credit" ? "Adjust debt" : "Adjust balance",
      description:
        "The difference is recorded with your reason. History stays intact.",
    };
  if (editor?.mode === "archive")
    return wallet?.archived
      ? {
          title: "Restore wallet",
          description: "The wallet becomes available again for new records and bills.",
        }
      : {
          title: "Archive wallet",
          description:
            "It keeps its balance and history, but new records, bills, and adjustments cannot use it.",
        };
  return {
    title: "Add wallet",
    description: "Start with what you have today. No bank connection needed.",
  };
}

// Archives or restores with the wallet's metadata version, like an edit of its status.
function ArchiveWallet(props: { wallet: Wallet; onSaved: () => void }) {
  const writes = useWrites();
  // Snapshot at open so the stale-edit check compares against what the user saw.
  const [wallet] = useState(props.wallet);
  const archive = !wallet.archived;
  return (
    <SaveForm
      onSaved={props.onSaved}
      saved={archive ? "Wallet archived" : "Wallet restored"}
      label={archive ? "Archive wallet" : "Restore wallet"}
      body={() => ({
        id: wallet.id,
        name: wallet.name,
        type: wallet.type,
        card_type: wallet.card_type,
        currency: wallet.currency,
        details: wallet.details,
        credit_limit: wallet.card_type === "credit" ? wallet.credit_limit : "0.00",
        ...(wallet.bank_wallet_id ? { bank_wallet_id: wallet.bank_wallet_id } : {}),
        archived: archive,
        version: wallet.version,
      })}
      send={(body, key) => writes.updateWallet(body, { key })}
    >
      <p className="text-sm text-muted-foreground">
        {archive
          ? `${wallet.name} moves to the archived list at the bottom of Wallets. You can restore it at any time.`
          : `${wallet.name} moves back to its group in Wallets.`}
      </p>
    </SaveForm>
  );
}

function AdjustWallet(props: { wallet: Wallet; onSaved: () => void }) {
  const writes = useWrites();
  // Snapshot at open: a background refetch must not swap in a newer version, or a
  // concurrent change would be overwritten instead of reported as a conflict.
  const [wallet] = useState(props.wallet);
  const { onSaved } = props;
  return (
    <SaveForm
      onSaved={onSaved}
      saved="Adjustment recorded"
      label="Record adjustment"
      body={(form) => ({
        balance_version: wallet.balance_version,
        balance: form.decimal("balance"),
        reason: form.text("reason"),
      })}
      send={(body, key) => writes.adjustWallet(wallet.id, body, { key })}
    >
      <MoneyField
        label={wallet.card_type === "credit" ? "Actual debt owed" : "Actual balance"}
        name="balance"
        currency={wallet.currency}
        allowNegative
        defaultValue={wallet.debt ?? wallet.balance}
      />
      <Notes label="Reason" name="reason" required />
    </SaveForm>
  );
}

function CreateWallet({ onSaved }: { onSaved: () => void }) {
  const writes = useWrites();
  const banks = (useWallets().data ?? []).filter(
    (wallet) => wallet.type === "bank" && !wallet.archived,
  );
  const [type, setType] = useState<WalletType>("physical");
  const [cardType, setCardType] = useState<"debit" | "credit">("debit");
  const credit = type === "card" && cardType === "credit";
  // A debit card draws from a bank wallet and takes its currency; it has no opening balance.
  const debit = type === "card" && cardType === "debit";
  return (
    <SaveForm
      onSaved={onSaved}
      saved="Wallet created"
      label="Create wallet"
      body={(form) => ({
        name: form.text("name"),
        type,
        card_type: (type === "card" ? cardType : "") as CardType,
        currency: debit
          ? (banks.find((bank) => bank.id === form.text("bank_wallet_id"))?.currency ??
            "BDT")
          : (form.text("currency") as Currency),
        opening_balance: debit ? "" : form.decimal("opening_balance"),
        credit_limit: credit ? form.decimal("credit_limit") : "",
        details: form.text("details"),
        ...(debit ? { bank_wallet_id: form.text("bank_wallet_id") } : {}),
      })}
      send={(body, key) => writes.createWallet(body, { key })}
    >
      <TextField
        label="Wallet name"
        name="name"
        required
        maxLength={120}
        placeholder="Cash, bKash, or your bank"
      />
      <Choice
        label="Wallet type"
        name="type"
        value={type}
        onChange={(value) => setType(value as WalletType)}
        options={types}
      />
      {type === "card" ? (
        <Choice
          label="Card type"
          name="card_type"
          value={cardType}
          onChange={(value) => setCardType(value as "debit" | "credit")}
          options={[
            { value: "debit", label: "Debit / prepaid" },
            { value: "credit", label: "Credit" },
          ]}
        />
      ) : null}
      {debit ? (
        banks.length ? (
          <Choice
            label="Bank account"
            name="bank_wallet_id"
            options={banks.map((bank) => ({
              value: bank.id,
              label: `${bank.name} · ${bank.currency}`,
            }))}
          />
        ) : (
          <WarningMessage>Add the bank account this card spends from first.</WarningMessage>
        )
      ) : (
        <>
          <Choice
            label="Currency"
            name="currency"
            defaultValue="BDT"
            options={[
              { value: "BDT", label: "BDT · Bangladeshi taka" },
              { value: "USD", label: "USD · US dollar" },
            ]}
          />
          <MoneyField
            label={credit ? "Opening debt" : "Opening balance"}
            name="opening_balance"
            allowNegative
            defaultValue="0"
          />
        </>
      )}
      {credit ? (
        <MoneyField label="Credit limit" name="credit_limit" defaultValue="0" />
      ) : null}
      {debit ? (
        <FieldDescription>
          The card has no balance of its own. Spending with it comes out of the
          bank account.
        </FieldDescription>
      ) : null}
      <Notes name="details" label="Account details (optional)" />
    </SaveForm>
  );
}

function EditWallet(props: { wallet: Wallet; onSaved: () => void }) {
  const writes = useWrites();
  // Snapshot at open so the stale-edit check compares against what the user saw.
  const [wallet] = useState(props.wallet);
  const { onSaved } = props;
  return (
    <SaveForm
      onSaved={onSaved}
      saved="Wallet saved"
      label="Save wallet"
      // An explicit input shape: response-only fields such as balance and debt are never
      // echoed back, so a new computed field on the server cannot break wallet edits.
      body={(form) => ({
        id: wallet.id,
        name: form.text("name"),
        type: wallet.type,
        card_type: wallet.card_type,
        currency: wallet.currency,
        details: form.text("details"),
        credit_limit:
          wallet.card_type === "credit" ? form.decimal("credit_limit") : "0.00",
        ...(wallet.bank_wallet_id ? { bank_wallet_id: wallet.bank_wallet_id } : {}),
        archived: form.text("status") === "archived",
        version: wallet.version,
      })}
      send={(body, key) => writes.updateWallet(body, { key })}
    >
      <TextField
        label="Wallet name"
        name="name"
        defaultValue={wallet.name}
        required
        maxLength={120}
      />
      {wallet.card_type === "credit" ? (
        <MoneyField
          label="Credit limit"
          name="credit_limit"
          currency={wallet.currency}
          defaultValue={wallet.credit_limit}
        />
      ) : null}
      <Notes
        name="details"
        label="Account details (optional)"
        defaultValue={wallet.details}
      />
      <Choice
        label="Status"
        name="status"
        defaultValue={wallet.archived ? "archived" : "active"}
        options={[
          { value: "active", label: "Active" },
          { value: "archived", label: "Archived" },
        ]}
      />
    </SaveForm>
  );
}
