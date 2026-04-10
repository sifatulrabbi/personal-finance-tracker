import type { NextRequest } from "next/server";

import { requireHouseholdAccess } from "@/libs/server/api/access";
import { createApiErrorResponse } from "@/libs/server/api/errors";
import { mockOrigins } from "@/libs/server/api/mock-data";
import { createOriginSchema } from "@/libs/server/api/schemas";
import { parseJsonRequestBody } from "@/libs/server/api/validation";
import { requireSessionUser } from "@/libs/server/auth";
import { createId } from "@/libs/id";
import { logger } from "@/libs/server/logger";
import { getUtcTimestamp } from "@/libs/server/time";

type RouteParams = { params: Promise<{ householdId: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const householdId = await requireHouseholdAccess(params, user);

    const origins = mockOrigins.filter((o) => o.householdId === householdId);

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

    const now = getUtcTimestamp();
    const origin = {
      id: createId(),
      householdId,
      name: body.name,
      description: body.description ?? null,
      createdAt: now,
      updatedAt: now,
    };

    logger.info("origins.created", { originId: origin.id, householdId });

    return Response.json({ data: origin }, { status: 201 });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}
