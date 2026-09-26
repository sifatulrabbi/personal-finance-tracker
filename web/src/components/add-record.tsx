import { createContext, useContext, useMemo, type ReactNode, type SyntheticEvent } from "react";
import { Link } from "react-router-dom";
import { Wallet as WalletIcon } from "lucide-react";
import { useCategories, useSettings, useWallets } from "@/cache/queries";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadError, Modal, useEditor } from "@/components/layout";
import { RecordForm } from "@/components/record-form";
import type { RecordKind } from "@/activity/draft";
import { Skeleton } from "@/components/ui/skeleton";

type AddRecord = {
  open(event?: SyntheticEvent<HTMLElement>, options?: { kind?: RecordKind }): void;
};

const AddRecordContext = createContext<AddRecord | null>(null);

// One Add record sheet for the whole app, opened from the tab bar or the sidebar on any
// page. Its data loads only once it has been opened.
export function AddRecordProvider({ children }: { children: ReactNode }) {
  const editor = useEditor<{ kind?: RecordKind }>();
  const value = useMemo<AddRecord>(
    () => ({ open: (event, options) => editor.open({ kind: options?.kind }, event) }),
    [editor.open],
  );
  return (
    <AddRecordContext.Provider value={value}>
      {children}
      <Modal
        open={editor.isOpen}
        onClose={editor.close}
        returnFocus={editor.trigger}
        title="Add record"
        description="Moving money between wallets is a transfer, not spending."
      >
        {editor.value ? <AddRecordContent kind={editor.value.kind} onDone={editor.close} /> : null}
      </Modal>
    </AddRecordContext.Provider>
  );
}

export function useAddRecord() {
  const value = useContext(AddRecordContext);
  if (!value) throw new Error("useAddRecord needs an AddRecordProvider");
  return value;
}

function AddRecordContent({ kind, onDone }: { kind?: RecordKind; onDone: () => void }) {
  const wallets = useWallets();
  const categories = useCategories();
  const settings = useSettings();
  const failed = [wallets, categories, settings].find((query) => query.error && !query.data);
  if (failed)
    return (
      <LoadError
        error={failed.error}
        hasData={false}
        onRetry={() => void failed.refetch()}
        what="what this form needs"
      />
    );
  if (!wallets.data || !categories.data || !settings.data)
    return (
      <div aria-hidden className="flex flex-col gap-5 pb-5">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-11 w-full" />
          </div>
        ))}
      </div>
    );
  // A record needs a wallet. Explain that, with the way to add one, instead of a
  // disabled button with no reason.
  if (!wallets.data.some((wallet) => !wallet.archived))
    return (
      <EmptyState
        icon={<WalletIcon />}
        title="Add a wallet first"
        description="Every record belongs to a wallet: cash, a bank account, bKash, or a card."
        action={
          <Button asChild onClick={onDone}>
            <Link to="/wallets">Go to Wallets</Link>
          </Button>
        }
      />
    );
  return (
    <RecordForm
      wallets={wallets.data}
      categories={categories.data}
      settings={settings.data}
      initialKind={kind}
      onSaved={onDone}
    />
  );
}
