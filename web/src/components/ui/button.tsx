import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Slot } from "radix-ui";

const buttonVariants = cva(
  // Sizes keep every control at least 44px tall on touch screens; with a mouse they tighten a little.
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-[0.9375rem] font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/40",
        // A destructive action that is not the main one on screen (void, skip).
        "destructive-outline":
          "border border-destructive/50 bg-card text-destructive hover:bg-destructive-muted focus-visible:ring-destructive/40",
        outline:
          "border border-border bg-card text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "text-foreground hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 has-[>svg]:px-3.5 pointer-fine:h-10",
        sm: "h-11 gap-1.5 px-3 text-sm has-[>svg]:px-2.5 pointer-fine:h-9",
        lg: "h-12 px-6 text-base has-[>svg]:px-5",
        icon: "size-11 pointer-fine:size-10 [&_svg:not([class*='size-'])]:size-5",
        "icon-lg": "size-12 [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
