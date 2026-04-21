import { createTestDb, type BunSqlDatabase } from "@/libs/server/db/client";
import { applyMigrations } from "@/libs/server/db/migrations";
import {
  createRepositories,
  type Repositories,
} from "@/libs/server/db/repository";
import { SEED_HOUSEHOLDS, seedDatabase } from "@/libs/server/db/seed";

/**
 * Returns a fresh connection to the integration test database. Callers are
 * responsible for closing it in an `afterAll` hook.
 */
export function createIntegrationTestDb(): BunSqlDatabase {
  return createTestDb();
}

/**
 * Drops and recreates the public schema. Run this in `beforeEach` to give
 * each integration test an empty database with zero bleed-through from a
 * previous test's fixtures.
 */
export async function resetPublicSchema(db: BunSqlDatabase): Promise<void> {
  await db.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
}

/**
 * Applies all migrations to `db` without seeding.
 */
export async function migrate(db: BunSqlDatabase): Promise<void> {
  await applyMigrations({ db });
}

/**
 * Applies all migrations and runs the full seed (households, drafted users,
 * default people, BDT base currencies).
 */
export async function migrateAndSeed(db: BunSqlDatabase): Promise<void> {
  await applyMigrations({ db });
  await seedDatabase({ db });
}

/**
 * Convenience for tests that want a repository bundle against a given db.
 */
export function buildRepositories(db: BunSqlDatabase): Repositories {
  return createRepositories({ db });
}

export { SEED_HOUSEHOLDS };
