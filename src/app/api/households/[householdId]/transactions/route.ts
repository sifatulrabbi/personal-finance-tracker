import type { NextRequest } from "next/server";

import { requireHouseholdAccess } from "@/libs/server/api/access";
import { createApiErrorResponse } from "@/libs/server/api/errors";
import { requireSessionUser } from "@/libs/server/auth";
import { getDb } from "@/libs/server/db/client";
import { createRepositories } from "@/libs/server/db/repository";
import type { TransactionFilters } from "@/libs/server/db/repository";
import { logger } from "@/libs/server/logger";

type RouteParams = { params: Promise<{ householdId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const householdId = await requireHouseholdAccess(params, user);

    const url = new URL(request.url);
    const personId = url.searchParams.get("personId");
    const categoryId = url.searchParams.get("categoryId");
    const accountId = url.searchParams.get("accountId");
    const typeParam = url.searchParams.get("type");
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
    const pageSize = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("pageSize") ?? "20")),
    );

    const filters: TransactionFilters = {
      personId: personId || undefined,
      categoryId: categoryId || undefined,
      accountId: accountId || undefined,
      // "transfer" is handled client-side (by transferGroupId) — only
      // "expense" or "income" map onto the ledger type column.
      type:
        typeParam === "income" || typeParam === "expense"
          ? typeParam
          : undefined,
    };

    const repos = createRepositories({ db: getDb() });
    const { data, total } = await repos.transactions.listByHousehold({
      householdId,
      filters,
      page,
      pageSize,
    });

    return Response.json({
      data,
      meta: { total, page, pageSize },
    });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}
