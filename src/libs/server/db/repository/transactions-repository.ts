/**
 * Data-access module for the `transactions` table. Balance invariants live
 * here: every insert/update/delete that changes a ledger row also adjusts the
 * affected account's `current_balance_minor` via the injected
 * `accountsRepository`. Callers are expected to wrap mutating calls in
 * `db.begin(...)` so the ledger row and the balance move atomically.
 */

import type {
  NamedRefDto,
  TransactionDto,
  TransactionType,
} from "@/libs/server/api/dto";
import { ApiError, createBadRequestError } from "@/libs/server/api/errors";
import type { AccountsRepository } from "@/libs/server/db/repository/accounts-repository";
import type { RepositoryContext } from "@/libs/server/db/repository/types";
import { createId } from "@/libs/id";

export type TransactionsRepositoryContext = RepositoryContext &
  Readonly<{
    accountsRepository: AccountsRepository;
  }>;

type TransactionJoinedRow = Readonly<{
  id: string;
  household_id: string;
  account_id: string;
  person_id: string;
  category_id: string | null;
  origin_id: string | null;
  created_by_user_id: string;
  type: TransactionType;
  amount_minor: string | number;
  original_currency_code: string;
  original_amount_minor: string | number;
  exchange_rate_to_bdt_minor: string | number;
  description: string | null;
  transaction_date: Date | string;
  transfer_group_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  account_name: string;
  person_name: string;
  category_name: string | null;
  origin_name: string | null;
}>;

function toTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toDateOnly(value: Date | string): string {
  if (value instanceof Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  // Already a YYYY-MM-DD string coming from Postgres date-only column.
  return value.slice(0, 10);
}

function toNamedRef(
  id: string | null,
  name: string | null,
): NamedRefDto | null {
  if (!id || !name) {
    return null;
  }
  return { id, name };
}

function toTransactionDto(row: TransactionJoinedRow): TransactionDto {
  return {
    id: row.id,
    householdId: row.household_id,
    accountId: row.account_id,
    personId: row.person_id,
    categoryId: row.category_id,
    originId: row.origin_id,
    createdByUserId: row.created_by_user_id,
    type: row.type,
    amountMinor: Number(row.amount_minor),
    originalCurrencyCode: row.original_currency_code,
    originalAmountMinor: Number(row.original_amount_minor),
    exchangeRateToBdtMinor: Number(row.exchange_rate_to_bdt_minor),
    description: row.description,
    transactionDate: toDateOnly(row.transaction_date),
    transferGroupId: row.transfer_group_id,
    createdAt: toTimestamp(row.created_at),
    updatedAt: toTimestamp(row.updated_at),
    account: { id: row.account_id, name: row.account_name },
    person: { id: row.person_id, name: row.person_name },
    category: toNamedRef(row.category_id, row.category_name),
    origin: toNamedRef(row.origin_id, row.origin_name),
  };
}

export type TransactionFilters = Readonly<{
  personId?: string;
  categoryId?: string;
  accountId?: string;
  type?: TransactionType;
}>;

export type ListTransactionsArgs = Readonly<{
  householdId: string;
  filters?: TransactionFilters;
  page: number;
  pageSize: number;
}>;

export type ListTransactionsResult = Readonly<{
  data: TransactionDto[];
  total: number;
}>;

export type InsertExpenseCommand = Readonly<{
  householdId: string;
  accountId: string;
  personId: string;
  categoryId: string;
  createdByUserId: string;
  amountMinor: number;
  originalCurrencyCode: string;
  originalAmountMinor: number;
  exchangeRateToBdtMinor: number;
  description: string | null;
  transactionDate: string;
}>;

export type InsertIncomeCommand = InsertExpenseCommand &
  Readonly<{
    originId: string;
  }>;

export type InsertTransferCommand = Readonly<{
  householdId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  personId: string;
  createdByUserId: string;
  amountMinor: number;
  description: string | null;
  transactionDate: string;
}>;

export type UpdateTransactionCommand = Readonly<{
  householdId: string;
  id: string;
  patch: Readonly<{
    accountId?: string;
    personId?: string;
    categoryId?: string;
    originId?: string;
    amountMinor?: number;
    originalCurrencyCode?: string;
    originalAmountMinor?: number;
    exchangeRateToBdtMinor?: number;
    description?: string | null;
    transactionDate?: string;
  }>;
}>;

export type InsertTransferResult = Readonly<{
  expense: TransactionDto;
  income: TransactionDto;
  transferGroupId: string;
}>;

const SELECT_TRANSACTION_WITH_JOINS = `
  SELECT
    t.id::text AS id,
    t.household_id::text AS household_id,
    t.account_id::text AS account_id,
    t.person_id::text AS person_id,
    t.category_id::text AS category_id,
    t.origin_id::text AS origin_id,
    t.created_by_user_id::text AS created_by_user_id,
    t.type,
    t.amount_minor,
    t.original_currency_code,
    t.original_amount_minor,
    t.exchange_rate_to_bdt_minor,
    t.description,
    t.transaction_date,
    t.transfer_group_id::text AS transfer_group_id,
    t.created_at,
    t.updated_at,
    a.name AS account_name,
    p.name AS person_name,
    c.name AS category_name,
    o.name AS origin_name
  FROM transactions t
  JOIN accounts a ON a.id = t.account_id
  JOIN people p ON p.id = t.person_id
  LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN origins o ON o.id = t.origin_id
`;

export function createTransactionsRepository(
  ctx: TransactionsRepositoryContext,
) {
  const { db, accountsRepository } = ctx;

  async function listByHousehold({
    householdId,
    filters = {},
    page,
    pageSize,
  }: ListTransactionsArgs): Promise<ListTransactionsResult> {
    const offset = (page - 1) * pageSize;

    // Each filter column lets Bun's tagged-template query either apply the
    // predicate or fall through unchanged — "value IS NULL OR column = value"
    // is a reliable way to do optional filters without composing SQL fragments.
    const personFilter = filters.personId ?? null;
    const categoryFilter = filters.categoryId ?? null;
    const accountFilter = filters.accountId ?? null;
    const typeFilter = filters.type ?? null;

    const rows = (await db`
      SELECT
        t.id::text AS id,
        t.household_id::text AS household_id,
        t.account_id::text AS account_id,
        t.person_id::text AS person_id,
        t.category_id::text AS category_id,
        t.origin_id::text AS origin_id,
        t.created_by_user_id::text AS created_by_user_id,
        t.type,
        t.amount_minor,
        t.original_currency_code,
        t.original_amount_minor,
        t.exchange_rate_to_bdt_minor,
        t.description,
        t.transaction_date,
        t.transfer_group_id::text AS transfer_group_id,
        t.created_at,
        t.updated_at,
        a.name AS account_name,
        p.name AS person_name,
        c.name AS category_name,
        o.name AS origin_name
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      JOIN people p ON p.id = t.person_id
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN origins o ON o.id = t.origin_id
      WHERE t.household_id = ${householdId}::uuid
        AND (${personFilter}::uuid IS NULL OR t.person_id = ${personFilter}::uuid)
        AND (${categoryFilter}::uuid IS NULL OR t.category_id = ${categoryFilter}::uuid)
        AND (${accountFilter}::uuid IS NULL OR t.account_id = ${accountFilter}::uuid)
        AND (${typeFilter}::text IS NULL OR t.type = ${typeFilter}::text)
      ORDER BY t.transaction_date DESC, t.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `) as TransactionJoinedRow[];

    const totalRows = (await db`
      SELECT COUNT(*)::int AS count
      FROM transactions t
      WHERE t.household_id = ${householdId}::uuid
        AND (${personFilter}::uuid IS NULL OR t.person_id = ${personFilter}::uuid)
        AND (${categoryFilter}::uuid IS NULL OR t.category_id = ${categoryFilter}::uuid)
        AND (${accountFilter}::uuid IS NULL OR t.account_id = ${accountFilter}::uuid)
        AND (${typeFilter}::text IS NULL OR t.type = ${typeFilter}::text)
    `) as Array<{ count: number }>;

    return {
      data: rows.map(toTransactionDto),
      total: totalRows[0]?.count ?? 0,
    };
  }

  async function findById({
    householdId,
    id,
  }: {
    householdId: string;
    id: string;
  }): Promise<TransactionDto | null> {
    const rows = (await db.unsafe(
      `${SELECT_TRANSACTION_WITH_JOINS}
       WHERE t.household_id = $1::uuid AND t.id = $2::uuid
       LIMIT 1`,
      [householdId, id],
    )) as TransactionJoinedRow[];

    return rows[0] ? toTransactionDto(rows[0]) : null;
  }

  async function findRawById({
    householdId,
    id,
  }: {
    householdId: string;
    id: string;
  }): Promise<TransactionJoinedRow | null> {
    const rows = (await db.unsafe(
      `${SELECT_TRANSACTION_WITH_JOINS}
       WHERE t.household_id = $1::uuid AND t.id = $2::uuid
       LIMIT 1`,
      [householdId, id],
    )) as TransactionJoinedRow[];

    return rows[0] ?? null;
  }

  async function insertRow(args: {
    id: string;
    householdId: string;
    accountId: string;
    personId: string;
    categoryId: string | null;
    originId: string | null;
    createdByUserId: string;
    type: TransactionType;
    amountMinor: number;
    originalCurrencyCode: string;
    originalAmountMinor: number;
    exchangeRateToBdtMinor: number;
    description: string | null;
    transactionDate: string;
    transferGroupId: string | null;
  }): Promise<TransactionDto> {
    await db`
      INSERT INTO transactions (
        id, household_id, account_id, person_id, category_id, origin_id,
        created_by_user_id, type, amount_minor, original_currency_code,
        original_amount_minor, exchange_rate_to_bdt_minor, description,
        transaction_date, transfer_group_id
      )
      VALUES (
        ${args.id}::uuid,
        ${args.householdId}::uuid,
        ${args.accountId}::uuid,
        ${args.personId}::uuid,
        ${args.categoryId}::uuid,
        ${args.originId}::uuid,
        ${args.createdByUserId}::uuid,
        ${args.type},
        ${args.amountMinor},
        ${args.originalCurrencyCode},
        ${args.originalAmountMinor},
        ${args.exchangeRateToBdtMinor},
        ${args.description},
        ${args.transactionDate}::date,
        ${args.transferGroupId}::uuid
      )
    `;

    const dto = await findById({ householdId: args.householdId, id: args.id });
    if (!dto) {
      // Unreachable: insert just succeeded and we're either in the same tx or
      // reading our own commit.
      throw new Error(`Failed to read back inserted transaction ${args.id}.`);
    }
    return dto;
  }

  async function insertExpense(
    cmd: InsertExpenseCommand,
  ): Promise<TransactionDto> {
    const dto = await insertRow({
      id: createId(),
      householdId: cmd.householdId,
      accountId: cmd.accountId,
      personId: cmd.personId,
      categoryId: cmd.categoryId,
      originId: null,
      createdByUserId: cmd.createdByUserId,
      type: "expense",
      amountMinor: cmd.amountMinor,
      originalCurrencyCode: cmd.originalCurrencyCode,
      originalAmountMinor: cmd.originalAmountMinor,
      exchangeRateToBdtMinor: cmd.exchangeRateToBdtMinor,
      description: cmd.description,
      transactionDate: cmd.transactionDate,
      transferGroupId: null,
    });

    await accountsRepository.adjustBalance({
      householdId: cmd.householdId,
      id: cmd.accountId,
      deltaMinor: -cmd.amountMinor,
    });

    return dto;
  }

  async function insertIncome(
    cmd: InsertIncomeCommand,
  ): Promise<TransactionDto> {
    const dto = await insertRow({
      id: createId(),
      householdId: cmd.householdId,
      accountId: cmd.accountId,
      personId: cmd.personId,
      categoryId: cmd.categoryId,
      originId: cmd.originId,
      createdByUserId: cmd.createdByUserId,
      type: "income",
      amountMinor: cmd.amountMinor,
      originalCurrencyCode: cmd.originalCurrencyCode,
      originalAmountMinor: cmd.originalAmountMinor,
      exchangeRateToBdtMinor: cmd.exchangeRateToBdtMinor,
      description: cmd.description,
      transactionDate: cmd.transactionDate,
      transferGroupId: null,
    });

    await accountsRepository.adjustBalance({
      householdId: cmd.householdId,
      id: cmd.accountId,
      deltaMinor: cmd.amountMinor,
    });

    return dto;
  }

  /**
   * Records a transfer as a linked pair of ledger rows sharing a
   * `transfer_group_id`. Transfers are always BDT-denominated because account
   * balances are always in BDT — foreign-currency transfers are out of scope.
   */
  async function insertTransfer(
    cmd: InsertTransferCommand,
  ): Promise<InsertTransferResult> {
    if (cmd.sourceAccountId === cmd.destinationAccountId) {
      throw createBadRequestError({
        userMessage: "Source and destination accounts must be different.",
      });
    }

    const transferGroupId = createId();

    const expense = await insertRow({
      id: createId(),
      householdId: cmd.householdId,
      accountId: cmd.sourceAccountId,
      personId: cmd.personId,
      categoryId: null,
      originId: null,
      createdByUserId: cmd.createdByUserId,
      type: "expense",
      amountMinor: cmd.amountMinor,
      originalCurrencyCode: "BDT",
      originalAmountMinor: cmd.amountMinor,
      exchangeRateToBdtMinor: 100,
      description: cmd.description,
      transactionDate: cmd.transactionDate,
      transferGroupId,
    });

    const income = await insertRow({
      id: createId(),
      householdId: cmd.householdId,
      accountId: cmd.destinationAccountId,
      personId: cmd.personId,
      categoryId: null,
      originId: null,
      createdByUserId: cmd.createdByUserId,
      type: "income",
      amountMinor: cmd.amountMinor,
      originalCurrencyCode: "BDT",
      originalAmountMinor: cmd.amountMinor,
      exchangeRateToBdtMinor: 100,
      description: cmd.description,
      transactionDate: cmd.transactionDate,
      transferGroupId,
    });

    await accountsRepository.adjustBalance({
      householdId: cmd.householdId,
      id: cmd.sourceAccountId,
      deltaMinor: -cmd.amountMinor,
    });
    await accountsRepository.adjustBalance({
      householdId: cmd.householdId,
      id: cmd.destinationAccountId,
      deltaMinor: cmd.amountMinor,
    });

    return { expense, income, transferGroupId };
  }

  /**
   * Updates a non-transfer transaction. Reverses the original ledger impact on
   * the prior account and applies the new impact on the (potentially
   * different) updated account. Transfer rows are rejected upstream — edits
   * are "delete + recreate" per `project/REQUIREMENTS.md`.
   */
  async function update(
    cmd: UpdateTransactionCommand,
  ): Promise<TransactionDto> {
    const current = await findRawById({
      householdId: cmd.householdId,
      id: cmd.id,
    });
    if (!current) {
      throw new ApiError({
        statusCode: 404,
        code: "not_found",
        userMessage: "Transaction not found.",
      });
    }
    if (current.transfer_group_id) {
      throw createBadRequestError({
        userMessage:
          "Cannot edit transfer transactions. Delete and recreate instead.",
      });
    }

    const merged = {
      accountId: cmd.patch.accountId ?? current.account_id,
      personId: cmd.patch.personId ?? current.person_id,
      categoryId:
        cmd.patch.categoryId !== undefined
          ? cmd.patch.categoryId
          : current.category_id,
      originId:
        cmd.patch.originId !== undefined
          ? cmd.patch.originId
          : current.origin_id,
      amountMinor: cmd.patch.amountMinor ?? Number(current.amount_minor),
      originalCurrencyCode:
        cmd.patch.originalCurrencyCode ?? current.original_currency_code,
      originalAmountMinor:
        cmd.patch.originalAmountMinor ?? Number(current.original_amount_minor),
      exchangeRateToBdtMinor:
        cmd.patch.exchangeRateToBdtMinor ??
        Number(current.exchange_rate_to_bdt_minor),
      description:
        cmd.patch.description !== undefined
          ? cmd.patch.description
          : current.description,
      transactionDate:
        cmd.patch.transactionDate ?? toDateOnly(current.transaction_date),
    };

    const priorDelta =
      current.type === "income"
        ? Number(current.amount_minor)
        : -Number(current.amount_minor);
    const nextDelta =
      current.type === "income" ? merged.amountMinor : -merged.amountMinor;

    await db`
      UPDATE transactions
      SET
        account_id = ${merged.accountId}::uuid,
        person_id = ${merged.personId}::uuid,
        category_id = ${merged.categoryId}::uuid,
        origin_id = ${merged.originId}::uuid,
        amount_minor = ${merged.amountMinor},
        original_currency_code = ${merged.originalCurrencyCode},
        original_amount_minor = ${merged.originalAmountMinor},
        exchange_rate_to_bdt_minor = ${merged.exchangeRateToBdtMinor},
        description = ${merged.description},
        transaction_date = ${merged.transactionDate}::date,
        updated_at = NOW()
      WHERE household_id = ${cmd.householdId}::uuid
        AND id = ${cmd.id}::uuid
    `;

    // Reverse the original impact on the old account, then apply the new
    // impact to the (possibly different) new account. When account_id hasn't
    // changed these net against each other inside the same row.
    await accountsRepository.adjustBalance({
      householdId: cmd.householdId,
      id: current.account_id,
      deltaMinor: -priorDelta,
    });
    await accountsRepository.adjustBalance({
      householdId: cmd.householdId,
      id: merged.accountId,
      deltaMinor: nextDelta,
    });

    const dto = await findById({ householdId: cmd.householdId, id: cmd.id });
    if (!dto) {
      throw new Error(`Transaction ${cmd.id} disappeared after update.`);
    }
    return dto;
  }

  /**
   * Deletes a transaction. For a regular row: reverses its ledger impact. For
   * a transfer row: deletes both legs in the shared transfer_group_id and
   * reverses both balance moves.
   */
  async function remove({
    householdId,
    id,
  }: {
    householdId: string;
    id: string;
  }): Promise<boolean> {
    const current = await findRawById({ householdId, id });
    if (!current) {
      return false;
    }

    if (current.transfer_group_id) {
      const legs = (await db`
        SELECT
          id::text,
          account_id::text AS account_id,
          type,
          amount_minor
        FROM transactions
        WHERE household_id = ${householdId}::uuid
          AND transfer_group_id = ${current.transfer_group_id}::uuid
      `) as Array<{
        id: string;
        account_id: string;
        type: TransactionType;
        amount_minor: string | number;
      }>;

      await db`
        DELETE FROM transactions
        WHERE household_id = ${householdId}::uuid
          AND transfer_group_id = ${current.transfer_group_id}::uuid
      `;

      for (const leg of legs) {
        const amount = Number(leg.amount_minor);
        const delta = leg.type === "income" ? -amount : amount;
        await accountsRepository.adjustBalance({
          householdId,
          id: leg.account_id,
          deltaMinor: delta,
        });
      }

      return true;
    }

    await db`
      DELETE FROM transactions
      WHERE household_id = ${householdId}::uuid
        AND id = ${id}::uuid
    `;

    const amount = Number(current.amount_minor);
    const reverseDelta = current.type === "income" ? -amount : amount;
    await accountsRepository.adjustBalance({
      householdId,
      id: current.account_id,
      deltaMinor: reverseDelta,
    });

    return true;
  }

  return {
    listByHousehold,
    findById,
    insertExpense,
    insertIncome,
    insertTransfer,
    update,
    remove,
  };
}

export type TransactionsRepository = ReturnType<
  typeof createTransactionsRepository
>;
