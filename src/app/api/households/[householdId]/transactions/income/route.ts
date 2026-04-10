import type { NextRequest } from "next/server";

import { convertToBdt, BASE_CURRENCY_CODE, BASE_CURRENCY_RATE } from "@/libs/currency";
import { requireHouseholdAccess } from "@/libs/server/api/access";
import { ApiError, createApiErrorResponse } from "@/libs/server/api/errors";
import {
  mockAccounts,
  mockCategories,
  mockCurrencies,
  mockOrigins,
} from "@/libs/server/api/mock-data";
import { createIncomeSchema } from "@/libs/server/api/schemas";
import { parseJsonRequestBody } from "@/libs/server/api/validation";
import { requireSessionUser } from "@/libs/server/auth";
import { createId } from "@/libs/id";
import { logger } from "@/libs/server/logger";
import { getUtcTimestamp } from "@/libs/server/time";

type RouteParams = { params: Promise<{ householdId: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const householdId = await requireHouseholdAccess(params, user);

    const body = await parseJsonRequestBody(request, createIncomeSchema);

    // Resolve currency and compute BDT amount
    let bdtAmountMinor = body.amount;
    let rateToBdtMinor = BASE_CURRENCY_RATE;

    if (body.currency !== BASE_CURRENCY_CODE) {
      const currency = mockCurrencies.find(
        (c) => c.householdId === householdId && c.code === body.currency,
      );
      if (!currency) {
        throw new ApiError({
          statusCode: 400,
          code: "bad_request",
          userMessage: `Unknown currency "${body.currency}".`,
        });
      }
      rateToBdtMinor = currency.rateToBdtMinor;
      bdtAmountMinor = convertToBdt(body.amount, rateToBdtMinor);
    }

    // Resolve category (mock: use existing or create inline)
    const category = body.categoryId
      ? mockCategories.find((c) => c.id === body.categoryId)
      : { id: createId(), name: body.categoryName! };

    // Resolve origin (mock: use existing or create inline)
    const origin = body.originId
      ? mockOrigins.find((o) => o.id === body.originId)
      : { id: createId(), name: body.originName! };

    const account = mockAccounts.find((a) => a.id === body.accountId);

    const now = getUtcTimestamp();
    const transaction = {
      id: createId(),
      householdId,
      accountId: body.accountId,
      personId: body.personId,
      categoryId: category?.id ?? null,
      originId: origin?.id ?? null,
      createdByUserId: user.id,
      type: "income" as const,
      amountMinor: bdtAmountMinor,
      originalCurrencyCode: body.currency,
      originalAmountMinor: body.amount,
      exchangeRateToBdtMinor: rateToBdtMinor,
      description: body.description ?? null,
      transactionDate: body.transactionDate,
      transferGroupId: null,
      createdAt: now,
      updatedAt: now,
      account: { id: body.accountId, name: account?.name ?? "Unknown" },
      person: { id: body.personId, name: "Mock Person" },
      category: category ? { id: category.id, name: category.name } : null,
      origin: origin ? { id: origin.id, name: origin.name } : null,
    };

    logger.info("transactions.income_created", {
      transactionId: transaction.id,
      householdId,
      amountMinor: bdtAmountMinor,
      originalCurrencyCode: body.currency,
      originalAmountMinor: body.amount,
    });

    return Response.json({ data: transaction }, { status: 201 });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}
