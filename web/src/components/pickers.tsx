import { useId, type ReactNode } from "react";
import { cn } from "cn";

// Tap-to-pick controls for the record sheet. Each is a group of native radio buttons, so
// arrow keys move between options, screen readers announce "radio, 2 of 5", and tests can
// pick by role. The inputs are visually hidden; the label is the chip.

export type PickOption = {
  value: string;
  label: ReactNode;
  // Small muted text after the label, part of the accessible name (for example "USD").
  detail?: string;
  disabled?: boolean;
};

type GroupProps = {
  legend: string;
  // The form field this group edits; server errors and focus use it.
  field: string;
  value: string;
  onChange: (value: string) => void;
  options: PickOption[];
  error?: string;
  hint?: ReactNode;
  // Extra content after the chips, such as a "New category" chip.
  trailing?: ReactNode;
  hideLegend?: boolean;
  className?: string;
};

// Shared by chips and segments: an error below, tied to every radio.
function useGroupIds() {
  const id = useId();
  return { name: `pick-${id}`, errorID: `${id}-error`, hintID: `${id}-hint` };
}

function GroupFooter({ error, hint, errorID, hintID }: { error?: string; hint?: ReactNode; errorID: string; hintID: string }) {
  return (
    <>
      {hint ? (
        <p id={hintID} className="mt-2 text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorID} className="mt-2 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
}

// Inputs keep a 16px font so iOS never zooms, even though they are hidden.
// The input covers its chip, invisible: a tap anywhere on the chip hits the radio itself.
const hiddenRadio =
  "absolute inset-0 m-0 size-full cursor-pointer appearance-none rounded-[inherit] text-base opacity-0 disabled:cursor-not-allowed";

export function ChipGroup({
  legend,
  field,
  value,
  onChange,
  options,
  error,
  hint,
  trailing,
  hideLegend,
  className,
}: GroupProps) {
  const { name, errorID, hintID } = useGroupIds();
  const describedBy = [error ? errorID : "", hint ? hintID : ""].filter(Boolean).join(" ") || undefined;
  return (
    <fieldset data-field={field} className={cn("min-w-0", className)}>
      <legend className={cn("mb-2 text-label", hideLegend && "sr-only")}>{legend}</legend>
      <div className="flex min-w-0 flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "relative inline-flex min-h-11 max-w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-medium transition-[color,background-color,border-color,box-shadow] select-none pointer-fine:min-h-9",
              "hover:bg-accent",
              "has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground",
              "has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
              "has-[:disabled]:cursor-not-allowed has-[:disabled:not(:checked)]:opacity-50",
              error && "border-destructive",
            )}
          >
            <input
              type="radio"
              className={hiddenRadio}
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              aria-describedby={describedBy}
              aria-invalid={error ? true : undefined}
              onChange={() => onChange(option.value)}
            />
            <span className="min-w-0 truncate">{option.label}</span>
            {option.detail ? (
              <span className="shrink-0 text-xs font-normal opacity-75">· {option.detail}</span>
            ) : null}
          </label>
        ))}
        {trailing}
      </div>
      <GroupFooter error={error} hint={hint} errorID={errorID} hintID={hintID} />
    </fieldset>
  );
}

// A segmented control: equal-width options on one track, the chosen one raised.
export function Segmented({
  legend,
  field,
  value,
  onChange,
  options,
  error,
  hideLegend = true,
  className,
}: Omit<GroupProps, "trailing" | "hint">) {
  const { name, errorID, hintID } = useGroupIds();
  return (
    <fieldset data-field={field} className={cn("min-w-0", className)}>
      <legend className={cn("mb-2 text-label", hideLegend && "sr-only")}>{legend}</legend>
      <div
        className="grid min-w-0 gap-1 rounded-lg bg-muted p-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "relative flex h-10 min-w-0 cursor-pointer items-center justify-center rounded-md px-2 text-sm font-medium text-muted-foreground transition-[color,background-color,box-shadow] select-none",
              "hover:text-foreground",
              "has-[:checked]:bg-card has-[:checked]:text-foreground has-[:checked]:shadow-sm",
              "has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/60",
              "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
            )}
          >
            <input
              type="radio"
              className={hiddenRadio}
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
            />
            <span className="truncate">{option.label}</span>
          </label>
        ))}
      </div>
      <GroupFooter error={error} errorID={errorID} hintID={hintID} />
    </fieldset>
  );
}

// A chip-shaped button for actions inside a chip row ("New category", "Show all").
export function ChipButton({
  children,
  className,
  pressed,
  ...props
}: React.ComponentProps<"button"> & { pressed?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        "inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-dashed px-3.5 text-sm font-medium text-primary transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 pointer-fine:min-h-9 [&_svg]:size-4",
        pressed !== undefined && "border-solid text-foreground aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
