import { createContext, useContext, type ReactNode, type SyntheticEvent } from "react";
import { Link } from "react-router-dom";
import { Wallet as WalletIcon } from "lucide-react";
import { useCategories, useSettings, useWallets } from "@/cache/queries";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadError, Modal, useEditor } from "@/components/layout";
import { TransactionForm } from "@/components/transaction-form";
import { Skeleton } from "@/components/ui/skeleton";

type AddRecord = { open(event?: SyntheticEvent<HTMLElement>): void };

const AddRecordContext = createContext<AddRecord | null>(null);

// One Add record sheet for the whole app, opened from the tab bar or the sidebar on any
// page. Its data loads only once it has been opened.
export function AddRecordProvider({ children }: { children: ReactNode }) {
  const editor = useEditor<true>();
  return (
    <AddRecordContext.Provider value={{ open: (event) => editor.open(true, event) }}>
      {children}
      <Modal
        open={editor.isOpen}
        onClose={editor.close}
        returnFocus={editor.trigger}
        title="Add record"
        description="Record what actually moved. Transfers are not income or spending."
      >
        {editor.value ? <AddRecordContent onDone={editor.close} /> : null}
      </Modal>
    </AddRecordContext.Provider>
  );
}

export function useAddRecord() {
  const value = useContext(AddRecordContext);
  if (!value) throw new Error("useAddRecord needs an AddRecordProvider");
  return value;
}

function AddRecordContent({ onDone }: { onDone: () => void }) {
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
    <TransactionForm
      wallets={wallets.data}
      categories={categories.data}
      settings={settings.data}
      onSaved={onDone}
    />
  );
}
