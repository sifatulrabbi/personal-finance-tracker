ALTER TABLE "accounts" ALTER COLUMN "currency" SET DEFAULT 'BDT';--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "currency" SET DEFAULT 'BDT';--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "currency" SET DEFAULT 'BDT';--> statement-breakpoint
ALTER TABLE "goals" ALTER COLUMN "currency" SET DEFAULT 'BDT';--> statement-breakpoint
ALTER TABLE "recurring_transactions" ALTER COLUMN "currency" SET DEFAULT 'BDT';