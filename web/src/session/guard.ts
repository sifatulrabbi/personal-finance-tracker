import type { ApiClient } from "@/api/client";
import { isApiError } from "@/api/errors";

// Session calls handle their own 401s: at startup it means "signed out", at login it means
// wrong credentials, and at logout it means already signed out.
const sessionMethods = new Set<keyof ApiClient>(["me", "login", "logout"]);

// Wraps the client so that any 401 from a data call reports an expired session. The error
// is still thrown, so the form that made the call keeps its input and shows the message.
export function guardSession(client: ApiClient, onExpired: () => void): ApiClient {
  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function" || sessionMethods.has(property as keyof ApiClient))
        return value;
      return async (...args: unknown[]) => {
        try {
          return await value.apply(target, args);
        } catch (error) {
          if (isApiError(error) && error.unauthenticated) onExpired();
          throw error;
        }
      };
    },
  });
}
