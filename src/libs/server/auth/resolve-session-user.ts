import { withAuth } from "@workos-inc/authkit-nextjs";

import { getDb } from "@/libs/server/db/client";
import { createUsersRepository } from "@/libs/server/db/repository";
import { logger } from "@/libs/server/logger";

export type SessionUser = Readonly<{
  id: string;
  householdId: string;
  email: string;
  name: string | null;
  workosUserId: string;
}>;

export type ResolveSessionUserResult =
  | { authenticated: true; user: SessionUser }
  | { authenticated: false; error: "no_session" | "not_invited" };

function buildDisplayName(
  firstName: string | null,
  lastName: string | null,
): string | null {
  const name = [firstName, lastName].filter(Boolean).join(" ");

  return name || null;
}

/**
 * Resolves the authenticated WorkOS user into a local SessionUser backed by
 * the `users` table. A drafted invitation row is activated on its first
 * successful sign-in: `workos_user_id` is stamped, `name` is set from WorkOS,
 * and `is_drafted` is flipped to false. Users with no matching row are
 * rejected with `not_invited` to enforce the invitation-only policy.
 */
export async function resolveSessionUser(): Promise<ResolveSessionUserResult> {
  const { user: workosUser } = await withAuth();

  if (!workosUser) {
    return { authenticated: false, error: "no_session" };
  }

  const usersRepository = createUsersRepository({ db: getDb() });
  const userRow = await usersRepository.findByEmail(workosUser.email);

  if (!userRow) {
    logger.auth("rejected_not_invited", { email: workosUser.email });
    return { authenticated: false, error: "not_invited" };
  }

  if (userRow.isDrafted) {
    const displayName = buildDisplayName(
      workosUser.firstName,
      workosUser.lastName,
    );

    await usersRepository.activateDrafted({
      id: userRow.id,
      workosUserId: workosUser.id,
      name: displayName,
    });

    logger.auth("user_activated", {
      userId: userRow.id,
      email: workosUser.email,
      workosUserId: workosUser.id,
    });

    return {
      authenticated: true,
      user: {
        id: userRow.id,
        householdId: userRow.householdId,
        email: workosUser.email,
        name: displayName,
        workosUserId: workosUser.id,
      },
    };
  }

  return {
    authenticated: true,
    user: {
      id: userRow.id,
      householdId: userRow.householdId,
      email: userRow.email,
      name: userRow.name,
      // A non-drafted row always has workos_user_id set (activation writes it).
      workosUserId: userRow.workosUserId!,
    },
  };
}
