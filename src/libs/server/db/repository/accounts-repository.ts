/**
 * Data-access module for the `accounts` table. Follows the procedural factory
 * pattern: `createAccountsRepository({ db })` returns a plain object of async
 * functions closed over the injected `db`. No classes, no `this`. The caller
 * chooses whether `db` is the pooled runtime connection or a transaction
 * handle from `db.begin` — repositories don't start transactions themselves.
 */

import type { AccountDto } from "@/libs/server/api/dto";
import { mapUniqueViolation } from "@/libs/server/db/repository/errors";
import type { RepositoryContext } from "@/libs/server/db/repository/types";
import { createId } from "@/libs/id";

/** Row shape returned by raw SELECTs against the `accounts` table. */
type AccountRow = Readonly<{
  id: string;
  household_id: string;
  name: string;
  description: string | null;
  initial_balance_minor: string | number;
  current_balance_minor: string | number;
  created_at: Date | string;
  updated_at: Date | string;
}>;

function toTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toAccountDto(row: AccountRow): AccountDto {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    description: row.description,
    initialBalanceMinor: Number(row.initial_balance_minor),
    currentBalanceMinor: Number(row.current_balance_minor),
    createdAt: toTimestamp(row.created_at),
    updatedAt: toTimestamp(row.updated_at),
  };
}

export type NewAccountInput = Readonly<{
  householdId: string;
  name: string;
  description: string | null;
  initialBalanceMinor: number;
}>;

export type UpdateAccountInput = Readonly<{
  householdId: string;
  id: string;
  patch: Readonly<{
    name?: string;
    description?: string | null;
  }>;
}>;

export function createAccountsRepository(ctx: RepositoryContext) {
  const { db } = ctx;

  async function listByHousehold(householdId: string): Promise<AccountDto[]> {
    const rows = (await db`
      SELECT id::text, household_id::text, name, description,
             initial_balance_minor, current_balance_minor,
             created_at, updated_at
      FROM accounts
      WHERE household_id = ${householdId}::uuid
      ORDER BY name ASC
    `) as AccountRow[];

    return rows.map(toAccountDto);
  }

  async function findById({
    householdId,
    id,
  }: {
    householdId: string;
    id: string;
  }): Promise<AccountDto | null> {
    const rows = (await db`
      SELECT id::text, household_id::text, name, description,
             initial_balance_minor, current_balance_minor,
             created_at, updated_at
      FROM accounts
      WHERE household_id = ${householdId}::uuid
        AND id = ${id}::uuid
      LIMIT 1
    `) as AccountRow[];

    return rows[0] ? toAccountDto(rows[0]) : null;
  }

  async function insert(input: NewAccountInput): Promise<AccountDto> {
    const id = createId();
    try {
      const rows = (await db`
        INSERT INTO accounts (
          id, household_id, name, description,
          initial_balance_minor, current_balance_minor
        )
        VALUES (
          ${id}::uuid,
          ${input.householdId}::uuid,
          ${input.name},
          ${input.description},
          ${input.initialBalanceMinor},
          ${input.initialBalanceMinor}
        )
        RETURNING id::text, household_id::text, name, description,
                  initial_balance_minor, current_balance_minor,
                  created_at, updated_at
      `) as AccountRow[];

      return toAccountDto(rows[0]!);
    } catch (error) {
      throw mapUniqueViolation({ error, name: input.name, label: "account" });
    }
  }

  async function update({
    householdId,
    id,
    patch,
  }: UpdateAccountInput): Promise<AccountDto | null> {
    try {
      const rows = (await db`
        UPDATE accounts
        SET
          name = COALESCE(${patch.name ?? null}, name),
          description = CASE
            WHEN ${patch.description === undefined} THEN description
            ELSE ${patch.description ?? null}
          END,
          updated_at = NOW()
        WHERE household_id = ${householdId}::uuid
          AND id = ${id}::uuid
        RETURNING id::text, household_id::text, name, description,
                  initial_balance_minor, current_balance_minor,
                  created_at, updated_at
      `) as AccountRow[];

      return rows[0] ? toAccountDto(rows[0]) : null;
    } catch (error) {
      throw mapUniqueViolation({
        error,
        name: patch.name ?? "",
        label: "account",
      });
    }
  }

  /**
   * Moves an account's `current_balance_minor` by `deltaMinor`. Locks the row
   * with SELECT ... FOR UPDATE so concurrent ledger writes serialize. Must be
   * called inside an open transaction (`db.begin(...)`).
   */
  async function adjustBalance({
    householdId,
    id,
    deltaMinor,
  }: {
    householdId: string;
    id: string;
    deltaMinor: number;
  }): Promise<void> {
    // Lock the row so concurrent transfers/expenses don't race on balance updates.
    await db`
      SELECT id
      FROM accounts
      WHERE household_id = ${householdId}::uuid
        AND id = ${id}::uuid
      FOR UPDATE
    `;
    await db`
      UPDATE accounts
      SET current_balance_minor = current_balance_minor + ${deltaMinor},
          updated_at = NOW()
      WHERE household_id = ${householdId}::uuid
        AND id = ${id}::uuid
    `;
  }

  async function remove({
    householdId,
    id,
  }: {
    householdId: string;
    id: string;
  }): Promise<boolean> {
    const rows = (await db`
      DELETE FROM accounts
      WHERE household_id = ${householdId}::uuid
        AND id = ${id}::uuid
      RETURNING id
    `) as Array<{ id: string }>;

    return rows.length > 0;
  }

  return {
    listByHousehold,
    findById,
    insert,
    update,
    adjustBalance,
    remove,
  };
}

export type AccountsRepository = ReturnType<typeof createAccountsRepository>;
