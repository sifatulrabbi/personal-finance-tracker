import type { NextRequest } from "next/server";

import { requireHouseholdAccess } from "@/libs/server/api/access";
import { ApiError, createApiErrorResponse } from "@/libs/server/api/errors";
import { parseIdParam } from "@/libs/server/api/validation";
import { requireSessionUser } from "@/libs/server/auth";
import { getDb } from "@/libs/server/db/client";
import { createRepositories } from "@/libs/server/db/repository";
import { mapForeignKeyInUse } from "@/libs/server/db/repository/errors";
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

    const repos = createRepositories({ db: getDb() });

    try {
      const removed = await repos.origins.remove({ householdId, id: originId });
      if (!removed) {
        throw new ApiError({
          statusCode: 404,
          code: "not_found",
          userMessage: "Origin not found.",
        });
      }
    } catch (error) {
      throw mapForeignKeyInUse({ error, label: "origin" });
    }

    logger.info("origins.deleted", { originId, householdId });

    return new Response(null, { status: 204 });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}
