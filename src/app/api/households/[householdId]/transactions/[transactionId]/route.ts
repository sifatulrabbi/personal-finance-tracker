import type { NextRequest } from "next/server";

import {
  BASE_CURRENCY_CODE,
  BASE_CURRENCY_RATE,
  convertToBdt,
} from "@/libs/currency";
import { requireHouseholdAccess } from "@/libs/server/api/access";
import {
  ApiError,
  createApiErrorResponse,
  createBadRequestError,
} from "@/libs/server/api/errors";
import { updateTransactionSchema } from "@/libs/server/api/schemas";
import {
  parseIdParam,
  parseJsonRequestBody,
} from "@/libs/server/api/validation";
import { requireSessionUser } from "@/libs/server/auth";
import type { BunSqlDatabase } from "@/libs/server/db/client";
import { getDb } from "@/libs/server/db/client";
import { createRepositories } from "@/libs/server/db/repository";
import { logger } from "@/libs/server/logger";

type RouteParams = {
  params: Promise<{ householdId: string; transactionId: string }>;
};

function notFound(): never {
  throw new ApiError({
    statusCode: 404,
    code: "not_found",
    userMessage: "Transaction not found.",
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
    const transactionId = parseIdParam(resolved.transactionId, "transactionId");

    const repos = createRepositories({ db: getDb() });
    const transaction = await repos.transactions.findById({
      householdId,
      id: transactionId,
    });

    if (!transaction) {
      notFound();
    }

    return Response.json({ data: transaction });
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
    const transactionId = parseIdParam(resolved.transactionId, "transactionId");

    const body = await parseJsonRequestBody(request, updateTransactionSchema);

    const db = getDb();

    // All mutations (currency resolution, optional inline-create of
    // category/origin, the transaction UPDATE itself, and the
    // compensating account-balance adjustments) run inside one
    // db.begin so a partial failure rolls back cleanly.
    const updated = await db.begin(async (tx: BunSqlDatabase) => {
      const repos = createRepositories({ db: tx });
      const current = await repos.transactions.findById({
        householdId,
        id: transactionId,
      });
      if (!current) {
        notFound();
      }
      if (current.transferGroupId !== null) {
        throw createBadRequestError({
          userMessage:
            "Cannot edit transfer transactions. Delete and recreate instead.",
        });
      }
      if (
        current.type === "expense" &&
        (body.originId !== undefined || body.originName !== undefined)
      ) {
        throw createBadRequestError({
          userMessage: "Expenses cannot have an origin.",
        });
      }

      // Resolve category override (existing id or upsert inline by name).
      let categoryId: string | undefined;
      if (body.categoryId !== undefined) {
        categoryId = body.categoryId;
      } else if (body.categoryName !== undefined) {
        const category = await repos.categories.upsertByName({
          householdId,
          name: body.categoryName,
        });
        categoryId = category.id;
      }

      // Resolve origin override for income rows (same pattern).
      let originId: string | undefined;
      if (body.originId !== undefined) {
        originId = body.originId;
      } else if (body.originName !== undefined) {
        const origin = await repos.origins.upsertByName({
          householdId,
          name: body.originName,
        });
        originId = origin.id;
      }

      // Money changes: resolve the rate against the currencies table (or
      // BASE_CURRENCY_RATE for BDT) and recompute the BDT-denominated
      // amountMinor that drives the balance adjustment.
      let amountMinor: number | undefined;
      let originalAmountMinor: number | undefined;
      let originalCurrencyCode: string | undefined;
      let exchangeRateToBdtMinor: number | undefined;
      if (body.amount !== undefined || body.currency !== undefined) {
        const currencyCode = body.currency ?? current.originalCurrencyCode;
        const originalAmount = body.amount ?? current.originalAmountMinor;

        let rate = BASE_CURRENCY_RATE;
        if (currencyCode !== BASE_CURRENCY_CODE) {
          const currency = await repos.currencies.findByCode({
            householdId,
            code: currencyCode,
          });
          if (!currency) {
            throw createBadRequestError({
              userMessage: `Unknown currency "${currencyCode}".`,
            });
          }
          rate = currency.rateToBdtMinor;
        }

        originalCurrencyCode = currencyCode;
        originalAmountMinor = originalAmount;
        exchangeRateToBdtMinor = rate;
        amountMinor = convertToBdt(originalAmount, rate);
      }

      return repos.transactions.update({
        householdId,
        id: transactionId,
        patch: {
          accountId: body.accountId,
          personId: body.personId,
          categoryId,
          originId,
          amountMinor,
          originalAmountMinor,
          originalCurrencyCode,
          exchangeRateToBdtMinor,
          description: body.description,
          transactionDate: body.transactionDate,
        },
      });
    });

    logger.info("transactions.updated", {
      transactionId,
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
    const transactionId = parseIdParam(resolved.transactionId, "transactionId");

    const db = getDb();
    const deleted = await db.begin(async (tx: BunSqlDatabase) => {
      const repos = createRepositories({ db: tx });
      return repos.transactions.remove({ householdId, id: transactionId });
    });

    if (!deleted) {
      notFound();
    }

    logger.info("transactions.deleted", { transactionId, householdId });

    return new Response(null, { status: 204 });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}
