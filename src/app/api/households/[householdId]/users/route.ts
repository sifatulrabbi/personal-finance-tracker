import type { NextRequest } from "next/server";

import { requireHouseholdAccess } from "@/libs/server/api/access";
import { createApiErrorResponse } from "@/libs/server/api/errors";
import { mockUsers } from "@/libs/server/api/mock-data";
import { inviteUserSchema } from "@/libs/server/api/schemas";
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

    const users = mockUsers.filter((u) => u.householdId === householdId);

    return Response.json({ data: users });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const householdId = await requireHouseholdAccess(params, user);

    const body = await parseJsonRequestBody(request, inviteUserSchema);

    const now = getUtcTimestamp();
    const invited = {
      id: createId(),
      householdId,
      email: body.email,
      name: null,
      isDrafted: true,
      createdAt: now,
      updatedAt: now,
    };

    logger.info("users.invited", {
      userId: invited.id,
      email: invited.email,
      householdId,
    });

    return Response.json({ data: invited }, { status: 201 });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}
