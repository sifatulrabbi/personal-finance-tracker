import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const pages = [
  "Activity",
  "Wallets",
  "Bills",
  "Monthly spending",
  "Settings",
] as const;
export type Page = (typeof pages)[number];

export function Navigation({
  current,
  onSelect,
}: {
  current: Page;
  onSelect: (page: Page) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label="Open menu"
        >
          <Menu />
        </Button>
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex h-dvh w-80 max-w-[calc(100%-3rem)] flex-col gap-6 overflow-y-auto border-r bg-background p-4 shadow-lg outline-none">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle>Navigation</DialogTitle>
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label="Close menu"
              >
                <X />
              </Button>
            </DialogClose>
          </div>
          <DialogDescription className="sr-only">
            Choose a Simply Finance page.
          </DialogDescription>
          <nav aria-label="Main navigation" className="flex flex-col gap-2">
            {pages.map((page) => (
              <Button
                key={page}
                variant={current === page ? "secondary" : "ghost"}
                className="h-12 w-full justify-start"
                aria-current={current === page ? "page" : undefined}
                onClick={() => {
                  onSelect(page);
                  setOpen(false);
                }}
              >
                {page}
              </Button>
            ))}
          </nav>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
