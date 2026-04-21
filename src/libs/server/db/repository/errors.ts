import { createDomainConflictError } from "@/libs/server/api/errors";

function getSqlState(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("errno" in error)) {
    return undefined;
  }
  return String((error as { errno: unknown }).errno);
}

/**
 * Returns true for Postgres unique-violation errors (SQLSTATE 23505). Bun SQL
 * surfaces the SQLSTATE on the `errno` property of the thrown error.
 */
export function isUniqueViolation(error: unknown): boolean {
  return getSqlState(error) === "23505";
}

/**
 * Returns true for Postgres foreign-key violation errors (SQLSTATE 23503).
 * Raised when a RESTRICT delete would orphan dependent rows.
 */
export function isForeignKeyViolation(error: unknown): boolean {
  return getSqlState(error) === "23503";
}

/**
 * Wraps a Postgres foreign-key violation on delete as a 409 conflict ("in
 * use"). Use from route handlers that catch a delete failure when the row is
 * referenced elsewhere.
 */
export function mapForeignKeyInUse({
  error,
  label,
}: {
  error: unknown;
  label: string;
}): unknown {
  if (!isForeignKeyViolation(error)) {
    return error;
  }
  return createDomainConflictError({
    userMessage: `Cannot delete this ${label} because it is still in use.`,
    developerMessage: `Foreign-key violation on ${label} delete.`,
    cause: error,
  });
}

/**
 * Wraps a Postgres unique-violation as a 409 API conflict; re-throws anything
 * else unchanged. Use inside a repository's `catch` block for inserts/updates
 * of entities with a household-local uniqueness constraint.
 */
export function mapUniqueViolation({
  error,
  name,
  label,
}: {
  error: unknown;
  name: string;
  label: string;
}): unknown {
  if (!isUniqueViolation(error)) {
    return error;
  }

  const article = /^[aeiouAEIOU]/.test(label) ? "an" : "a";
  return createDomainConflictError({
    userMessage: `${capitalize(article)} ${label} named "${name}" already exists in this household.`,
    developerMessage: `Unique violation on ${label} insert/update.`,
    cause: error,
  });
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
