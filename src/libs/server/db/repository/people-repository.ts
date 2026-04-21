/**
 * Data-access module for the `people` table. A person represents a transaction
 * participant (attribution target), distinct from a login user. Every
 * household has exactly one `is_default = true` person, enforced by the
 * `people_one_default_per_household_idx` partial-unique index.
 */

import type { PersonDto } from "@/libs/server/api/dto";
import { mapUniqueViolation } from "@/libs/server/db/repository/errors";
import type { RepositoryContext } from "@/libs/server/db/repository/types";
import { createId } from "@/libs/id";

type PersonRow = Readonly<{
  id: string;
  household_id: string;
  name: string;
  is_default: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}>;

function toTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toPersonDto(row: PersonRow): PersonDto {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    isDefault: row.is_default,
    createdAt: toTimestamp(row.created_at),
    updatedAt: toTimestamp(row.updated_at),
  };
}

export type NewPersonInput = Readonly<{
  householdId: string;
  name: string;
  isDefault?: boolean;
}>;

export function createPeopleRepository(ctx: RepositoryContext) {
  const { db } = ctx;

  async function listByHousehold(householdId: string): Promise<PersonDto[]> {
    const rows = (await db`
      SELECT id::text, household_id::text, name, is_default, created_at, updated_at
      FROM people
      WHERE household_id = ${householdId}::uuid
      ORDER BY is_default DESC, name ASC
    `) as PersonRow[];

    return rows.map(toPersonDto);
  }

  async function findById({
    householdId,
    id,
  }: {
    householdId: string;
    id: string;
  }): Promise<PersonDto | null> {
    const rows = (await db`
      SELECT id::text, household_id::text, name, is_default, created_at, updated_at
      FROM people
      WHERE household_id = ${householdId}::uuid
        AND id = ${id}::uuid
      LIMIT 1
    `) as PersonRow[];

    return rows[0] ? toPersonDto(rows[0]) : null;
  }

  async function findDefault(householdId: string): Promise<PersonDto | null> {
    const rows = (await db`
      SELECT id::text, household_id::text, name, is_default, created_at, updated_at
      FROM people
      WHERE household_id = ${householdId}::uuid
        AND is_default = TRUE
      LIMIT 1
    `) as PersonRow[];

    return rows[0] ? toPersonDto(rows[0]) : null;
  }

  async function insert(input: NewPersonInput): Promise<PersonDto> {
    const id = createId();
    try {
      const rows = (await db`
        INSERT INTO people (id, household_id, name, is_default)
        VALUES (
          ${id}::uuid,
          ${input.householdId}::uuid,
          ${input.name},
          ${input.isDefault ?? false}
        )
        RETURNING id::text, household_id::text, name, is_default, created_at, updated_at
      `) as PersonRow[];

      return toPersonDto(rows[0]!);
    } catch (error) {
      throw mapUniqueViolation({ error, name: input.name, label: "person" });
    }
  }

  async function update({
    householdId,
    id,
    patch,
  }: {
    householdId: string;
    id: string;
    patch: Readonly<{ name?: string }>;
  }): Promise<PersonDto | null> {
    try {
      const rows = (await db`
        UPDATE people
        SET
          name = COALESCE(${patch.name ?? null}, name),
          updated_at = NOW()
        WHERE household_id = ${householdId}::uuid
          AND id = ${id}::uuid
        RETURNING id::text, household_id::text, name, is_default, created_at, updated_at
      `) as PersonRow[];

      return rows[0] ? toPersonDto(rows[0]) : null;
    } catch (error) {
      throw mapUniqueViolation({
        error,
        name: patch.name ?? "",
        label: "person",
      });
    }
  }

  async function remove({
    householdId,
    id,
  }: {
    householdId: string;
    id: string;
  }): Promise<boolean> {
    const rows = (await db`
      DELETE FROM people
      WHERE household_id = ${householdId}::uuid
        AND id = ${id}::uuid
        AND is_default = FALSE
      RETURNING id
    `) as Array<{ id: string }>;

    return rows.length > 0;
  }

  return {
    listByHousehold,
    findById,
    findDefault,
    insert,
    update,
    remove,
  };
}

export type PeopleRepository = ReturnType<typeof createPeopleRepository>;
