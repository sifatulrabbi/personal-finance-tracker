import { ApiError } from "@/libs/server/api/errors";
import { parseIdParam } from "@/libs/server/api/validation";
import type { SessionUser } from "@/libs/server/auth";

/**
 * Validates the householdId route parameter and ensures the authenticated user
 * belongs to that household. Returns the validated householdId on success.
 */
export async function requireHouseholdAccess(
  params: Promise<{ householdId: string }>,
  user: SessionUser,
): Promise<string> {
  const { householdId: rawHouseholdId } = await params;
  const householdId = parseIdParam(rawHouseholdId, "householdId");

  if (householdId !== user.householdId) {
    throw new ApiError({
      statusCode: 403,
      code: "forbidden",
      userMessage: "You do not have access to this household.",
    });
  }

  return householdId;
}
