import type { NextRequest } from "next/server";

import { requireHouseholdAccess } from "@/libs/server/api/access";
import {
  ApiError,
  createApiErrorResponse,
  createDomainConflictError,
} from "@/libs/server/api/errors";
import { mockPeople } from "@/libs/server/api/mock-data";
import { parseIdParam } from "@/libs/server/api/validation";
import { requireSessionUser } from "@/libs/server/auth";
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

    const person = mockPeople.find(
      (p) => p.id === personId && p.householdId === householdId,
    );

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

    logger.info("people.deleted", { personId, householdId });

    return new Response(null, { status: 204 });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}
