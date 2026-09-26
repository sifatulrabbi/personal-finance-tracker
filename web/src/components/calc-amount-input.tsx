import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { cn } from "cn";
import { Delete } from "lucide-react";
import type { Currency } from "@/api/types";
import { Input } from "@/components/ui/input";
import { useMediaQuery } from "@/lib/use-media-query";
import { currencySymbol, formatMoney } from "@/money/format";
import { evaluateAmountInput } from "@/money/formula";

// Phones and tablets: their decimal keypad has no + × ÷ or brackets, so the field offers them.
export const coarsePointerQuery = "(pointer: coarse)";

const operatorKeys = [
  { label: "+", insert: "+", name: "Plus" },
  { label: "−", insert: "−", name: "Minus" },
  { label: "×", insert: "×", name: "Times" },
  { label: "÷", insert: "÷", name: "Divide by" },
  { label: "(", insert: "(", name: "Open bracket" },
  { label: ")", insert: ")", name: "Close bracket" },
] as const;

// Sets the value the way typing does, so React's onChange runs for controlled and
// uncontrolled inputs alike.
function setTypedValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

// Inserts text at the caret, replacing any selection; null deletes the selection or the
// character before the caret.
export function editAtCaret(value: string, start: number, end: number, text: string | null) {
  if (text !== null) return { value: value.slice(0, start) + text + value.slice(end), caret: start + text.length };
  if (start !== end) return { value: value.slice(0, start) + value.slice(end), caret: start };
  if (start === 0) return { value, caret: 0 };
  return { value: value.slice(0, start - 1) + value.slice(end), caret: start - 1 };
}

// An amount field that also takes a calculation such as 120+45.50+300×2 (ADR 0014). It shows
// the rounded result as "= ৳765.50" while a calculation is typed and, on touch screens while
// focused, a row of operator keys that type at the caret without closing the keyboard. The
// parent reads the text with evaluateAmountInput (see formReader and activity/draft.ts) and
// shows any error at the field.
export function CalcAmountInput({
  currency,
  allowNegative = false,
  large = false,
  className,
  onFocus,
  onBlur,
  onChange,
  "aria-describedby": describedBy,
  ...props
}: Omit<ComponentProps<typeof Input>, "type"> & {
  currency?: Currency;
  allowNegative?: boolean;
  // The record form's amount: first and large.
  large?: boolean;
}) {
  const previewID = useId();
  const input = useRef<HTMLInputElement>(null);
  const coarse = useMediaQuery(coarsePointerQuery);
  const [focused, setFocused] = useState(false);
  const controlled = props.value !== undefined;
  const [ownText, setOwnText] = useState(String(props.defaultValue ?? ""));
  const text = controlled ? String(props.value) : ownText;

  // A form reset restores the default text without an input event; follow it.
  useEffect(() => {
    const form = input.current?.form;
    if (!form || controlled) return;
    const onReset = () => setTimeout(() => setOwnText(input.current?.value ?? ""));
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [controlled]);

  const result = evaluateAmountInput(text, { allowNegative });
  const preview =
    result.kind === "valid" && result.formula ? formatMoney(result.value, currency ?? "BDT") : "";

  function press(insert: string | null) {
    const element = input.current;
    if (!element) return;
    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? start;
    const next = editAtCaret(element.value, start, end, insert);
    if (next.value !== element.value) setTypedValue(element, next.value);
    if (document.activeElement !== element) element.focus();
    element.setSelectionRange(next.caret, next.caret);
    // React may re-render after the event; put the caret back where the key left it.
    requestAnimationFrame(() => element.setSelectionRange(next.caret, next.caret));
  }

  // Keeps focus (and the phone keyboard) in the field while a key is pressed.
  const keepFocus = (event: { preventDefault(): void }) => event.preventDefault();

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="relative min-w-0">
        {currency ? (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground",
              large ? "left-4 text-title" : "left-3 text-base",
            )}
          >
            {currencySymbol[currency]}
          </span>
        ) : null}
        <Input
          ref={input}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          data-calc=""
          aria-describedby={[describedBy, preview ? previewID : ""].filter(Boolean).join(" ") || undefined}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          onChange={(event) => {
            if (!controlled) setOwnText(event.target.value);
            onChange?.(event);
          }}
          className={cn(
            "tabular-nums",
            large && "h-16 text-[2rem] leading-none font-semibold",
            currency && (large ? "pl-11" : "pl-8"),
            className,
          )}
          {...props}
        />
      </div>
      {coarse && focused ? (
        <div role="group" aria-label="Calculator keys" data-slot="calc-keys" className="grid grid-cols-7 gap-1.5">
          {operatorKeys.map((key) => (
            <button
              key={key.name}
              type="button"
              tabIndex={-1}
              aria-label={key.name}
              onPointerDown={keepFocus}
              onMouseDown={keepFocus}
              onClick={() => press(key.insert)}
              className="flex h-11 items-center justify-center rounded-md border bg-muted text-xl font-medium text-foreground select-none active:bg-accent"
            >
              {key.label}
            </button>
          ))}
          <button
            type="button"
            tabIndex={-1}
            aria-label="Delete"
            onPointerDown={keepFocus}
            onMouseDown={keepFocus}
            onClick={() => press(null)}
            className="flex h-11 items-center justify-center rounded-md border bg-muted text-foreground select-none active:bg-accent"
          >
            <Delete aria-hidden className="size-5" />
          </button>
        </div>
      ) : null}
      <p
        id={previewID}
        aria-live="polite"
        data-slot="calc-preview"
        className={cn("tabular-nums text-muted-foreground empty:hidden", large ? "text-base" : "text-sm")}
      >
        {preview ? (
          <>
            = <span className="font-semibold text-foreground">{preview}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
