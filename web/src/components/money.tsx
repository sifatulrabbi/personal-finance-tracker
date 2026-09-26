import { cn } from "cn";
import type { Currency } from "@/api/types";
import {
  formatMoney,
  moneyTone,
  type MoneyDirection,
  type MoneyTone,
} from "@/money/format";

const toneClass: Record<MoneyTone, string> = {
  income: "text-income",
  expense: "text-expense",
  transfer: "text-transfer",
  negative: "text-destructive",
  debt: "text-warning",
  neutral: "",
};

// The one way to show an amount: sign, currency symbol, grouping, color role, tabular
// digits, and a voided style. The text is a single node that never wraps mid-number.
export function Money({
  amount,
  currency,
  direction = "balance",
  debt = false,
  voided = false,
  className,
  ...props
}: {
  amount: string;
  currency: Currency | string;
  direction?: MoneyDirection;
  // Card debt: shown in the debt color so it is never mistaken for cash.
  debt?: boolean;
  voided?: boolean;
  className?: string;
} & Omit<React.ComponentProps<"span">, "children">) {
  const tone = moneyTone(amount, direction, debt);
  return (
    <span
      data-money=""
      data-tone={tone}
      data-voided={voided ? "" : undefined}
      className={cn(
        "whitespace-nowrap tabular-nums",
        voided ? "text-muted-foreground line-through decoration-1" : toneClass[tone],
        className,
      )}
      {...props}
    >
      {formatMoney(amount, currency, direction)}
    </span>
  );
}
