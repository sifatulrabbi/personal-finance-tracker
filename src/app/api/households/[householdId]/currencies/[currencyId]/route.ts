import type { NextRequest } from "next/server";

import { requireHouseholdAccess } from "@/libs/server/api/access";
import {
  ApiError,
  createApiErrorResponse,
} from "@/libs/server/api/errors";
import { mockCurrencies } from "@/libs/server/api/mock-data";
import { updateCurrencySchema } from "@/libs/server/api/schemas";
import {
  parseIdParam,
  parseJsonRequestBody,
} from "@/libs/server/api/validation";
import { requireSessionUser } from "@/libs/server/auth";
import { logger } from "@/libs/server/logger";
import { getUtcTimestamp } from "@/libs/server/time";

type RouteParams = {
  params: Promise<{ householdId: string; currencyId: string }>;
};

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const resolved = await params;
    const householdId = await requireHouseholdAccess(
      Promise.resolve({ householdId: resolved.householdId }),
      user,
    );
    const currencyId = parseIdParam(resolved.currencyId, "currencyId");

    const currency = mockCurrencies.find(
      (c) => c.id === currencyId && c.householdId === householdId,
    );

    if (!currency) {
      throw new ApiError({
        statusCode: 404,
        code: "not_found",
        userMessage: "Currency not found.",
      });
    }

    return Response.json({ data: currency });
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
    const currencyId = parseIdParam(resolved.currencyId, "currencyId");

    const currency = mockCurrencies.find(
      (c) => c.id === currencyId && c.householdId === householdId,
    );

    if (!currency) {
      throw new ApiError({
        statusCode: 404,
        code: "not_found",
        userMessage: "Currency not found.",
      });
    }

    const body = await parseJsonRequestBody(request, updateCurrencySchema);

    if (currency.isBase && body.rateToBdt !== undefined) {
      throw new ApiError({
        statusCode: 400,
        code: "bad_request",
        userMessage: "Cannot change the exchange rate of the base currency.",
      });
    }

    const now = getUtcTimestamp();
    const updated = {
      ...currency,
      symbol: body.symbol ?? currency.symbol,
      name: body.name ?? currency.name,
      rateToBdtMinor: body.rateToBdt ?? currency.rateToBdtMinor,
      updatedAt: now,
    };

    logger.info("currencies.updated", {
      currencyId,
      householdId,
    });

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
    const currencyId = parseIdParam(resolved.currencyId, "currencyId");

    const currency = mockCurrencies.find(
      (c) => c.id === currencyId && c.householdId === householdId,
    );

    if (!currency) {
      throw new ApiError({
        statusCode: 404,
        code: "not_found",
        userMessage: "Currency not found.",
      });
    }

    if (currency.isBase) {
      throw new ApiError({
        statusCode: 400,
        code: "bad_request",
        userMessage: "Cannot delete the base currency.",
      });
    }

    logger.info("currencies.deleted", { currencyId, householdId });

    return new Response(null, { status: 204 });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}
