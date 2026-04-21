import type { NextRequest } from "next/server";

import { requireHouseholdAccess } from "@/libs/server/api/access";
import { createApiErrorResponse } from "@/libs/server/api/errors";
import { createOriginSchema } from "@/libs/server/api/schemas";
import { parseJsonRequestBody } from "@/libs/server/api/validation";
import { requireSessionUser } from "@/libs/server/auth";
import { getDb } from "@/libs/server/db/client";
import { createRepositories } from "@/libs/server/db/repository";
import { logger } from "@/libs/server/logger";

type RouteParams = { params: Promise<{ householdId: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const householdId = await requireHouseholdAccess(params, user);

    const repos = createRepositories({ db: getDb() });
    const origins = await repos.origins.listByHousehold(householdId);

    return Response.json({ data: origins });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const householdId = await requireHouseholdAccess(params, user);

    const body = await parseJsonRequestBody(request, createOriginSchema);

    const repos = createRepositories({ db: getDb() });
    const origin = await repos.origins.insert({
      householdId,
      name: body.name,
      description: body.description ?? null,
    });

    logger.info("origins.created", { originId: origin.id, householdId });

    return Response.json({ data: origin }, { status: 201 });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}
