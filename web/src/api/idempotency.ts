export type MutationKey = { fingerprint: string; key: string };

// Reuses the previous key only for an identical retry of the same request; any change to
// the target or body gets a new key. Forms drop the key after a success so the next,
// separate submission never replays the first response.
export function mutationKey(
  previous: MutationKey | undefined,
  target: string,
  body: unknown,
  newKey: () => string = () => crypto.randomUUID(),
): MutationKey {
  const fingerprint = JSON.stringify([target, body]);
  return previous?.fingerprint === fingerprint
    ? previous
    : { fingerprint, key: newKey() };
}
