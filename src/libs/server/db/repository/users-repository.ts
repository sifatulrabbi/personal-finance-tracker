/**
 * Data-access module for the `users` table. Users are invitation-only: new
 * signups are created as drafted rows (no `workos_user_id`, `is_drafted=true`)
 * and activated on first WorkOS sign-in.
 */

import type { UserDto } from "@/libs/server/api/dto";
import { mapUniqueViolation } from "@/libs/server/db/repository/errors";
import type { RepositoryContext } from "@/libs/server/db/repository/types";
import { createId } from "@/libs/id";

/**
 * Internal row used by the auth layer. Unlike `UserDto`, this exposes
 * `workos_user_id` because `resolveSessionUser` needs it to decide whether to
 * activate a drafted row.
 */
export type UserRow = Readonly<{
  id: string;
  householdId: string;
  email: string;
  name: string | null;
  workosUserId: string | null;
  isDrafted: boolean;
  createdAt: string;
  updatedAt: string;
}>;

type RawUserRow = Readonly<{
  id: string;
  household_id: string;
  email: string;
  name: string | null;
  workos_user_id: string | null;
  is_drafted: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}>;

function toTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toUserRow(row: RawUserRow): UserRow {
  return {
    id: row.id,
    householdId: row.household_id,
    email: row.email,
    name: row.name,
    workosUserId: row.workos_user_id,
    isDrafted: row.is_drafted,
    createdAt: toTimestamp(row.created_at),
    updatedAt: toTimestamp(row.updated_at),
  };
}

function toUserDto(row: UserRow): UserDto {
  return {
    id: row.id,
    householdId: row.householdId,
    email: row.email,
    name: row.name,
    isDrafted: row.isDrafted,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createUsersRepository(ctx: RepositoryContext) {
  const { db } = ctx;

  async function listByHousehold(householdId: string): Promise<UserDto[]> {
    const rows = (await db`
      SELECT id::text, household_id::text, email, name, workos_user_id,
             is_drafted, created_at, updated_at
      FROM users
      WHERE household_id = ${householdId}::uuid
      ORDER BY email ASC
    `) as RawUserRow[];

    return rows.map((row) => toUserDto(toUserRow(row)));
  }

  async function findByEmail(email: string): Promise<UserRow | null> {
    const rows = (await db`
      SELECT id::text, household_id::text, email, name, workos_user_id,
             is_drafted, created_at, updated_at
      FROM users
      WHERE email = ${email}
      LIMIT 1
    `) as RawUserRow[];

    return rows[0] ? toUserRow(rows[0]) : null;
  }

  /**
   * Activates a drafted invitation on first sign-in: sets `workos_user_id`,
   * promotes `is_drafted` to false, and stamps the display name from WorkOS.
   * A no-op when the row is already active (guarded by the `is_drafted=true`
   * predicate).
   */
  async function activateDrafted({
    id,
    workosUserId,
    name,
  }: {
    id: string;
    workosUserId: string;
    name: string | null;
  }): Promise<void> {
    await db`
      UPDATE users
      SET workos_user_id = ${workosUserId},
          name = ${name},
          is_drafted = FALSE,
          updated_at = NOW()
      WHERE id = ${id}::uuid
        AND is_drafted = TRUE
    `;
  }

  /**
   * Inserts a drafted invitation row so a yet-to-sign-in household member can
   * be activated on their first WorkOS login.
   */
  async function insertInvite({
    householdId,
    email,
  }: {
    householdId: string;
    email: string;
  }): Promise<UserDto> {
    const id = createId();
    try {
      const rows = (await db`
        INSERT INTO users (
          id, household_id, email, name, workos_user_id, is_drafted
        )
        VALUES (
          ${id}::uuid,
          ${householdId}::uuid,
          ${email},
          ${null},
          ${null},
          ${true}
        )
        RETURNING id::text, household_id::text, email, name, workos_user_id,
                  is_drafted, created_at, updated_at
      `) as RawUserRow[];

      return toUserDto(toUserRow(rows[0]!));
    } catch (error) {
      throw mapUniqueViolation({ error, name: email, label: "invitation" });
    }
  }

  return {
    listByHousehold,
    findByEmail,
    activateDrafted,
    insertInvite,
  };
}

export type UsersRepository = ReturnType<typeof createUsersRepository>;
