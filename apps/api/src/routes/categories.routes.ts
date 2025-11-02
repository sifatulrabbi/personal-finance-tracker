import { Hono } from "hono";
import { CategoriesController } from "../controllers/categories.controller";
import { authMiddleware } from "../middleware/auth.middleware";

export const categoriesRouter = new Hono();

// Apply auth middleware to all routes
categoriesRouter.use("/*", authMiddleware);

// Category routes
categoriesRouter.get("/", CategoriesController.getAll);
