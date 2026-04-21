"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { convertToBdt, BASE_CURRENCY_CODE } from "@/libs/currency";
import { formatCurrency } from "@/libs/format";
import { cn } from "@/libs/utils";
import type { Currency } from "@/stores/currency-store";

/**
 * Combines an amount input, currency selector, and BDT preview into a single
 * controlled field. Used by both expense and income forms. Transfers render
 * this in `lockedCurrency` mode so the currency selector is hidden and the
 * user only enters a BDT amount.
 */
export function CurrencyAmountField({
  id,
  amount,
  setAmount,
  currencyCode,
  setCurrencyCode,
  currencies,
  amountError,
  disabled = false,
  lockedCurrency,
  label = "Amount",
}: {
  id?: string;
  amount: string;
  setAmount: (next: string) => void;
  currencyCode: string;
  setCurrencyCode: (next: string) => void;
  currencies: Currency[];
  amountError?: string;
  disabled?: boolean;
  lockedCurrency?: string;
  label?: string;
}) {
  const effectiveCurrency = lockedCurrency ?? currencyCode;
  const selectedCurrency = currencies.find((c) => c.code === effectiveCurrency);
  const parsedAmount = Number.parseFloat(amount);
  const showConversion =
    effectiveCurrency !== BASE_CURRENCY_CODE &&
    selectedCurrency !== undefined &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0;
  const bdtPreview = showConversion
    ? formatCurrency(
        convertToBdt(
          Math.round(parsedAmount * 100),
          selectedCurrency.rateToBdtMinor,
        ),
      )
    : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor={id}>{label}</Label>
          <Input
            id={id}
            placeholder="0.00"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={disabled}
            aria-invalid={!!amountError || undefined}
            className={cn(amountError && "border-destructive")}
          />
        </div>
        {!lockedCurrency && (
          <div className="flex flex-col gap-1.5">
            <Label>Currency</Label>
            <Select
              value={currencyCode}
              items={currencies.map((c) => ({ value: c.code, label: c.code }))}
              onValueChange={(v) =>
                setCurrencyCode(typeof v === "string" ? v : BASE_CURRENCY_CODE)
              }
              disabled={disabled}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((c) => (
                  <SelectItem key={c.id} value={c.code}>
                    {c.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      {amountError && (
        <p className="text-xs text-destructive" role="alert">
          {amountError}
        </p>
      )}
      {showConversion && selectedCurrency && (
        <p className="text-xs text-muted-foreground">
          = {bdtPreview} at 1 {effectiveCurrency} ={" "}
          {(selectedCurrency.rateToBdtMinor / 100).toFixed(2)} BDT
        </p>
      )}
    </div>
  );
}
