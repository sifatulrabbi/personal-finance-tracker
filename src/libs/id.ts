import { ulid } from "ulid";

const CROCKFORD32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const UUID_HEX_LENGTH = 32;
const MAX_UUID_VALUE = (1n << 128n) - 1n;

/**
 * Creates a new application identifier by generating a ULID and converting it
 * into a UUID-compatible string for storage in Postgres `uuid` columns.
 */
export function createId(): string {
  return formatUlidAsUuid(ulid());
}

/**
 * Converts a ULID string into a UUID-compatible hex representation while
 * preserving the underlying 128-bit value.
 */
export function formatUlidAsUuid(value: string): string {
  const normalized = value.trim().toUpperCase();

  if (!ULID_PATTERN.test(normalized)) {
    throw new Error(`Invalid ULID: ${value}`);
  }

  let decoded = 0n;

  for (const character of normalized) {
    const index = CROCKFORD32_ALPHABET.indexOf(character);

    if (index === -1) {
      throw new Error(`Invalid ULID character: ${character}`);
    }

    decoded = decoded * 32n + BigInt(index);
  }

  if (decoded > MAX_UUID_VALUE) {
    throw new Error(`ULID exceeds UUID storage range: ${value}`);
  }

  const hex = decoded.toString(16).padStart(UUID_HEX_LENGTH, "0");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
