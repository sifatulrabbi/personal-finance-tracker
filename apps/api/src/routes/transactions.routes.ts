import { Hono } from "hono";
import { TransactionsController } from "../controllers/transactions.controller";
import { authMiddleware } from "../middleware/auth.middleware";

export const transactionsRouter = new Hono();

// All routes require authentication
transactionsRouter.use("*", authMiddleware);

transactionsRouter.get("/", TransactionsController.getAll);
transactionsRouter.get("/summary", TransactionsController.getSummary);
transactionsRouter.get("/:id", TransactionsController.getById);
transactionsRouter.post("/", TransactionsController.create);
transactionsRouter.patch("/:id", TransactionsController.update);
transactionsRouter.delete("/:id", TransactionsController.delete);
