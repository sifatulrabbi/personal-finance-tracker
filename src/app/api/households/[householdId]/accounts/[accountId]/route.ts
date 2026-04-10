import type { NextRequest } from "next/server";

import { requireHouseholdAccess } from "@/libs/server/api/access";
import {
  ApiError,
  createApiErrorResponse,
  createDomainConflictError,
} from "@/libs/server/api/errors";
import { mockAccounts, mockTransactions } from "@/libs/server/api/mock-data";
import { updateAccountSchema } from "@/libs/server/api/schemas";
import {
  parseIdParam,
  parseJsonRequestBody,
} from "@/libs/server/api/validation";
import { requireSessionUser } from "@/libs/server/auth";
import { logger } from "@/libs/server/logger";
import { getUtcTimestamp } from "@/libs/server/time";

type RouteParams = {
  params: Promise<{ householdId: string; accountId: string }>;
};

function findAccount(accountId: string, householdId: string) {
  const account = mockAccounts.find(
    (a) => a.id === accountId && a.householdId === householdId,
  );

  if (!account) {
    throw new ApiError({
      statusCode: 404,
      code: "not_found",
      userMessage: "Account not found.",
    });
  }

  return account;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const resolved = await params;
    const householdId = await requireHouseholdAccess(
      Promise.resolve({ householdId: resolved.householdId }),
      user,
    );
    const accountId = parseIdParam(resolved.accountId, "accountId");

    const account = findAccount(accountId, householdId);

    return Response.json({ data: account });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const resolved = await params;
    const householdId = await requireHouseholdAccess(
      Promise.resolve({ householdId: resolved.householdId }),
      user,
    );
    const accountId = parseIdParam(resolved.accountId, "accountId");

    const account = findAccount(accountId, householdId);
    const body = await parseJsonRequestBody(request, updateAccountSchema);

    const updated = {
      ...account,
      name: body.name ?? account.name,
      description: body.description ?? account.description,
      updatedAt: getUtcTimestamp(),
    };

    logger.info("accounts.updated", { accountId, householdId });

    return Response.json({ data: updated });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const resolved = await params;
    const householdId = await requireHouseholdAccess(
      Promise.resolve({ householdId: resolved.householdId }),
      user,
    );
    const accountId = parseIdParam(resolved.accountId, "accountId");

    findAccount(accountId, householdId);

    const hasTransactions = mockTransactions.some(
      (t) => t.accountId === accountId,
    );

    if (hasTransactions) {
      throw createDomainConflictError({
        userMessage: "Cannot delete an account that has transactions.",
        developerMessage: `Account ${accountId} has existing transactions.`,
      });
    }

    logger.info("accounts.deleted", { accountId, householdId });

    return new Response(null, { status: 204 });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}
