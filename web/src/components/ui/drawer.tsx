import * as React from "react";
import { cn } from "cn";
import { Drawer as DrawerPrimitive } from "vaul";

// shadcn/ui Drawer (vaul). Dragging is limited to the handle (handleOnly on Root), so a
// scrolling form never closes by accident and taps on fields are never captured.
function Drawer(props: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />;
}

function DrawerPortal(props: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerClose(props: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn("fixed inset-0 z-50 bg-overlay", className)}
      {...props}
    />
  );
}

function DrawerContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content>) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        className={cn(
          "group/drawer-content fixed z-50 flex min-w-0 flex-col bg-card text-card-foreground outline-none",
          // A bottom sheet inside the safe area, never taller than the visible viewport.
          "bottom-0 left-[var(--safe-area-left)] right-[var(--safe-area-right)] mx-auto max-h-[calc(100dvh-max(0.5rem,var(--safe-area-top)))] w-auto max-w-lg rounded-t-2xl border border-b-0 pb-[var(--safe-area-bottom)] shadow-lg",
          className,
        )}
        {...props}
      >
        <DrawerPrimitive.Handle
          aria-hidden
          className="mx-auto mt-2 mb-0 !h-1.5 !w-10 shrink-0 !rounded-full !bg-border !opacity-100"
        />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("text-heading min-w-0 break-words", className)}
      {...props}
    />
  );
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("min-w-0 break-words text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
};
