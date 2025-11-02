import { Hono } from "hono";
import { AuthController } from "../controllers/auth.controller";
import { authMiddleware } from "../middleware/auth.middleware";

export const authRouter = new Hono();

// Public routes
authRouter.post("/login", AuthController.login);

// Protected routes
authRouter.get("/me", authMiddleware, AuthController.me);
