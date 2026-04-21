/**
 * Data-access module for the `categories` table. Transactions can reference a
 * category inline (`categoryName`) which is upserted via `upsertByName`.
 */

import type { CategoryDto } from "@/libs/server/api/dto";
import { mapUniqueViolation } from "@/libs/server/db/repository/errors";
import type { RepositoryContext } from "@/libs/server/db/repository/types";
import { createId } from "@/libs/id";

type CategoryRow = Readonly<{
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

function toCategoryDto(row: CategoryRow): CategoryDto {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    description: row.description,
    createdAt: toTimestamp(row.created_at),
    updatedAt: toTimestamp(row.updated_at),
  };
}

export type NewCategoryInput = Readonly<{
  householdId: string;
  name: string;
  description: string | null;
}>;

export function createCategoriesRepository(ctx: RepositoryContext) {
  const { db } = ctx;

  async function listByHousehold(householdId: string): Promise<CategoryDto[]> {
    const rows = (await db`
      SELECT id::text, household_id::text, name, description, created_at, updated_at
      FROM categories
      WHERE household_id = ${householdId}::uuid
      ORDER BY name ASC
    `) as CategoryRow[];

    return rows.map(toCategoryDto);
  }

  async function findById({
    householdId,
    id,
  }: {
    householdId: string;
    id: string;
  }): Promise<CategoryDto | null> {
    const rows = (await db`
      SELECT id::text, household_id::text, name, description, created_at, updated_at
      FROM categories
      WHERE household_id = ${householdId}::uuid
        AND id = ${id}::uuid
      LIMIT 1
    `) as CategoryRow[];

    return rows[0] ? toCategoryDto(rows[0]) : null;
  }

  async function insert(input: NewCategoryInput): Promise<CategoryDto> {
    const id = createId();
    try {
      const rows = (await db`
        INSERT INTO categories (id, household_id, name, description)
        VALUES (
          ${id}::uuid,
          ${input.householdId}::uuid,
          ${input.name},
          ${input.description}
        )
        RETURNING id::text, household_id::text, name, description, created_at, updated_at
      `) as CategoryRow[];

      return toCategoryDto(rows[0]!);
    } catch (error) {
      throw mapUniqueViolation({ error, name: input.name, label: "category" });
    }
  }

  /**
   * Returns the existing category with this (householdId, name) pair, or
   * inserts one. Used by transaction routes that accept a free-text
   * `categoryName`. Safe inside the same transaction as the transaction
   * insert because the unique index on (household_id, name) serializes
   * concurrent inserts.
   */
  async function upsertByName({
    householdId,
    name,
  }: {
    householdId: string;
    name: string;
  }): Promise<CategoryDto> {
    const existingRows = (await db`
      SELECT id::text, household_id::text, name, description, created_at, updated_at
      FROM categories
      WHERE household_id = ${householdId}::uuid
        AND name = ${name}
      LIMIT 1
    `) as CategoryRow[];

    if (existingRows[0]) {
      return toCategoryDto(existingRows[0]);
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
  }): Promise<CategoryDto | null> {
    try {
      const rows = (await db`
        UPDATE categories
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
      `) as CategoryRow[];

      return rows[0] ? toCategoryDto(rows[0]) : null;
    } catch (error) {
      throw mapUniqueViolation({
        error,
        name: patch.name ?? "",
        label: "category",
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
      DELETE FROM categories
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

export type CategoriesRepository = ReturnType<
  typeof createCategoriesRepository
>;
