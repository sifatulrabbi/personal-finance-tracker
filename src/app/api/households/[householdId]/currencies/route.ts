import type { NextRequest } from "next/server";

import { requireHouseholdAccess } from "@/libs/server/api/access";
import { createApiErrorResponse } from "@/libs/server/api/errors";
import { createCurrencySchema } from "@/libs/server/api/schemas";
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
    const currencies = await repos.currencies.listByHousehold(householdId);

    return Response.json({ data: currencies });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const householdId = await requireHouseholdAccess(params, user);

    const body = await parseJsonRequestBody(request, createCurrencySchema);

    const repos = createRepositories({ db: getDb() });
    const currency = await repos.currencies.insert({
      householdId,
      code: body.code,
      symbol: body.symbol,
      name: body.name,
      rateToBdtMinor: body.rateToBdt,
      isBase: false,
    });

    logger.info("currencies.created", {
      currencyId: currency.id,
      householdId,
      code: body.code,
    });

    return Response.json({ data: currency }, { status: 201 });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}
