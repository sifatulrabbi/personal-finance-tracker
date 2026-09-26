import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Link } from "react-router-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import { pages, type Page } from "@/routes";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function Navigation({ current }: { current: Page | undefined }) {
  const [open, setOpen] = useState(false);
  // Choosing a page closes the drawer without its fade-out. Otherwise the new page shows
  // under a dimmed overlay for about 200ms and looks like a flicker. Escape, the close
  // button, and tapping outside keep the normal animation.
  const [instant, setInstant] = useState(false);
  const skipAnimation = instant ? { animation: "none" } : undefined;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setInstant(false);
        setOpen(next);
      }}
    >
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
        <DialogOverlay style={skipAnimation} />
        <DialogPrimitive.Content
          style={skipAnimation}
          className="navigation-drawer fixed inset-y-0 z-50 flex w-80 min-w-0 flex-col gap-6 overflow-x-clip overflow-y-auto border-r bg-background px-4 shadow-lg outline-none"
        >
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
              <Link
                key={page.path}
                to={page.path}
                className={buttonVariants({
                  variant: current === page ? "secondary" : "ghost",
                  className: "h-12 w-full justify-start",
                })}
                aria-current={current === page ? "page" : undefined}
                onClick={() => {
                  setInstant(true);
                  setOpen(false);
                }}
              >
                {page.name}
              </Link>
            ))}
          </nav>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
