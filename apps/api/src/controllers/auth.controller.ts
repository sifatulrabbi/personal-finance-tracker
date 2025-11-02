import { Context } from "hono";
import { z } from "zod";
import { AuthService } from "../services/auth.service";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export class AuthController {
  /**
   * POST /auth/login
   * Login with username and password
   */
  static async login(c: Context) {
    try {
      const body = await c.req.json();
      const validation = loginSchema.safeParse(body);

      if (!validation.success) {
        return c.json(
          {
            error: "Validation Error",
            details: validation.error.flatten().fieldErrors,
          },
          400,
        );
      }

      const { username, password } = validation.data;

      // Verify credentials
      const isValid = await AuthService.verifyCredentials(username, password);

      if (!isValid) {
        return c.json(
          {
            error: "Authentication Failed",
            message: "Invalid username or password",
          },
          401,
        );
      }

      // Get user details
      const user = await AuthService.getUserByUsername(username);

      if (!user) {
        return c.json(
          {
            error: "Authentication Failed",
            message: "User not found",
          },
          401,
        );
      }

      // Generate JWT token
      const token = await AuthService.generateToken(user.id, user.username);

      return c.json({
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            displayName: user.displayName,
          },
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      return c.json(
        {
          error: "Internal Server Error",
          message: "An error occurred during login",
        },
        500,
      );
    }
  }

  /**
   * GET /auth/me
   * Get current authenticated user
   */
  static async me(c: Context) {
    try {
      const user = c.get("user") as { userId: string; username: string };

      const userData = await AuthService.getUserByUsername(user.username);

      if (!userData) {
        return c.json(
          {
            error: "Not Found",
            message: "User not found",
          },
          404,
        );
      }

      return c.json({
        success: true,
        data: {
          id: userData.id,
          username: userData.username,
          email: userData.email,
          displayName: userData.displayName,
          createdAt: userData.createdAt,
        },
      });
    } catch (error) {
      console.error("Get user error:", error);
      return c.json(
        {
          error: "Internal Server Error",
          message: "An error occurred while fetching user",
        },
        500,
      );
    }
  }
}
