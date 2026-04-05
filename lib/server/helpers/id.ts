/**
 * Generates a UUID for domain entities and application records.
 */
export function generateId(): string {
  return crypto.randomUUID();
}
