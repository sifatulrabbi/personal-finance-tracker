import type { NextRequest } from "next/server";

import { requireHouseholdAccess } from "@/libs/server/api/access";
import { createApiErrorResponse } from "@/libs/server/api/errors";
import { mockTransactions } from "@/libs/server/api/mock-data";
import { requireSessionUser } from "@/libs/server/auth";
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
    const type = url.searchParams.get("type");
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
    const pageSize = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("pageSize") ?? "20")),
    );

    let filtered = mockTransactions.filter(
      (t) => t.householdId === householdId,
    );

    if (personId) {
      filtered = filtered.filter((t) => t.personId === personId);
    }
    if (categoryId) {
      filtered = filtered.filter((t) => t.categoryId === categoryId);
    }
    if (accountId) {
      filtered = filtered.filter((t) => t.accountId === accountId);
    }
    if (type === "income" || type === "expense") {
      filtered = filtered.filter((t) => t.type === type);
    }

    // Sort reverse-chronological
    filtered.sort(
      (a, b) =>
        new Date(b.transactionDate).getTime() -
        new Date(a.transactionDate).getTime(),
    );

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const paginated = filtered.slice(start, start + pageSize);

    return Response.json({
      data: paginated,
      meta: { total, page, pageSize },
    });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}
