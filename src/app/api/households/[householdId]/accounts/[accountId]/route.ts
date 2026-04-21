import type { NextRequest } from "next/server";

import { requireHouseholdAccess } from "@/libs/server/api/access";
import { ApiError, createApiErrorResponse } from "@/libs/server/api/errors";
import { updateAccountSchema } from "@/libs/server/api/schemas";
import {
  parseIdParam,
  parseJsonRequestBody,
} from "@/libs/server/api/validation";
import { requireSessionUser } from "@/libs/server/auth";
import { getDb } from "@/libs/server/db/client";
import { createRepositories } from "@/libs/server/db/repository";
import { mapForeignKeyInUse } from "@/libs/server/db/repository/errors";
import { logger } from "@/libs/server/logger";

type RouteParams = {
  params: Promise<{ householdId: string; accountId: string }>;
};

function notFound(): never {
  throw new ApiError({
    statusCode: 404,
    code: "not_found",
    userMessage: "Account not found.",
  });
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

    const repos = createRepositories({ db: getDb() });
    const account = await repos.accounts.findById({
      householdId,
      id: accountId,
    });

    if (!account) {
      notFound();
    }

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

    const body = await parseJsonRequestBody(request, updateAccountSchema);

    const repos = createRepositories({ db: getDb() });
    const updated = await repos.accounts.update({
      householdId,
      id: accountId,
      patch: {
        name: body.name,
        description: body.description,
      },
    });

    if (!updated) {
      notFound();
    }

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

    const repos = createRepositories({ db: getDb() });

    try {
      const removed = await repos.accounts.remove({
        householdId,
        id: accountId,
      });
      if (!removed) {
        notFound();
      }
    } catch (error) {
      // The FK from transactions.account_id → accounts.id is ON DELETE
      // RESTRICT, so deleting an account that still has transactions raises
      // a 23503 which we surface as a 409 "in use" conflict.
      throw mapForeignKeyInUse({ error, label: "account" });
    }

    logger.info("accounts.deleted", { accountId, householdId });

    return new Response(null, { status: 204 });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}
