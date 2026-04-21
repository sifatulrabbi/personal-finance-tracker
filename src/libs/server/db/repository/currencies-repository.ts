/**
 * Data-access module for the `currencies` table. Every household has exactly
 * one `is_base = true` row (the BDT base, enforced by the
 * `currencies_one_base_per_household_idx` partial-unique index). The base
 * currency can be looked up via `findBase` and cannot be deleted.
 */

import type { CurrencyDto } from "@/libs/server/api/dto";
import {
  createDomainConflictError,
  createValidationError,
} from "@/libs/server/api/errors";
import { mapUniqueViolation } from "@/libs/server/db/repository/errors";
import type { RepositoryContext } from "@/libs/server/db/repository/types";
import { createId } from "@/libs/id";

type CurrencyRow = Readonly<{
  id: string;
  household_id: string;
  code: string;
  symbol: string;
  name: string;
  rate_to_bdt_minor: string | number;
  is_base: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}>;

function toTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toCurrencyDto(row: CurrencyRow): CurrencyDto {
  return {
    id: row.id,
    householdId: row.household_id,
    code: row.code,
    symbol: row.symbol,
    name: row.name,
    rateToBdtMinor: Number(row.rate_to_bdt_minor),
    isBase: row.is_base,
    createdAt: toTimestamp(row.created_at),
    updatedAt: toTimestamp(row.updated_at),
  };
}

export type NewCurrencyInput = Readonly<{
  householdId: string;
  code: string;
  symbol: string;
  name: string;
  rateToBdtMinor: number;
  isBase?: boolean;
}>;

export function createCurrenciesRepository(ctx: RepositoryContext) {
  const { db } = ctx;

  async function listByHousehold(householdId: string): Promise<CurrencyDto[]> {
    const rows = (await db`
      SELECT id::text, household_id::text, code, symbol, name,
             rate_to_bdt_minor, is_base, created_at, updated_at
      FROM currencies
      WHERE household_id = ${householdId}::uuid
      ORDER BY is_base DESC, code ASC
    `) as CurrencyRow[];

    return rows.map(toCurrencyDto);
  }

  async function findById({
    householdId,
    id,
  }: {
    householdId: string;
    id: string;
  }): Promise<CurrencyDto | null> {
    const rows = (await db`
      SELECT id::text, household_id::text, code, symbol, name,
             rate_to_bdt_minor, is_base, created_at, updated_at
      FROM currencies
      WHERE household_id = ${householdId}::uuid
        AND id = ${id}::uuid
      LIMIT 1
    `) as CurrencyRow[];

    return rows[0] ? toCurrencyDto(rows[0]) : null;
  }

  async function findByCode({
    householdId,
    code,
  }: {
    householdId: string;
    code: string;
  }): Promise<CurrencyDto | null> {
    const rows = (await db`
      SELECT id::text, household_id::text, code, symbol, name,
             rate_to_bdt_minor, is_base, created_at, updated_at
      FROM currencies
      WHERE household_id = ${householdId}::uuid
        AND code = ${code}
      LIMIT 1
    `) as CurrencyRow[];

    return rows[0] ? toCurrencyDto(rows[0]) : null;
  }

  /**
   * Returns the household's base currency. Throws if none exists — the seed
   * always inserts one, and the partial-unique index prevents multiples.
   */
  async function findBase(householdId: string): Promise<CurrencyDto> {
    const rows = (await db`
      SELECT id::text, household_id::text, code, symbol, name,
             rate_to_bdt_minor, is_base, created_at, updated_at
      FROM currencies
      WHERE household_id = ${householdId}::uuid
        AND is_base = TRUE
      LIMIT 1
    `) as CurrencyRow[];

    if (!rows[0]) {
      throw createValidationError({
        developerMessage: `No base currency found for household ${householdId}. Seed data may be missing.`,
        userMessage: "Currency configuration is incomplete for this household.",
      });
    }

    return toCurrencyDto(rows[0]);
  }

  async function insert(input: NewCurrencyInput): Promise<CurrencyDto> {
    const id = createId();
    try {
      const rows = (await db`
        INSERT INTO currencies (
          id, household_id, code, symbol, name, rate_to_bdt_minor, is_base
        )
        VALUES (
          ${id}::uuid,
          ${input.householdId}::uuid,
          ${input.code},
          ${input.symbol},
          ${input.name},
          ${input.rateToBdtMinor},
          ${input.isBase ?? false}
        )
        RETURNING id::text, household_id::text, code, symbol, name,
                  rate_to_bdt_minor, is_base, created_at, updated_at
      `) as CurrencyRow[];

      return toCurrencyDto(rows[0]!);
    } catch (error) {
      throw mapUniqueViolation({ error, name: input.code, label: "currency" });
    }
  }

  async function update({
    householdId,
    id,
    patch,
  }: {
    householdId: string;
    id: string;
    patch: Readonly<{
      symbol?: string;
      name?: string;
      rateToBdtMinor?: number;
    }>;
  }): Promise<CurrencyDto | null> {
    const rows = (await db`
      UPDATE currencies
      SET
        symbol = COALESCE(${patch.symbol ?? null}, symbol),
        name = COALESCE(${patch.name ?? null}, name),
        rate_to_bdt_minor = COALESCE(${patch.rateToBdtMinor ?? null}, rate_to_bdt_minor),
        updated_at = NOW()
      WHERE household_id = ${householdId}::uuid
        AND id = ${id}::uuid
      RETURNING id::text, household_id::text, code, symbol, name,
                rate_to_bdt_minor, is_base, created_at, updated_at
    `) as CurrencyRow[];

    return rows[0] ? toCurrencyDto(rows[0]) : null;
  }

  /**
   * Removes a non-base currency. Throws a 409 conflict when the caller tries
   * to delete the base currency — the seed/app assumes BDT is always present.
   */
  async function remove({
    householdId,
    id,
  }: {
    householdId: string;
    id: string;
  }): Promise<boolean> {
    const target = await findById({ householdId, id });
    if (!target) {
      return false;
    }
    if (target.isBase) {
      throw createDomainConflictError({
        userMessage: "The base currency cannot be deleted.",
        developerMessage: "Attempted to delete is_base=true currency row.",
      });
    }

    const rows = (await db`
      DELETE FROM currencies
      WHERE household_id = ${householdId}::uuid
        AND id = ${id}::uuid
      RETURNING id
    `) as Array<{ id: string }>;

    return rows.length > 0;
  }

  return {
    listByHousehold,
    findById,
    findByCode,
    findBase,
    insert,
    update,
    remove,
  };
}

export type CurrenciesRepository = ReturnType<
  typeof createCurrenciesRepository
>;
