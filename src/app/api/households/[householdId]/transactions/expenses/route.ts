import type { NextRequest } from "next/server";

import {
  BASE_CURRENCY_CODE,
  BASE_CURRENCY_RATE,
  convertToBdt,
} from "@/libs/currency";
import { requireHouseholdAccess } from "@/libs/server/api/access";
import {
  createApiErrorResponse,
  createBadRequestError,
} from "@/libs/server/api/errors";
import { createExpenseSchema } from "@/libs/server/api/schemas";
import { parseJsonRequestBody } from "@/libs/server/api/validation";
import { requireSessionUser } from "@/libs/server/auth";
import type { BunSqlDatabase } from "@/libs/server/db/client";
import { getDb } from "@/libs/server/db/client";
import { createRepositories } from "@/libs/server/db/repository";
import { logger } from "@/libs/server/logger";

type RouteParams = { params: Promise<{ householdId: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const householdId = await requireHouseholdAccess(params, user);

    const body = await parseJsonRequestBody(request, createExpenseSchema);

    const db = getDb();

    // Inline-create of the category (when the user types a name instead of
    // picking an existing id), the ledger insert, and the account balance
    // adjustment all run atomically.
    const transaction = await db.begin(async (tx: BunSqlDatabase) => {
      const repos = createRepositories({ db: tx });

      let rate = BASE_CURRENCY_RATE;
      if (body.currency !== BASE_CURRENCY_CODE) {
        const currency = await repos.currencies.findByCode({
          householdId,
          code: body.currency,
        });
        if (!currency) {
          throw createBadRequestError({
            userMessage: `Unknown currency "${body.currency}".`,
          });
        }
        rate = currency.rateToBdtMinor;
      }
      const amountMinor = convertToBdt(body.amount, rate);

      // Resolve category: existing id or inline-upsert by name.
      let categoryId: string;
      if (body.categoryId) {
        categoryId = body.categoryId;
      } else {
        const category = await repos.categories.upsertByName({
          householdId,
          name: body.categoryName!,
        });
        categoryId = category.id;
      }

      return repos.transactions.insertExpense({
        householdId,
        accountId: body.accountId,
        personId: body.personId,
        categoryId,
        createdByUserId: user.id,
        amountMinor,
        originalCurrencyCode: body.currency,
        originalAmountMinor: body.amount,
        exchangeRateToBdtMinor: rate,
        description: body.description ?? null,
        transactionDate: body.transactionDate,
      });
    });

    logger.info("transactions.expense_created", {
      transactionId: transaction.id,
      householdId,
      amountMinor: transaction.amountMinor,
      originalCurrencyCode: transaction.originalCurrencyCode,
      originalAmountMinor: transaction.originalAmountMinor,
    });

    return Response.json({ data: transaction }, { status: 201 });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}
