/**
 * Data-access module for the `origins` table. Income routes upsert origins by
 * name (inline-create during a transaction insert), which is handled by
 * `upsertByName`.
 */

import type { OriginDto } from "@/libs/server/api/dto";
import { mapUniqueViolation } from "@/libs/server/db/repository/errors";
import type { RepositoryContext } from "@/libs/server/db/repository/types";
import { createId } from "@/libs/id";

type OriginRow = Readonly<{
  id: string;
  household_id: string;
  name: string;
  description: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}>;

function toTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toOriginDto(row: OriginRow): OriginDto {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    description: row.description,
    createdAt: toTimestamp(row.created_at),
    updatedAt: toTimestamp(row.updated_at),
  };
}

export type NewOriginInput = Readonly<{
  householdId: string;
  name: string;
  description: string | null;
}>;

export function createOriginsRepository(ctx: RepositoryContext) {
  const { db } = ctx;

  async function listByHousehold(householdId: string): Promise<OriginDto[]> {
    const rows = (await db`
      SELECT id::text, household_id::text, name, description, created_at, updated_at
      FROM origins
      WHERE household_id = ${householdId}::uuid
      ORDER BY name ASC
    `) as OriginRow[];

    return rows.map(toOriginDto);
  }

  async function findById({
    householdId,
    id,
  }: {
    householdId: string;
    id: string;
  }): Promise<OriginDto | null> {
    const rows = (await db`
      SELECT id::text, household_id::text, name, description, created_at, updated_at
      FROM origins
      WHERE household_id = ${householdId}::uuid
        AND id = ${id}::uuid
      LIMIT 1
    `) as OriginRow[];

    return rows[0] ? toOriginDto(rows[0]) : null;
  }

  async function insert(input: NewOriginInput): Promise<OriginDto> {
    const id = createId();
    try {
      const rows = (await db`
        INSERT INTO origins (id, household_id, name, description)
        VALUES (
          ${id}::uuid,
          ${input.householdId}::uuid,
          ${input.name},
          ${input.description}
        )
        RETURNING id::text, household_id::text, name, description, created_at, updated_at
      `) as OriginRow[];

      return toOriginDto(rows[0]!);
    } catch (error) {
      throw mapUniqueViolation({ error, name: input.name, label: "origin" });
    }
  }

  async function upsertByName({
    householdId,
    name,
  }: {
    householdId: string;
    name: string;
  }): Promise<OriginDto> {
    const existingRows = (await db`
      SELECT id::text, household_id::text, name, description, created_at, updated_at
      FROM origins
      WHERE household_id = ${householdId}::uuid
        AND name = ${name}
      LIMIT 1
    `) as OriginRow[];

    if (existingRows[0]) {
      return toOriginDto(existingRows[0]);
    }

    return insert({ householdId, name, description: null });
  }

  async function update({
    householdId,
    id,
    patch,
  }: {
    householdId: string;
    id: string;
    patch: Readonly<{ name?: string; description?: string | null }>;
  }): Promise<OriginDto | null> {
    try {
      const rows = (await db`
        UPDATE origins
        SET
          name = COALESCE(${patch.name ?? null}, name),
          description = CASE
            WHEN ${patch.description === undefined} THEN description
            ELSE ${patch.description ?? null}
          END,
          updated_at = NOW()
        WHERE household_id = ${householdId}::uuid
          AND id = ${id}::uuid
        RETURNING id::text, household_id::text, name, description, created_at, updated_at
      `) as OriginRow[];

      return rows[0] ? toOriginDto(rows[0]) : null;
    } catch (error) {
      throw mapUniqueViolation({
        error,
        name: patch.name ?? "",
        label: "origin",
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
      DELETE FROM origins
      WHERE household_id = ${householdId}::uuid
        AND id = ${id}::uuid
      RETURNING id
    `) as Array<{ id: string }>;

    return rows.length > 0;
  }

  return {
    listByHousehold,
    findById,
    insert,
    upsertByName,
    update,
    remove,
  };
}

export type OriginsRepository = ReturnType<typeof createOriginsRepository>;
