import { SignJWT, jwtVerify } from "jose";
import { config } from "../config/env";
import { db } from "../db/connection";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

export interface JWTPayload {
  userId: string;
  username: string;
  iat?: number;
  exp?: number;
}

const JWT_SECRET = new TextEncoder().encode(config.auth.jwtSecret);

export class AuthService {
  /**
   * Verify user credentials
   */
  static async verifyCredentials(
    username: string,
    password: string,
  ): Promise<boolean> {
    try {
      // For single user setup, we can check against env vars directly
      // Or check against database for more flexibility
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (!user) {
        return false;
      }

      // Verify password using Bun's built-in password verification
      return await Bun.password.verify(password, user.passwordHash);
    } catch (error) {
      console.error("Error verifying credentials:", error);
      return false;
    }
  }

  /**
   * Generate JWT token
   */
  static async generateToken(
    userId: string,
    username: string,
  ): Promise<string> {
    try {
      const token = await new SignJWT({ userId, username } as JWTPayload)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(config.auth.jwtExpiresIn)
        .sign(JWT_SECRET);

      return token;
    } catch (error) {
      console.error("Error generating token:", error);
      throw new Error("Failed to generate token");
    }
  }

  /**
   * Verify JWT token
   */
  static async verifyToken(token: string): Promise<JWTPayload | null> {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      return payload as JWTPayload;
    } catch (error) {
      console.error("Error verifying token:", error);
      return null;
    }
  }

  /**
   * Get user by username
   */
  static async getUserByUsername(username: string) {
    try {
      const [user] = await db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          displayName: users.displayName,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      return user || null;
    } catch (error) {
      console.error("Error getting user:", error);
      return null;
    }
  }
}
