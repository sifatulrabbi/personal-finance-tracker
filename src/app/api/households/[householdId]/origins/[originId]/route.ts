import type { NextRequest } from "next/server";

import { requireHouseholdAccess } from "@/libs/server/api/access";
import {
  ApiError,
  createApiErrorResponse,
  createDomainConflictError,
} from "@/libs/server/api/errors";
import { mockOrigins, mockTransactions } from "@/libs/server/api/mock-data";
import { parseIdParam } from "@/libs/server/api/validation";
import { requireSessionUser } from "@/libs/server/auth";
import { logger } from "@/libs/server/logger";

type RouteParams = {
  params: Promise<{ householdId: string; originId: string }>;
};

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const resolved = await params;
    const householdId = await requireHouseholdAccess(
      Promise.resolve({ householdId: resolved.householdId }),
      user,
    );
    const originId = parseIdParam(resolved.originId, "originId");

    const origin = mockOrigins.find(
      (o) => o.id === originId && o.householdId === householdId,
    );

    if (!origin) {
      throw new ApiError({
        statusCode: 404,
        code: "not_found",
        userMessage: "Origin not found.",
      });
    }

    const isUsed = mockTransactions.some((t) => t.originId === originId);

    if (isUsed) {
      throw createDomainConflictError({
        userMessage: "Cannot delete an origin that is used by transactions.",
        developerMessage: `Origin ${originId} is referenced by transactions.`,
      });
    }

    logger.info("origins.deleted", { originId, householdId });

    return new Response(null, { status: 204 });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}
