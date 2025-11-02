import { Hono } from "hono";
import { AccountsController } from "../controllers/accounts.controller";
import { authMiddleware } from "../middleware/auth.middleware";

export const accountsRouter = new Hono();

// All routes require authentication
accountsRouter.use("*", authMiddleware);

accountsRouter.get("/", AccountsController.getAll);
accountsRouter.get("/balances", AccountsController.getBalances);
accountsRouter.get("/:id", AccountsController.getById);
accountsRouter.post("/", AccountsController.create);
accountsRouter.patch("/:id", AccountsController.update);
accountsRouter.delete("/:id", AccountsController.delete);
