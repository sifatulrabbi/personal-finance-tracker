import type { NextRequest } from "next/server";

import { requireHouseholdAccess } from "@/libs/server/api/access";
import { ApiError, createApiErrorResponse } from "@/libs/server/api/errors";
import { mockCurrencies } from "@/libs/server/api/mock-data";
import { createCurrencySchema } from "@/libs/server/api/schemas";
import { parseJsonRequestBody } from "@/libs/server/api/validation";
import { requireSessionUser } from "@/libs/server/auth";
import { createId } from "@/libs/id";
import { logger } from "@/libs/server/logger";
import { getUtcTimestamp } from "@/libs/server/time";

type RouteParams = { params: Promise<{ householdId: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const householdId = await requireHouseholdAccess(params, user);

    const currencies = mockCurrencies
      .filter((c) => c.householdId === householdId)
      .sort((a, b) => {
        if (a.isBase) return -1;
        if (b.isBase) return 1;
        return a.code.localeCompare(b.code);
      });

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

    const exists = mockCurrencies.some(
      (c) => c.householdId === householdId && c.code === body.code,
    );

    if (exists) {
      throw new ApiError({
        statusCode: 400,
        code: "bad_request",
        userMessage: `Currency "${body.code}" already exists.`,
      });
    }

    const now = getUtcTimestamp();
    const currency = {
      id: createId(),
      householdId,
      code: body.code,
      symbol: body.symbol,
      name: body.name,
      rateToBdtMinor: body.rateToBdt,
      isBase: false,
      createdAt: now,
      updatedAt: now,
    };

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
