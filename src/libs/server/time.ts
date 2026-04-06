/**
 * Returns the current timestamp in UTC ISO-8601 format.
 */
export function getUtcTimestamp(now = new Date()): string {
  return now.toISOString();
}
