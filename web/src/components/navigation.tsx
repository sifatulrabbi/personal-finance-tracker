import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { NavLink } from "react-router-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import { pages } from "@/routes";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function Navigation() {
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
        <DialogPrimitive.Content className="navigation-drawer fixed inset-y-0 z-50 flex w-80 min-w-0 flex-col gap-6 overflow-x-clip overflow-y-auto border-r bg-background px-4 shadow-lg outline-none">
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
              <NavLink
                key={page.path}
                to={page.path}
                end
                className={({ isActive }) =>
                  buttonVariants({
                    variant: isActive ? "secondary" : "ghost",
                    className: "h-12 w-full justify-start",
                  })
                }
                onClick={() => setOpen(false)}
              >
                {page.name}
              </NavLink>
            ))}
          </nav>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
