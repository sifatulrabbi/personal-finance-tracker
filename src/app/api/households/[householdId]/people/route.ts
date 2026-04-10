import type { NextRequest } from "next/server";

import { requireHouseholdAccess } from "@/libs/server/api/access";
import { createApiErrorResponse } from "@/libs/server/api/errors";
import { mockPeople } from "@/libs/server/api/mock-data";
import { createPersonSchema } from "@/libs/server/api/schemas";
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

    const people = mockPeople.filter((p) => p.householdId === householdId);

    return Response.json({ data: people });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const householdId = await requireHouseholdAccess(params, user);

    const body = await parseJsonRequestBody(request, createPersonSchema);

    const now = getUtcTimestamp();
    const person = {
      id: createId(),
      householdId,
      name: body.name,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };

    logger.info("people.created", { personId: person.id, householdId });

    return Response.json({ data: person }, { status: 201 });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}
