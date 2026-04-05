import type { BunSqlDatabase } from "@/lib/server/db/client";

export type AppliedMigration = {
  filename: string;
  checksum: string;
  applied_at: string;
};

export type MigrationRepositoryFactoryCtx = {
  db: BunSqlDatabase;
};

/**
 * Repository for migration bookkeeping. The factory stays DI-friendly by
 * receiving the Bun SQL client through context.
 */
export function createMigrationRepository({
  db,
}: MigrationRepositoryFactoryCtx) {
  return {
    async ensureMigrationTable(): Promise<void> {
      await db.unsafe(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          filename TEXT PRIMARY KEY,
          checksum TEXT NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    },

    async listAppliedMigrations(): Promise<AppliedMigration[]> {
      return (await db.unsafe(`
        SELECT filename, checksum, applied_at::text AS applied_at
        FROM schema_migrations
        ORDER BY filename ASC
      `)) as AppliedMigration[];
    },

    async recordAppliedMigration({
      filename,
      checksum,
    }: {
      filename: string;
      checksum: string;
    }): Promise<void> {
      await db`
        INSERT INTO schema_migrations (filename, checksum)
        VALUES (${filename}, ${checksum})
      `;
    },
  };
}
