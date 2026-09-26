import {
  useId,
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CircleAlert } from "lucide-react";
import { cn } from "cn";
import { errorMessage, isApiError } from "@/api/errors";
import { mutationKey, type MutationKey } from "@/api/idempotency";
import type { Currency, Wallet } from "@/api/types";
import { parseDecimalInput } from "@/money/decimal";
import { currencySymbol } from "@/money/format";
import { useInSheet } from "@/components/layout";
import { notifySaved } from "@/components/feedback";

export function TextField({
  label,
  hint,
  id,
  ...props
}: ComponentProps<typeof Input> & { label: string; hint?: string }) {
  // Unique ids keep labels pointing at the right input when two forms share a field name.
  const generated = useId();
  const inputID = id ?? generated;
  return (
    <Field>
      <FieldLabel htmlFor={inputID}>{label}</FieldLabel>
      <Input id={inputID} {...props} />
      {hint ? <FieldDescription>{hint}</FieldDescription> : null}
    </Field>
  );
}
export function Notes({
  defaultValue = "",
  label = "Note",
  name = "note",
  required = false,
}: {
  defaultValue?: string;
  label?: string;
  name?: string;
  required?: boolean;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        id={id}
        name={name}
        defaultValue={defaultValue}
        maxLength={name === "reason" ? 500 : 1800}
        required={required}
      />
    </Field>
  );
}
export function Choice({
  label,
  name,
  options,
  value,
  onChange,
  defaultValue,
  required = true,
}: {
  label: string;
  name: string;
  options: { value: string; label: string; disabled?: boolean }[];
  value?: string;
  onChange?: (value: string) => void;
  defaultValue?: string;
  required?: boolean;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect
        id={id}
        name={name}
        value={value}
        defaultValue={defaultValue}
        onChange={
          onChange ? (event) => onChange(event.target.value) : undefined
        }
        required={required}
        className="w-full"
      >
        {options.map((option) => (
          <NativeSelectOption
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}
export function WalletChoice({
  wallets,
  label = "Wallet",
  name = "wallet_id",
  defaultValue,
  value,
  onChange,
  disabledID,
}: {
  wallets: Wallet[];
  disabledID?: string;
  label?: string;
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <Choice
      label={label}
      name={name}
      defaultValue={defaultValue}
      value={value}
      onChange={onChange}
      options={wallets
        .filter((w) => !w.archived || w.id === (value ?? defaultValue))
        .map((w) => ({
          value: w.id,
          label: `${w.name} · ${w.currency}${w.card_type === "credit" ? " · Credit" : ""}${w.archived ? " · Archived" : ""}`,
          disabled: w.archived || w.id === disabledID,
        }))}
    />
  );
}

// A text field for amounts and rates. type="number" is avoided on purpose: it silently
// reads unparseable text (such as "1020,50") as empty, changes on mouse-wheel scroll, and
// accepts forms like 1e3. The text is checked as a string when the field loses focus and
// again on submit; an invalid value is always an error, never sent as blank.
export function MoneyField({
  label = "Amount",
  hint,
  required = true,
  maxFraction = 2,
  allowNegative = false,
  currency,
  onChange,
  className,
  ...props
}: Omit<ComponentProps<typeof Input>, "type" | "min" | "step"> & {
  label?: string;
  hint?: string;
  maxFraction?: number;
  allowNegative?: boolean;
  // Shows the currency symbol inside the field, before the digits.
  currency?: Currency;
}) {
  const id = useId();
  const errorID = `${id}-error`;
  const [error, setError] = useState("");
  const input = (
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        required={required}
        data-decimal-field=""
        data-label={label}
        data-max-fraction={maxFraction}
        data-allow-negative={allowNegative ? "true" : "false"}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorID : undefined}
        onBlur={(event) => {
          const result = parseDecimalInput(event.currentTarget.value, {
            maxFraction,
            allowNegative,
          });
          setError(result.kind === "invalid" ? result.message : "");
        }}
        onChange={(event) => {
          if (error) setError("");
          onChange?.(event);
        }}
        className={cn(currency && "pl-8", className)}
        {...props}
      />
  );
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {currency ? (
        <div className="relative min-w-0">
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base text-muted-foreground"
          >
            {currencySymbol[currency]}
          </span>
          {input}
        </div>
      ) : (
        input
      )}
      {hint ? <FieldDescription>{hint}</FieldDescription> : null}
      {error ? <FieldError id={errorID}>{error}</FieldError> : null}
    </Field>
  );
}
export function RateField(
  props: Omit<ComponentProps<typeof MoneyField>, "maxFraction" | "allowNegative">,
) {
  return <MoneyField maxFraction={6} {...props} />;
}

export function ErrorMessage({ error }: { error: string }) {
  return error ? (
    <Alert variant="destructive" role="alert">
      <CircleAlert aria-hidden />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null;
}

// A hint that needs attention but is not an error (for example an archived wallet).
export function WarningMessage({ children }: { children: ReactNode }) {
  return (
    <Alert variant="warning" role="alert">
      <CircleAlert aria-hidden />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

// A value the user typed that cannot be sent as it is.
export class InputError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

export type FormReader = {
  text(name: string): string;
  // Reads a MoneyField or RateField. Empty gives "" only when the field is optional;
  // malformed text always throws an InputError.
  decimal(name: string): string;
};

export function formReader(form: HTMLFormElement): FormReader {
  const data = new FormData(form);
  const text = (name: string) => String(data.get(name) ?? "");
  return {
    text,
    decimal(name) {
      const element = form.elements.namedItem(name);
      const input = element instanceof HTMLInputElement ? element : null;
      const label = input?.dataset.label ?? name;
      const result = parseDecimalInput(text(name), {
        maxFraction: Number(input?.dataset.maxFraction ?? 2),
        allowNegative: input?.dataset.allowNegative === "true",
      });
      if (result.kind === "invalid")
        throw new InputError(name, `${label}: ${result.message}`);
      if (result.kind === "empty") {
        if (input?.required) throw new InputError(name, `${label}: enter a value.`);
        return "";
      }
      return result.value;
    },
  };
}

function focusField(form: HTMLFormElement, name: string) {
  const element = form.elements.namedItem(name);
  if (element instanceof HTMLElement) {
    element.setAttribute("aria-invalid", "true");
    element.addEventListener("input", () => element.removeAttribute("aria-invalid"), {
      once: true,
    });
    element.focus();
  }
}

export function SaveForm<Body, Result>({
  children,
  body,
  send,
  onSaved,
  label = "Save",
  disabled = false,
  resetOnSuccess = false,
  saved,
}: {
  children: ReactNode;
  body: (form: FormReader) => Body;
  // Sends the write with its idempotency key and applies its cache effect.
  send: (body: Body, key: string) => Promise<Result>;
  onSaved?: (result: Result) => void;
  label?: string;
  disabled?: boolean;
  resetOnSuccess?: boolean;
  // The toast shown after a successful save. An id lets the screen dismiss it early.
  saved?: string | { message: string; id: string };
}) {
  const inSheet = useInSheet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const last = useRef<MutationKey | undefined>(undefined);
  const inFlight = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget;
    let data: Body;
    try {
      data = body(formReader(form));
    } catch (problem) {
      if (problem instanceof InputError) {
        setError(problem.message);
        focusField(form, problem.field);
        return;
      }
      throw problem;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      // The same key is reused only when retrying an identical body.
      last.current = mutationKey(last.current, "form", data);
      const result = await send(data, last.current.key);
      // The next, separate submission must never replay this response.
      last.current = undefined;
      if (resetOnSuccess) form.reset();
      if (saved) notifySaved(saved);
      onSaved?.(result);
    } catch (problem) {
      setError(errorMessage(problem, "Could not save. Your entry is still here; try again."));
      if (isApiError(problem) && problem.field) focusField(form, problem.field);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  const footer = (
    <>
      <ErrorMessage error={error} />
      <Button type="submit" size={inSheet ? "lg" : "default"} disabled={busy || disabled} className={inSheet ? "w-full" : "self-start"}>
        {busy ? "Saving…" : label}
      </Button>
    </>
  );
  if (inSheet)
    // In a sheet the error and the Save button stay pinned to the bottom, so an error is
    // never below the fold and Save is reachable with the keyboard open.
    return (
      <form onSubmit={submit} data-sheet-form="">
        <FieldGroup>{children}</FieldGroup>
        <div
          data-slot="sheet-footer"
          className="sticky bottom-0 z-10 -mx-4 mt-5 flex flex-col gap-3 border-t bg-card px-4 py-3 sm:-mx-5 sm:px-5"
        >
          {footer}
        </div>
      </form>
    );
  return (
    <form onSubmit={submit}>
      <FieldGroup>
        {children}
        {footer}
      </FieldGroup>
    </form>
  );
}
