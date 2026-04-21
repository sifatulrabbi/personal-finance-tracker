import type { NextRequest } from "next/server";

import { requireHouseholdAccess } from "@/libs/server/api/access";
import {
  ApiError,
  createApiErrorResponse,
  createDomainConflictError,
} from "@/libs/server/api/errors";
import { parseIdParam } from "@/libs/server/api/validation";
import { requireSessionUser } from "@/libs/server/auth";
import { getDb } from "@/libs/server/db/client";
import { createRepositories } from "@/libs/server/db/repository";
import { mapForeignKeyInUse } from "@/libs/server/db/repository/errors";
import { logger } from "@/libs/server/logger";

type RouteParams = {
  params: Promise<{ householdId: string; personId: string }>;
};

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const resolved = await params;
    const householdId = await requireHouseholdAccess(
      Promise.resolve({ householdId: resolved.householdId }),
      user,
    );
    const personId = parseIdParam(resolved.personId, "personId");

    const repos = createRepositories({ db: getDb() });

    // Look up first so we can distinguish "not found" (404) from
    // "default person can't be deleted" (409) and from "in use" (409 via FK).
    const person = await repos.people.findById({ householdId, id: personId });
    if (!person) {
      throw new ApiError({
        statusCode: 404,
        code: "not_found",
        userMessage: "Person not found.",
      });
    }
    if (person.isDefault) {
      throw createDomainConflictError({
        userMessage: "The default Household person cannot be deleted.",
        developerMessage: `Attempted to delete default person ${personId}.`,
      });
    }

    try {
      await repos.people.remove({ householdId, id: personId });
    } catch (error) {
      throw mapForeignKeyInUse({ error, label: "person" });
    }

    logger.info("people.deleted", { personId, householdId });

    return new Response(null, { status: 204 });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}
