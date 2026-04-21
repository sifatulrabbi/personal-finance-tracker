/** Client-safe session user — mirrors server SessionUser without server imports. */
export type SessionUser = Readonly<{
  id: string;
  householdId: string;
  email: string;
  name: string | null;
  workosUserId: string;
}>;
