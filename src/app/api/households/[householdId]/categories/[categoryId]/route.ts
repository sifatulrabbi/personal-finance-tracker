import type { NextRequest } from "next/server";

import { requireHouseholdAccess } from "@/libs/server/api/access";
import {
  ApiError,
  createApiErrorResponse,
  createDomainConflictError,
} from "@/libs/server/api/errors";
import { mockCategories, mockTransactions } from "@/libs/server/api/mock-data";
import { parseIdParam } from "@/libs/server/api/validation";
import { requireSessionUser } from "@/libs/server/auth";
import { logger } from "@/libs/server/logger";

type RouteParams = {
  params: Promise<{ householdId: string; categoryId: string }>;
};

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const resolved = await params;
    const householdId = await requireHouseholdAccess(
      Promise.resolve({ householdId: resolved.householdId }),
      user,
    );
    const categoryId = parseIdParam(resolved.categoryId, "categoryId");

    const category = mockCategories.find(
      (c) => c.id === categoryId && c.householdId === householdId,
    );

    if (!category) {
      throw new ApiError({
        statusCode: 404,
        code: "not_found",
        userMessage: "Category not found.",
      });
    }

    const isUsed = mockTransactions.some((t) => t.categoryId === categoryId);

    if (isUsed) {
      throw createDomainConflictError({
        userMessage: "Cannot delete a category that is used by transactions.",
        developerMessage: `Category ${categoryId} is referenced by transactions.`,
      });
    }

    logger.info("categories.deleted", { categoryId, householdId });

    return new Response(null, { status: 204 });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}
