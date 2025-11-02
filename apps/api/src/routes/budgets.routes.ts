import { Hono } from "hono";
import { BudgetsController } from "../controllers/budgets.controller";
import { authMiddleware } from "../middleware/auth.middleware";

export const budgetsRouter = new Hono();

// Apply auth middleware to all routes
budgetsRouter.use("/*", authMiddleware);

// Budget routes
budgetsRouter.get("/", BudgetsController.getAll);
budgetsRouter.get("/:id", BudgetsController.getById);
budgetsRouter.post("/", BudgetsController.create);
budgetsRouter.patch("/:id", BudgetsController.update);
budgetsRouter.delete("/:id", BudgetsController.delete);
