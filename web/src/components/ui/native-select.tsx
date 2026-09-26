import * as React from "react";
import { cn } from "cn";
import { ChevronDownIcon } from "lucide-react";

function NativeSelect({
  className,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"select">, "size"> & { size?: "sm" | "default" }) {
  return (
    <div
      className="group/native-select relative w-full min-w-0 max-w-full has-[select:disabled]:opacity-50"
      data-slot="native-select-wrapper"
    >
      <select
        data-slot="native-select"
        data-size={size}
        className={cn(
          "h-11 w-full min-w-0 max-w-full rounded-md border border-input bg-card px-3 text-base text-foreground shadow-xs transition-[color,box-shadow,border-color] outline-none appearance-none pr-9 disabled:pointer-events-none disabled:cursor-not-allowed data-[size=sm]:h-10",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
          "aria-invalid:border-destructive aria-invalid:ring-destructive/25",
          className,
        )}
        {...props}
      />
      <ChevronDownIcon
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground select-none"
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  );
}

function NativeSelectOption({
  className,
  ...props
}: React.ComponentProps<"option">) {
  return (
    <option
      data-slot="native-select-option"
      className={cn("bg-card text-foreground", className)}
      {...props}
    />
  );
}

function NativeSelectOptGroup({
  className,
  ...props
}: React.ComponentProps<"optgroup">) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn("bg-card text-foreground", className)}
      {...props}
    />
  );
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption };
