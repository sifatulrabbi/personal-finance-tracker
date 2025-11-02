import { Hono } from "hono";
import { RecurringController } from "../controllers/recurring.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const recurringRoutes = new Hono();

// Apply auth middleware to all routes
recurringRoutes.use("*", authMiddleware);

// GET /api/recurring - Get all recurring transactions
recurringRoutes.get("/", RecurringController.getAll);

// GET /api/recurring/active - Get active recurring transactions
recurringRoutes.get("/active", RecurringController.getActive);

// GET /api/recurring/:id - Get recurring transaction by ID
recurringRoutes.get("/:id", RecurringController.getById);

// POST /api/recurring - Create new recurring transaction
recurringRoutes.post("/", RecurringController.create);

// PATCH /api/recurring/:id - Update recurring transaction
recurringRoutes.patch("/:id", RecurringController.update);

// PATCH /api/recurring/:id/toggle - Toggle active status
recurringRoutes.patch("/:id/toggle", RecurringController.toggleActive);

// POST /api/recurring/:id/create-now - Create transaction now
recurringRoutes.post("/:id/create-now", RecurringController.createNow);

// POST /api/recurring/process-due - Process all due recurring transactions
recurringRoutes.post("/process-due", RecurringController.processDue);

// DELETE /api/recurring/:id - Delete recurring transaction
recurringRoutes.delete("/:id", RecurringController.delete);

export { recurringRoutes };
