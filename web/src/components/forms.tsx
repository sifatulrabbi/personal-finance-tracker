import {
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Field,
  FieldDescription,
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
import { api, mutationKey, type MutationKey, type Wallet } from "@/lib/api";

export function TextField({
  label,
  hint,
  ...props
}: ComponentProps<typeof Input> & { label: string; hint?: string }) {
  return (
    <Field>
      <FieldLabel htmlFor={props.name}>{label}</FieldLabel>
      <Input id={props.name} {...props} />
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
  return (
    <Field>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Textarea
        id={name}
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
  return (
    <Field>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <NativeSelect
        id={name}
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
export function MoneyField({
  label = "Amount",
  required = true,
  ...props
}: Omit<ComponentProps<typeof Input>, "type"> & { label?: string }) {
  return (
    <TextField
      label={label}
      type="number"
      step="0.01"
      min="0.01"
      inputMode="decimal"
      required={required}
      {...props}
    />
  );
}
export function ErrorMessage({ error }: { error: string }) {
  return error ? (
    <Alert variant="destructive" role="alert">
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null;
}
export const value = (form: FormData, name: string) =>
  String(form.get(name) ?? "");

export function SaveForm({
  children,
  path,
  method = "POST",
  body,
  onSaved,
  label = "Save",
  disabled = false,
}: {
  children: ReactNode;
  path: string;
  method?: string;
  body: (form: FormData) => unknown;
  onSaved: () => void;
  label?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const last = useRef<MutationKey | undefined>(undefined);
  const inFlight = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const data = body(new FormData(event.currentTarget));
      last.current = mutationKey(last.current, `${method} ${path}`, data);
      await api(path, method, data, last.current.key);
      onSaved();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save. Please retry.",
      );
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  return (
    <form onSubmit={submit}>
      <FieldGroup>
        {children}
        <ErrorMessage error={error} />
        <Button type="submit" disabled={busy || disabled}>
          {busy ? "Saving…" : label}
        </Button>
      </FieldGroup>
    </form>
  );
}
