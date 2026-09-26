import * as React from "react";
import { cn } from "cn";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";

// A segmented control (shadcn/ui ToggleGroup look): one pill track, the chosen item raised.
function ToggleGroup({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn(
        "inline-flex w-full min-w-0 items-center gap-1 rounded-lg bg-muted p-1",
        className,
      )}
      {...props}
    />
  );
}

function ToggleGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        "inline-flex h-11 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted-foreground outline-none transition-[color,background-color,box-shadow] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/60 data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
