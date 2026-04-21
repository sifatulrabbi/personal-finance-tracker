import type { NextRequest } from "next/server";

import { requireHouseholdAccess } from "@/libs/server/api/access";
import {
  ApiError,
  createApiErrorResponse,
  createBadRequestError,
} from "@/libs/server/api/errors";
import { updateCurrencySchema } from "@/libs/server/api/schemas";
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
  params: Promise<{ householdId: string; currencyId: string }>;
};

function notFound(): never {
  throw new ApiError({
    statusCode: 404,
    code: "not_found",
    userMessage: "Currency not found.",
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
    const currencyId = parseIdParam(resolved.currencyId, "currencyId");

    const repos = createRepositories({ db: getDb() });
    const currency = await repos.currencies.findById({
      householdId,
      id: currencyId,
    });

    if (!currency) {
      notFound();
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

    const body = await parseJsonRequestBody(request, updateCurrencySchema);

    const repos = createRepositories({ db: getDb() });
    const current = await repos.currencies.findById({
      householdId,
      id: currencyId,
    });
    if (!current) {
      notFound();
    }
    if (current.isBase && body.rateToBdt !== undefined) {
      // BDT = base currency; its rate is always 100 and changing it would
      // silently rescale every BDT-stored balance.
      throw createBadRequestError({
        userMessage: "Cannot change the exchange rate of the base currency.",
      });
    }

    const updated = await repos.currencies.update({
      householdId,
      id: currencyId,
      patch: {
        symbol: body.symbol,
        name: body.name,
        rateToBdtMinor: body.rateToBdt,
      },
    });

    if (!updated) {
      notFound();
    }

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

    const repos = createRepositories({ db: getDb() });

    try {
      const removed = await repos.currencies.remove({
        householdId,
        id: currencyId,
      });
      if (!removed) {
        notFound();
      }
    } catch (error) {
      throw mapForeignKeyInUse({ error, label: "currency" });
    }

    logger.info("currencies.deleted", { currencyId, householdId });

    return new Response(null, { status: 204 });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}
