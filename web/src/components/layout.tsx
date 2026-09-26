import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { Link } from "react-router-dom";
import { cn } from "cn";
import { CircleAlert, RotateCw, X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/api/errors";
import { desktopDialogQuery, useMediaQuery } from "@/lib/use-media-query";

// Which editor a screen has open. The last value is kept while the sheet closes, so the
// close animation plays with its content and the sheet stays mounted; Radix can then
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

// True inside a sheet. SaveForm then pins its Save button to the bottom of the sheet.
const SheetContext = createContext(false);
export function useInSheet() {
  return useContext(SheetContext);
}

// A sheet for forms and details: a vaul Drawer on phones, a centered Dialog from 768px.
// The kind is chosen when the sheet opens and kept until it closes, so rotating a phone or
// the keyboard resizing the viewport never remounts the form and loses what was typed.
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
  // The element that opened the sheet. When it no longer exists (for example a paid
  // bill's card), focus goes to the page heading instead of the document body.
  returnFocus?: { current: HTMLElement | null };
  children: ReactNode;
}) {
  const desktop = useMediaQuery(desktopDialogQuery);
  const [kind, setKind] = useState<"dialog" | "drawer">(desktop ? "dialog" : "drawer");
  useEffect(() => {
    if (!open) setKind(desktop ? "dialog" : "drawer");
  }, [open, desktop]);
  const content = useRef<HTMLDivElement>(null);
  const focus = {
    // Radix would focus and select the first field, which pops the phone keyboard over
    // the sheet and lets one keystroke replace an existing name. Focus the sheet itself.
    onOpenAutoFocus: (event: Event) => {
      event.preventDefault();
      content.current?.focus();
    },
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault();
      const target = returnFocus?.current;
      if (target?.isConnected) target.focus();
      else document.querySelector<HTMLElement>("[data-page-heading]")?.focus();
    },
  };
  const onOpenChange = (next: boolean) => {
    if (!next) onClose();
  };
  const body = (
    <div
      data-slot="dialog-body"
      className="min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto overscroll-contain px-4 pt-4 [scroll-padding-bottom:6rem] sm:px-5 [&>*:last-child:not([data-sheet-form])]:mb-5"
    >
      <SheetContext.Provider value={true}>{children}</SheetContext.Provider>
    </div>
  );
  const closeButton = (
    <Button
      variant="ghost"
      size="icon"
      className="-mt-1 -mr-2 rounded-full text-muted-foreground"
      aria-label="Close"
    >
      <X />
    </Button>
  );
  if (kind === "drawer")
    return (
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        // Only the handle drags, fields never reposition the sheet from a script (the
        // viewport meta and dvh do that), and body styles are left to Radix.
        handleOnly
        repositionInputs={false}
        noBodyStyles
      >
        <DrawerContent ref={content} tabIndex={-1} {...focus}>
          <div className="flex min-w-0 shrink-0 items-start gap-3 border-b px-4 pt-2 pb-3 sm:px-5">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <DrawerTitle data-slot="dialog-title">{title}</DrawerTitle>
              <DrawerDescription>{description}</DrawerDescription>
            </div>
            <DrawerClose asChild>{closeButton}</DrawerClose>
          </div>
          {body}
        </DrawerContent>
      </Drawer>
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={content} showCloseButton={false} {...focus}>
        <div className="flex min-w-0 shrink-0 items-start gap-3 border-b px-5 pt-5 pb-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </div>
          <DialogClose asChild>{closeButton}</DialogClose>
        </div>
        {body}
      </DialogContent>
    </Dialog>
  );
}

// A short description of the page with its main action on the right.
export function PageIntro({
  description,
  action,
}: {
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <p className="min-w-0 flex-1 basis-48 text-label font-normal text-muted-foreground">
        {description}
      </p>
      {action}
    </div>
  );
}

// A titled group of content on a page.
export function Section({
  title,
  action,
  children,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      <div className="flex min-h-8 min-w-0 items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2 text-heading">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

// A bordered list of compact rows.
export function List({
  children,
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col divide-y overflow-hidden rounded-xl border bg-card",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// One compact row: an optional leading icon, a title with a subtitle, and a trailing value
// (usually an amount). As a button when it opens something.
export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  meta,
  below,
  onClick,
  to,
  className,
  ...props
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  // Small extra content under the trailing value, such as a badge.
  meta?: ReactNode;
  // Full-width content under the title and trailing value, such as a usage bar.
  below?: ReactNode;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  // As a link to another page, when the row opens one.
  to?: string;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, "title" | "onClick">) {
  const main = (
    <>
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="min-w-0 break-words font-medium">{title}</div>
        {subtitle ? (
          <div className="min-w-0 break-words text-label font-normal text-muted-foreground">
            {subtitle}
          </div>
        ) : null}
      </div>
      {trailing || meta ? (
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          {trailing}
          {meta}
        </div>
      ) : null}
    </>
  );
  const inner = below ? (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-3">{main}</div>
      <div className={cn("min-w-0", leading && "pl-13")}>{below}</div>
    </div>
  ) : (
    main
  );
  const classes = cn(
    "flex min-h-16 w-full min-w-0 items-center gap-3 px-4 py-3 text-left",
    className,
  );
  const interactive =
    "cursor-pointer transition-colors hover:bg-accent focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";
  if (to)
    return (
      <Link to={to} className={cn(classes, interactive)} {...props}>
        {inner}
      </Link>
    );
  if (onClick)
    return (
      <button
        type="button"
        className={cn(classes, interactive)}
        onClick={onClick}
        {...props}
      >
        {inner}
      </button>
    );
  return (
    <div className={classes} {...props}>
      {inner}
    </div>
  );
}

// A round tinted icon for list rows.
export function RowIcon({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "income" | "transfer" | "warning" | "danger" | "primary";
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex size-10 items-center justify-center rounded-full [&_svg]:size-[1.125rem]",
        tone === "neutral" && "bg-muted text-muted-foreground",
        tone === "income" && "bg-income/12 text-income",
        tone === "transfer" && "bg-transfer/12 text-transfer",
        tone === "warning" && "bg-warning/12 text-warning",
        tone === "danger" && "bg-destructive/12 text-destructive",
        tone === "primary" && "bg-primary/12 text-primary",
      )}
    >
      {children}
    </div>
  );
}

// A thin horizontal bar for "how much of this is used": spending against a target, a
// card's debt against its limit, or a category's share. The percent comes from the
// server or from an exact decimal comparison (money/compare.ts), never float money math.
export function Meter({
  percent,
  label,
  tone = "primary",
  className,
}: {
  // 0 to 100.
  percent: number;
  label: string;
  tone?: "primary" | "warning" | "danger" | "neutral";
  className?: string;
}) {
  const value = Math.min(100, Math.max(0, percent));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      className={cn("h-2 w-full min-w-0 overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none",
          tone === "primary" && "bg-primary",
          tone === "warning" && "bg-warning",
          tone === "danger" && "bg-destructive",
          tone === "neutral" && "bg-muted-foreground/60",
        )}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

// Placeholder rows shaped like the list they stand in for. Only for a first load: once
// content exists it stays on screen while it refreshes.
export function ListSkeleton({ rows = 4, ...props }: { rows?: number } & React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className="flex min-w-0 flex-col divide-y overflow-hidden rounded-xl border bg-card"
      {...props}
    >
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex min-h-16 items-center gap-3 px-4 py-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      data-slot="empty"
      className="flex min-w-0 flex-col items-center gap-3 rounded-xl border border-dashed bg-card/60 px-6 py-8 text-center"
    >
      {icon ? (
        <div
          aria-hidden
          className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5"
        >
          {icon}
        </div>
      ) : null}
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-heading">{title}</p>
        <p className="text-label font-normal text-balance text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

// A failed load with a way to retry. It sits next to content that is already on screen
// and never replaces it; the message says whether older data is still shown.
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
    <div
      role="alert"
      className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive-muted px-4 py-3 text-sm text-destructive"
    >
      <CircleAlert aria-hidden className="size-4 shrink-0" />
      <p className="min-w-0 flex-1 basis-40">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCw data-icon="inline-start" />
        Retry
      </Button>
    </div>
  );
}
