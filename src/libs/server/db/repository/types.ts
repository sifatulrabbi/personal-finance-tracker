import type { BunSqlDatabase } from "@/libs/server/db/client";

/** Base context injected into every repository factory. */
export type RepositoryContext = Readonly<{
  db: BunSqlDatabase;
}>;
