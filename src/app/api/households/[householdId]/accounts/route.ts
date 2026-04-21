import type { NextRequest } from "next/server";

import { requireHouseholdAccess } from "@/libs/server/api/access";
import { createApiErrorResponse } from "@/libs/server/api/errors";
import { createAccountSchema } from "@/libs/server/api/schemas";
import { parseJsonRequestBody } from "@/libs/server/api/validation";
import { requireSessionUser } from "@/libs/server/auth";
import { getDb } from "@/libs/server/db/client";
import { createRepositories } from "@/libs/server/db/repository";
import { logger } from "@/libs/server/logger";

type RouteParams = { params: Promise<{ householdId: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const householdId = await requireHouseholdAccess(params, user);

    const repos = createRepositories({ db: getDb() });
    const accounts = await repos.accounts.listByHousehold(householdId);

    return Response.json({ data: accounts });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const householdId = await requireHouseholdAccess(params, user);

    const body = await parseJsonRequestBody(request, createAccountSchema);

    const repos = createRepositories({ db: getDb() });
    const account = await repos.accounts.insert({
      householdId,
      name: body.name,
      description: body.description ?? null,
      initialBalanceMinor: body.initialBalance,
    });

    logger.info("accounts.created", { accountId: account.id, householdId });

    return Response.json({ data: account }, { status: 201 });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}
