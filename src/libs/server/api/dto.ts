/**
 * Data transfer objects returned by API route handlers. The frontend consumes
 * this shape directly, so changing a field here is a breaking wire-format
 * change. Repositories convert Postgres rows into these DTOs — route handlers
 * do not reshape rows themselves.
 *
 * Every timestamp is an ISO-8601 UTC string (e.g. `2026-04-21T12:34:56.000Z`).
 * Every monetary amount is a non-negative integer in minor units.
 */

export type HouseholdDto = Readonly<{
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type UserDto = Readonly<{
  id: string;
  householdId: string;
  email: string;
  name: string | null;
  isDrafted: boolean;
  createdAt: string;
  updatedAt: string;
}>;

export type PersonDto = Readonly<{
  id: string;
  householdId: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}>;

export type CategoryDto = Readonly<{
  id: string;
  householdId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type OriginDto = Readonly<{
  id: string;
  householdId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type AccountDto = Readonly<{
  id: string;
  householdId: string;
  name: string;
  description: string | null;
  initialBalanceMinor: number;
  currentBalanceMinor: number;
  createdAt: string;
  updatedAt: string;
}>;

export type CurrencyDto = Readonly<{
  id: string;
  householdId: string;
  code: string;
  symbol: string;
  name: string;
  rateToBdtMinor: number;
  isBase: boolean;
  createdAt: string;
  updatedAt: string;
}>;

/** Embedded reference used inside TransactionDto to avoid an extra round-trip. */
export type NamedRefDto = Readonly<{ id: string; name: string }>;

export type TransactionType = "income" | "expense";

export type TransactionDto = Readonly<{
  id: string;
  householdId: string;
  accountId: string;
  personId: string;
  categoryId: string | null;
  originId: string | null;
  createdByUserId: string;
  type: TransactionType;
  /** BDT-converted amount stored on the ledger row. */
  amountMinor: number;
  originalCurrencyCode: string;
  originalAmountMinor: number;
  exchangeRateToBdtMinor: number;
  description: string | null;
  transactionDate: string;
  transferGroupId: string | null;
  createdAt: string;
  updatedAt: string;
  account: NamedRefDto;
  person: NamedRefDto;
  category: NamedRefDto | null;
  origin: NamedRefDto | null;
}>;
