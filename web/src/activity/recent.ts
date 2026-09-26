// The wallets and categories this device picked most recently, so the Add sheet shows them
// first and starts on the last wallet used. A per-device convenience only: when storage is
// blocked or empty the lists keep their server order.

export type PickKind = "wallet" | "category";

const storageKey = (kind: PickKind) => `simply-finance:recent-${kind}`;
const limit = 12;

// Items whose ids were picked recently come first, most recent first; the rest keep their
// order. Unknown ids are ignored.
export function recentFirst<T extends { id: string }>(items: T[], recentIds: string[]): T[] {
  const rank = new Map(recentIds.map((id, index) => [id, index]));
  const recent = items.filter((item) => rank.has(item.id));
  recent.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return [...recent, ...items.filter((item) => !rank.has(item.id))];
}

export function withPick(recentIds: string[], id: string) {
  return [id, ...recentIds.filter((existing) => existing !== id)].slice(0, limit);
}

export function recentPicks(kind: PickKind): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(kind)) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function rememberPick(kind: PickKind, id: string) {
  if (!id) return;
  try {
    localStorage.setItem(storageKey(kind), JSON.stringify(withPick(recentPicks(kind), id)));
  } catch {
    // Storage is unavailable (private mode, blocked site data); ordering is only a nicety.
  }
}
