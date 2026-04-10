import type { NextRequest } from "next/server";

import { requireHouseholdAccess } from "@/libs/server/api/access";
import { createApiErrorResponse } from "@/libs/server/api/errors";
import { mockAccounts } from "@/libs/server/api/mock-data";
import { createTransferSchema } from "@/libs/server/api/schemas";
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

    const body = await parseJsonRequestBody(request, createTransferSchema);

    const sourceAccount = mockAccounts.find(
      (a) => a.id === body.sourceAccountId,
    );
    const destAccount = mockAccounts.find(
      (a) => a.id === body.destinationAccountId,
    );

    const now = getUtcTimestamp();
    const transferGroupId = createId();

    const expense = {
      id: createId(),
      householdId,
      accountId: body.sourceAccountId,
      personId: body.personId,
      categoryId: null,
      originId: null,
      createdByUserId: user.id,
      type: "expense" as const,
      amountMinor: body.amount,
      originalCurrencyCode: "BDT",
      originalAmountMinor: body.amount,
      exchangeRateToBdtMinor: 100,
      description: body.description ?? null,
      transactionDate: body.transactionDate,
      transferGroupId,
      createdAt: now,
      updatedAt: now,
      account: {
        id: body.sourceAccountId,
        name: sourceAccount?.name ?? "Unknown",
      },
      person: { id: body.personId, name: "Mock Person" },
      category: null,
      origin: null,
    };

    const income = {
      id: createId(),
      householdId,
      accountId: body.destinationAccountId,
      personId: body.personId,
      categoryId: null,
      originId: null,
      createdByUserId: user.id,
      type: "income" as const,
      amountMinor: body.amount,
      originalCurrencyCode: "BDT",
      originalAmountMinor: body.amount,
      exchangeRateToBdtMinor: 100,
      description: body.description ?? null,
      transactionDate: body.transactionDate,
      transferGroupId,
      createdAt: now,
      updatedAt: now,
      account: {
        id: body.destinationAccountId,
        name: destAccount?.name ?? "Unknown",
      },
      person: { id: body.personId, name: "Mock Person" },
      category: null,
      origin: null,
    };

    logger.transfer("transfer_created", {
      transferGroupId,
      householdId,
      sourceAccountId: body.sourceAccountId,
      destinationAccountId: body.destinationAccountId,
      amountMinor: body.amount,
    });

    return Response.json(
      { data: { transferGroupId, expense, income } },
      { status: 201 },
    );
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}
