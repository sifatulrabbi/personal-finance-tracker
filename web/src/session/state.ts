import type { User } from "@/api/types";

// Session states. "expired" keeps the signed-in screen (and any open form) mounted while a
// sign-in prompt is shown, so a 401 in the middle of a form never drops what was typed.
export type SessionState =
  | { status: "checking" }
  | { status: "unreachable"; message: string }
  | { status: "signedOut" }
  | { status: "signedIn"; user: User; expired: boolean };

export type SessionEvent =
  | { type: "checked"; user: User }
  | { type: "checkedSignedOut" }
  | { type: "checkFailed"; message: string }
  | { type: "retry" }
  | { type: "signedIn"; user: User }
  | { type: "expired" }
  | { type: "signedOut" };

export const initialSession: SessionState = { status: "checking" };

export function sessionReducer(state: SessionState, event: SessionEvent): SessionState {
  switch (event.type) {
    case "checked":
    case "signedIn":
      return { status: "signedIn", user: event.user, expired: false };
    case "checkedSignedOut":
    case "signedOut":
      return { status: "signedOut" };
    case "checkFailed":
      return { status: "unreachable", message: event.message };
    case "retry":
      return { status: "checking" };
    case "expired":
      // Only a signed-in session can expire; a 401 elsewhere means nothing to undo.
      return state.status === "signedIn" ? { ...state, expired: true } : state;
  }
}
