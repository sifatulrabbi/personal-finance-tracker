import { Context, Next } from "hono";
import { AuthService } from "../services/auth.service";

export interface AuthContext {
  userId: string;
  username: string;
}

/**
 * Authentication middleware
 * Verifies JWT token from Authorization header
 */
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json(
      {
        error: "Unauthorized",
        message: "Missing or invalid authorization header",
      },
      401,
    );
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  try {
    const payload = await AuthService.verifyToken(token);

    if (!payload) {
      return c.json(
        { error: "Unauthorized", message: "Invalid or expired token" },
        401,
      );
    }

    // Store user info in context for use in route handlers
    c.set("user", {
      userId: payload.userId,
      username: payload.username,
    } as AuthContext);

    await next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return c.json(
      { error: "Unauthorized", message: "Authentication failed" },
      401,
    );
  }
}

/**
 * Helper to get authenticated user from context
 */
export function getAuthUser(c: Context): AuthContext {
  return c.get("user") as AuthContext;
}
