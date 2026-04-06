import { SQL } from "bun";

import {
  createAppConfig,
  createTestAppConfig,
  type EnvironmentMap,
} from "@/libs/server/config";

type ClosableDatabase = {
  close: () => Promise<unknown> | unknown;
};

type DatabaseManagerDependencies<TDatabase extends ClosableDatabase> = {
  env?: EnvironmentMap;
  createConnection?: (connectionString: string) => TDatabase;
};

/**
 * Creates a Bun SQL Postgres connection from a connection string.
 */
export function createDatabaseConnection(connectionString: string) {
  return new SQL(connectionString);
}

export type BunSqlDatabase = ReturnType<typeof createDatabaseConnection>;

/**
 * Creates a lazily initialized, cached database manager for runtime use.
 */
export function createDatabaseManager(): {
  getDb: () => BunSqlDatabase;
  reset: () => Promise<void>;
};
export function createDatabaseManager<TDatabase extends ClosableDatabase>(
  dependencies: DatabaseManagerDependencies<TDatabase>,
): {
  getDb: () => TDatabase;
  reset: () => Promise<void>;
};
export function createDatabaseManager<TDatabase extends ClosableDatabase>(
  dependencies: DatabaseManagerDependencies<TDatabase> = {},
) {
  const env = dependencies.env ?? process.env;
  const createConnection = dependencies.createConnection;

  let cachedDb: TDatabase | null = null;

  return {
    getDb(): TDatabase {
      if (!cachedDb) {
        const connectionString = createAppConfig({ env }).database.url;

        cachedDb = createConnection
          ? createConnection(connectionString)
          : (createDatabaseConnection(
              connectionString,
            ) as unknown as TDatabase);
      }

      return cachedDb;
    },

    async reset(): Promise<void> {
      if (!cachedDb) {
        return;
      }

      await cachedDb.close();
      cachedDb = null;
    },
  };
}

const defaultDatabaseManager = createDatabaseManager();

/**
 * Returns the shared application database connection.
 */
export function getDb(): BunSqlDatabase {
  return defaultDatabaseManager.getDb();
}

/**
 * Creates a new connection for integration tests and one-off scripts that
 * should not reuse the app runtime singleton.
 */
export function createTestDb(
  env: EnvironmentMap = process.env,
): BunSqlDatabase {
  return createDatabaseConnection(createTestAppConfig({ env }).database.url);
}

export async function resetDbForTests(): Promise<void> {
  await defaultDatabaseManager.reset();
}
