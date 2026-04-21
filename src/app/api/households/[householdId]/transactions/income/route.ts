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
import { createIncomeSchema } from "@/libs/server/api/schemas";
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

    const body = await parseJsonRequestBody(request, createIncomeSchema);

    const db = getDb();

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

      let originId: string;
      if (body.originId) {
        originId = body.originId;
      } else {
        const origin = await repos.origins.upsertByName({
          householdId,
          name: body.originName!,
        });
        originId = origin.id;
      }

      return repos.transactions.insertIncome({
        householdId,
        accountId: body.accountId,
        personId: body.personId,
        categoryId,
        originId,
        createdByUserId: user.id,
        amountMinor,
        originalCurrencyCode: body.currency,
        originalAmountMinor: body.amount,
        exchangeRateToBdtMinor: rate,
        description: body.description ?? null,
        transactionDate: body.transactionDate,
      });
    });

    logger.info("transactions.income_created", {
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
