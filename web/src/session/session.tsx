import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { ApiClient } from "@/api/client";
import { ApiProvider } from "@/api/context";
import { errorMessage, isApiError } from "@/api/errors";
import type { LoginInput, User } from "@/api/types";
import { homePath } from "@/routes";
import { guardSession } from "./guard";
import { initialSession, sessionReducer, type SessionState } from "./state";

type Session = {
  state: SessionState;
  signIn(input: LoginInput): Promise<User>;
  signOut(): Promise<void>;
  retry(): void;
};

const SessionContext = createContext<Session | null>(null);

// Owns who is signed in. It hands the rest of the app a client that reports any 401 as an
// expired session, so screens and open forms stay mounted while the user signs in again.
export function SessionProvider({
  api,
  children,
}: {
  api: ApiClient;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(sessionReducer, initialSession);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const guarded = useMemo(
    () => guardSession(api, () => dispatch({ type: "expired" })),
    [api],
  );

  useEffect(() => {
    if (state.status !== "checking") return;
    let active = true;
    api
      .me()
      .then((user) => {
        if (active) dispatch({ type: "checked", user });
      })
      .catch((error) => {
        if (!active) return;
        if (isApiError(error) && error.unauthenticated)
          dispatch({ type: "checkedSignedOut" });
        else
          dispatch({
            type: "checkFailed",
            message: errorMessage(error, "Cannot reach the server. Try again."),
          });
      });
    return () => {
      active = false;
    };
  }, [api, state.status]);

  const signIn = useCallback(
    async (input: LoginInput) => {
      const user = await api.login(input);
      dispatch({ type: "signedIn", user });
      // Anything that failed while the session was expired loads again.
      void queryClient.invalidateQueries();
      return user;
    },
    [api, queryClient],
  );

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch (error) {
      // An expired session is already signed out on the server.
      if (!(isApiError(error) && error.unauthenticated)) throw error;
    }
    queryClient.clear();
    // The next person to sign in on this device starts on Activity, not the last page.
    navigate(homePath, { replace: true });
    dispatch({ type: "signedOut" });
  }, [api, navigate, queryClient]);

  const retry = useCallback(() => dispatch({ type: "retry" }), []);

  const value = useMemo(
    () => ({ state, signIn, signOut, retry }),
    [state, signIn, signOut, retry],
  );
  return (
    <SessionContext.Provider value={value}>
      <ApiProvider client={guarded}>{children}</ApiProvider>
    </SessionContext.Provider>
  );
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession needs a SessionProvider");
  return session;
}
