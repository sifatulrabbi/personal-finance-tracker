import type { NextRequest } from "next/server";

import { requireHouseholdAccess } from "@/libs/server/api/access";
import { createApiErrorResponse } from "@/libs/server/api/errors";
import { mockAccounts, mockCategories } from "@/libs/server/api/mock-data";
import { createExpenseSchema } from "@/libs/server/api/schemas";
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

    const body = await parseJsonRequestBody(request, createExpenseSchema);

    // Resolve category (mock: use existing or create inline)
    const category = body.categoryId
      ? mockCategories.find((c) => c.id === body.categoryId)
      : { id: createId(), name: body.categoryName! };

    const account = mockAccounts.find((a) => a.id === body.accountId);

    const now = getUtcTimestamp();
    const transaction = {
      id: createId(),
      householdId,
      accountId: body.accountId,
      personId: body.personId,
      categoryId: category?.id ?? null,
      originId: null,
      createdByUserId: user.id,
      type: "expense" as const,
      amountMinor: body.amount,
      description: body.description ?? null,
      transactionDate: body.transactionDate,
      transferGroupId: null,
      createdAt: now,
      updatedAt: now,
      account: { id: body.accountId, name: account?.name ?? "Unknown" },
      person: { id: body.personId, name: "Mock Person" },
      category: category ? { id: category.id, name: category.name } : null,
      origin: null,
    };

    logger.info("transactions.expense_created", {
      transactionId: transaction.id,
      householdId,
      amountMinor: body.amount,
    });

    return Response.json({ data: transaction }, { status: 201 });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}
