import type { NextRequest } from "next/server";

import {
  convertToBdt,
  BASE_CURRENCY_CODE,
  BASE_CURRENCY_RATE,
} from "@/libs/currency";
import { requireHouseholdAccess } from "@/libs/server/api/access";
import { ApiError, createApiErrorResponse } from "@/libs/server/api/errors";
import {
  mockAccounts,
  mockCategories,
  mockCurrencies,
  mockOrigins,
  mockPeople,
  mockTransactions,
} from "@/libs/server/api/mock-data";
import { updateTransactionSchema } from "@/libs/server/api/schemas";
import {
  parseIdParam,
  parseJsonRequestBody,
} from "@/libs/server/api/validation";
import { requireSessionUser } from "@/libs/server/auth";
import { createId } from "@/libs/id";
import { logger } from "@/libs/server/logger";
import { getUtcTimestamp } from "@/libs/server/time";

type RouteParams = {
  params: Promise<{ householdId: string; transactionId: string }>;
};

function findTransaction(householdId: string, transactionId: string) {
  const idx = mockTransactions.findIndex(
    (t) => t.id === transactionId && t.householdId === householdId,
  );
  if (idx === -1) return { idx: -1, transaction: null };
  return { idx, transaction: mockTransactions[idx]! };
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

    const { transaction } = findTransaction(householdId, transactionId);

    if (!transaction) {
      throw new ApiError({
        statusCode: 404,
        code: "not_found",
        userMessage: "Transaction not found.",
      });
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

    const { idx, transaction } = findTransaction(householdId, transactionId);

    if (!transaction) {
      throw new ApiError({
        statusCode: 404,
        code: "not_found",
        userMessage: "Transaction not found.",
      });
    }

    if (transaction.transferGroupId !== null) {
      throw new ApiError({
        statusCode: 400,
        code: "bad_request",
        userMessage:
          "Cannot edit transfer transactions. Delete and recreate instead.",
      });
    }

    const body = await parseJsonRequestBody(request, updateTransactionSchema);

    if (
      transaction.type === "expense" &&
      (body.originId !== undefined || body.originName !== undefined)
    ) {
      throw new ApiError({
        statusCode: 400,
        code: "bad_request",
        userMessage: "Expenses cannot have an origin.",
      });
    }

    // Resolve money fields — only recalculate when amount or currency is provided
    let moneyFields = {};
    if (body.amount !== undefined || body.currency !== undefined) {
      const currencyCode = body.currency ?? transaction.originalCurrencyCode;
      const amountMinorOriginal =
        body.amount ?? transaction.originalAmountMinor;
      let rateToBdtMinor = BASE_CURRENCY_RATE;

      if (currencyCode !== BASE_CURRENCY_CODE) {
        const currency = mockCurrencies.find(
          (c) => c.householdId === householdId && c.code === currencyCode,
        );
        if (!currency) {
          throw new ApiError({
            statusCode: 400,
            code: "bad_request",
            userMessage: `Unknown currency "${currencyCode}".`,
          });
        }
        rateToBdtMinor = currency.rateToBdtMinor;
      }

      moneyFields = {
        amountMinor: convertToBdt(amountMinorOriginal, rateToBdtMinor),
        originalAmountMinor: amountMinorOriginal,
        originalCurrencyCode: currencyCode,
        exchangeRateToBdtMinor: rateToBdtMinor,
      };
    }

    // Resolve category
    let categoryFields = {};
    if (body.categoryId !== undefined) {
      const cat = mockCategories.find((c) => c.id === body.categoryId);
      categoryFields = {
        categoryId: body.categoryId,
        category: { id: body.categoryId, name: cat?.name ?? "Unknown" },
      };
    } else if (body.categoryName !== undefined) {
      const newId = createId();
      categoryFields = {
        categoryId: newId,
        category: { id: newId, name: body.categoryName },
      };
    }

    // Resolve origin (income only)
    let originFields = {};
    if (body.originId !== undefined) {
      const org = mockOrigins.find((o) => o.id === body.originId);
      originFields = {
        originId: body.originId,
        origin: { id: body.originId, name: org?.name ?? "Unknown" },
      };
    } else if (body.originName !== undefined) {
      const newId = createId();
      originFields = {
        originId: newId,
        origin: { id: newId, name: body.originName },
      };
    }

    // Resolve account name if accountId changed
    let accountFields = {};
    if (body.accountId !== undefined) {
      const account = mockAccounts.find((a) => a.id === body.accountId);
      accountFields = {
        accountId: body.accountId,
        account: { id: body.accountId, name: account?.name ?? "Unknown" },
      };
    }

    // Resolve person name if personId changed
    let personFields = {};
    if (body.personId !== undefined) {
      const person = mockPeople.find((p) => p.id === body.personId);
      personFields = {
        personId: body.personId,
        person: { id: body.personId, name: person?.name ?? "Unknown" },
      };
    }

    const now = getUtcTimestamp();
    const updated = {
      ...transaction,
      ...accountFields,
      ...personFields,
      description:
        body.description !== undefined
          ? body.description || null
          : transaction.description,
      transactionDate: body.transactionDate ?? transaction.transactionDate,
      ...moneyFields,
      ...categoryFields,
      ...originFields,
      updatedAt: now,
    };

    // Mutate mock data so GET list reflects the change
    mockTransactions.splice(idx, 1, updated);

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

    const { transaction } = findTransaction(householdId, transactionId);

    if (!transaction) {
      throw new ApiError({
        statusCode: 404,
        code: "not_found",
        userMessage: "Transaction not found.",
      });
    }

    // Remove from mock data — for transfers, remove both sides
    if (transaction.transferGroupId) {
      const groupId = transaction.transferGroupId;
      for (let i = mockTransactions.length - 1; i >= 0; i--) {
        if (mockTransactions[i]!.transferGroupId === groupId) {
          mockTransactions.splice(i, 1);
        }
      }
    } else {
      const idx = mockTransactions.findIndex((t) => t.id === transactionId);
      if (idx !== -1) mockTransactions.splice(idx, 1);
    }

    logger.info("transactions.deleted", { transactionId, householdId });

    return new Response(null, { status: 204 });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}
