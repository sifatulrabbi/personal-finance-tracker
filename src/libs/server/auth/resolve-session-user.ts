import { withAuth } from "@workos-inc/authkit-nextjs";

import { getDb } from "@/libs/server/db/client";
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

type UserRow = {
  id: string;
  household_id: string;
  email: string;
  name: string | null;
  workos_user_id: string | null;
  is_drafted: boolean;
};

function buildDisplayName(
  firstName: string | null,
  lastName: string | null,
): string | null {
  const name = [firstName, lastName].filter(Boolean).join(" ");

  return name || null;
}

export async function resolveSessionUser(): Promise<ResolveSessionUserResult> {
  const { user: workosUser } = await withAuth();

  if (!workosUser) {
    return { authenticated: false, error: "no_session" };
  }

  const db = getDb();

  const rows = (await db`
    SELECT id::text, household_id::text AS household_id, email, name,
           workos_user_id, is_drafted
    FROM users
    WHERE email = ${workosUser.email}
    LIMIT 1
  `) as UserRow[];

  if (rows.length === 0) {
    logger.auth("rejected_not_invited", { email: workosUser.email });

    return { authenticated: false, error: "not_invited" };
  }

  const userRow = rows[0];

  if (userRow.is_drafted) {
    const displayName = buildDisplayName(
      workosUser.firstName,
      workosUser.lastName,
    );

    await db`
      UPDATE users
      SET workos_user_id = ${workosUser.id},
          name = ${displayName},
          is_drafted = false,
          updated_at = NOW()
      WHERE id = ${userRow.id}::uuid
        AND is_drafted = true
    `;

    logger.auth("user_activated", {
      userId: userRow.id,
      email: workosUser.email,
      workosUserId: workosUser.id,
    });

    return {
      authenticated: true,
      user: {
        id: userRow.id,
        householdId: userRow.household_id,
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
      householdId: userRow.household_id,
      email: userRow.email,
      name: userRow.name,
      workosUserId: userRow.workos_user_id!,
    },
  };
}
