import {
  useCallback,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/forms";
import { errorMessage } from "@/api/errors";

// Which editor a screen has open. The last value is kept while the dialog closes, so the
// close animation plays with its content and the Dialog stays mounted; Radix can then
// return focus. The element that opened the editor is remembered explicitly because
// WebKit does not focus buttons on click.
export function useEditor<T>() {
  const [state, setState] = useState<{ value: T; open: boolean } | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const open = useCallback((value: T, event?: SyntheticEvent<HTMLElement>) => {
    trigger.current =
      event?.currentTarget ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setState({ value, open: true });
  }, []);
  const close = useCallback(
    () => setState((current) => (current ? { ...current, open: false } : current)),
    [],
  );
  return {
    value: state?.value,
    isOpen: state?.open ?? false,
    open,
    close,
    trigger,
  };
}

export function Modal({
  open,
  onClose,
  title,
  description,
  returnFocus,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  // The element that opened the dialog. When it no longer exists (for example a paid
  // bill's card), focus goes to the page heading instead of the document body.
  returnFocus?: { current: HTMLElement | null };
  children: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        ref={content}
        className="max-w-md"
        // Radix would focus and select the first field, which pops the phone keyboard over
        // the sheet and lets one keystroke replace an existing name. Focus the dialog itself.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          content.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = returnFocus?.current;
          if (target?.isConnected) target.focus();
          else document.querySelector<HTMLElement>("[data-page-heading]")?.focus();
        }}
      >
        <DialogHeader className="shrink-0 border-b py-4 pr-14 pl-4 sm:py-5 sm:pr-16 sm:pl-6">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div
          data-slot="dialog-body"
          className="min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto overscroll-contain px-4 py-5 [scroll-padding-bottom:5rem] sm:px-6"
        >
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// A heading that receives focus when the element that opened a dialog is gone.
export function PageHeading({ children }: { children: ReactNode }) {
  return (
    <h2
      data-page-heading=""
      tabIndex={-1}
      className="text-xl font-semibold outline-none"
    >
      {children}
    </h2>
  );
}

export function NoRecords({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

// A failed load with a way to retry. When older data is still on screen, the message says
// so instead of replacing it.
export function LoadError({
  error,
  hasData,
  onRetry,
  what,
}: {
  error: unknown;
  hasData: boolean;
  onRetry: () => void;
  what: string;
}) {
  if (!error) return null;
  const message = hasData
    ? `Could not refresh ${what}. Showing what was loaded before. ${errorMessage(error, "")}`.trim()
    : `Could not load ${what}. ${errorMessage(error, "")}`.trim();
  return (
    <div className="flex flex-col gap-2">
      <ErrorMessage error={message} />
      <Button variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
