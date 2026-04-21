import { ApiError } from "@/libs/server/api/errors";

import {
  resolveSessionUser,
  type SessionUser,
} from "@/libs/server/auth/resolve-session-user";

export async function requireSessionUser(): Promise<SessionUser> {
  const result = await resolveSessionUser();

  if (!result.authenticated) {
    throw new ApiError({
      statusCode: 401,
      code: "unauthorized",
      userMessage:
        result.error === "not_invited"
          ? "You must be invited first to access this app."
          : "You must sign in to access this resource.",
    });
  }

  return result.user;
}
