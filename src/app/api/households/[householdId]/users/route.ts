import type { NextRequest } from "next/server";

import { requireHouseholdAccess } from "@/libs/server/api/access";
import { createApiErrorResponse } from "@/libs/server/api/errors";
import { inviteUserSchema } from "@/libs/server/api/schemas";
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
    const users = await repos.users.listByHousehold(householdId);

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

    const repos = createRepositories({ db: getDb() });
    const invited = await repos.users.insertInvite({
      householdId,
      email: body.email,
    });

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
