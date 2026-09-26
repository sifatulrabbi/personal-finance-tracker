import { useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "cn";
import { Delete } from "lucide-react";
import type { Currency } from "@/api/types";
import { Input } from "@/components/ui/input";
import { useMediaQuery } from "@/lib/use-media-query";
import { currencySymbol, formatMoney } from "@/money/format";
import { evaluateAmountInput } from "@/money/formula";

// Phones and tablets: their decimal keypad has no + × ÷ or brackets, so the field offers them.
export const coarsePointerQuery = "(pointer: coarse)";
// How long the keys stay after the field loses focus; longer than a tap's click delay.
const keysLingerMs = 300;

const operatorKeys = [
  { label: "+", insert: "+", name: "Plus" },
  { label: "−", insert: "−", name: "Minus" },
  { label: "×", insert: "×", name: "Times" },
  { label: "÷", insert: "÷", name: "Divide by" },
  { label: "(", insert: "(", name: "Open bracket" },
  { label: ")", insert: ")", name: "Close bracket" },
] as const;

// One operator key. It acts on pointer down, like a keyboard key, and cancels the default so
// focus (and the phone keyboard) stays in the field. WebKit fires no click after a cancelled
// pointer down, so the click is only a fallback, ignored after a pointer press.
function CalcKey({ name, onPress, children }: { name: string; onPress: () => void; children: ReactNode }) {
  const pressedByPointer = useRef(false);
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={name}
      onPointerDown={(event) => {
        event.preventDefault();
        pressedByPointer.current = true;
        onPress();
      }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        if (!pressedByPointer.current) onPress();
        pressedByPointer.current = false;
      }}
      className="flex h-11 touch-manipulation items-center justify-center rounded-md border bg-muted text-xl font-medium text-foreground select-none active:bg-accent"
    >
      {children}
    </button>
  );
}

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
    // React re-renders with the value the input already has, so it leaves this caret alone. A
    // deferred restore would undo a caret move made right after the key.
    element.setSelectionRange(next.caret, next.caret);
  }

  // The keys stay a moment after the field loses focus: hiding them at once moves everything
  // below up while the tap that moved focus is still landing, so it would miss its target
  // (Save, a wallet chip).
  const hideKeys = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(hideKeys.current), []);

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
            window.clearTimeout(hideKeys.current);
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            window.clearTimeout(hideKeys.current);
            hideKeys.current = window.setTimeout(() => setFocused(false), keysLingerMs);
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
            <CalcKey key={key.name} name={key.name} onPress={() => press(key.insert)}>
              {key.label}
            </CalcKey>
          ))}
          <CalcKey name="Delete" onPress={() => press(null)}>
            <Delete aria-hidden className="size-5" />
          </CalcKey>
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
