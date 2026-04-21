import type { NextRequest } from "next/server";

import { requireHouseholdAccess } from "@/libs/server/api/access";
import { createApiErrorResponse } from "@/libs/server/api/errors";
import { createTransferSchema } from "@/libs/server/api/schemas";
import { parseJsonRequestBody } from "@/libs/server/api/validation";
import { requireSessionUser } from "@/libs/server/auth";
import type { BunSqlDatabase } from "@/libs/server/db/client";
import { getDb } from "@/libs/server/db/client";
import { createRepositories } from "@/libs/server/db/repository";
import { logger } from "@/libs/server/logger";

type RouteParams = { params: Promise<{ householdId: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const householdId = await requireHouseholdAccess(params, user);

    const body = await parseJsonRequestBody(request, createTransferSchema);

    const db = getDb();

    // Both ledger rows (expense + income legs) and both balance moves land
    // in the same transaction so a transfer never half-applies.
    const result = await db.begin(async (tx: BunSqlDatabase) => {
      const repos = createRepositories({ db: tx });
      return repos.transactions.insertTransfer({
        householdId,
        sourceAccountId: body.sourceAccountId,
        destinationAccountId: body.destinationAccountId,
        personId: body.personId,
        createdByUserId: user.id,
        amountMinor: body.amount,
        description: body.description ?? null,
        transactionDate: body.transactionDate,
      });
    });

    logger.transfer("transfer_created", {
      transferGroupId: result.transferGroupId,
      householdId,
      sourceAccountId: body.sourceAccountId,
      destinationAccountId: body.destinationAccountId,
      amountMinor: body.amount,
    });

    return Response.json(
      {
        data: {
          transferGroupId: result.transferGroupId,
          expense: result.expense,
          income: result.income,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}
