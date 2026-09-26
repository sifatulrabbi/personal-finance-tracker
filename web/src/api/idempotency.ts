export type MutationKey = { fingerprint: string; key: string };

// Reuses the previous key only for an identical retry of the same request; any change to
// the target or body gets a new key. Forms drop the key after a success so the next,
// separate submission never replays the first response.
export function mutationKey(
  previous: MutationKey | undefined,
  target: string,
  body: unknown,
  newKey: () => string = randomKey,
): MutationKey {
  const fingerprint = JSON.stringify([target, body]);
  return previous?.fingerprint === fingerprint
    ? previous
    : { fingerprint, key: newKey() };
}

type RandomSource = Pick<Crypto, "getRandomValues"> & { randomUUID?: () => string };

// crypto.randomUUID exists only in secure contexts, so a phone opening the app over plain HTTP
// on the home network would fail every save. getRandomValues is available everywhere; build the
// same version 4 UUID from it when randomUUID is missing.
export function randomKey(source: RandomSource = crypto): string {
  if (typeof source.randomUUID === "function") return source.randomUUID();
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
