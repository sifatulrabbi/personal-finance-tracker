package app

import (
	"context"

	"simply-finance/internal/ledger"
)

// Store is the storage port: the one integration boundary between the use cases and the database.
// The SQLite adapter (internal/sqlite) is its only implementation, and tests run the use cases
// against it, never against an in-memory stand-in.
//
// Every use case runs inside exactly one transaction. Code inside fn must use only the Tx it is
// given: the writer has one connection, so opening another transaction from inside fn would wait
// for itself.
type Store interface {
	// Read runs fn in one read-only snapshot.
	Read(ctx context.Context, fn func(Tx) error) error
	// Change runs fn in one write transaction without a request key, for bookkeeping writes such as
	// storing bills that have come due.
	Change(ctx context.Context, fn func(Tx) error) error
	// Write runs fn in one write transaction guarded by a request key. When the key was already used
	// with the same fingerprint, fn does not run and the stored response is returned as replay. A
	// different fingerprint is ledger.ErrIdempotencyKeyReused. An actor that is not a stored user is
	// ledger.ErrInvalid. Otherwise fn's result is stored with the key and returned.
	Write(ctx context.Context, key RequestKey, fn func(Tx) (any, error)) (result any, replay []byte, err error)
}

// RequestKey identifies one financial write for duplicate protection. Keys created before
// ExpiresBefore (Unix seconds) are pruned first, so an expired key counts as new.
type RequestKey struct {
	ActorID       string
	Key           string
	Fingerprint   string
	CreatedAt     int64
	ExpiresBefore int64
}

// Revision is one stored version of a transaction: its payload is the evidence of what the
// version said, and it becomes the transaction's current version.
type Revision struct {
	TransactionID string
	Version       int
	Voided        bool
	Payload       []byte
	ActorID       string
	CreatedAt     string
}

// Entry is a posted wallet entry that a correction or void reverses.
type Entry struct {
	ID int64
	ledger.Effect
}

// Tx is the record access available inside one transaction. Lookups of a single missing record
// return ledger.ErrNotFound.
type Tx interface {
	// Users and the change log.
	UserEmail(userID string) (string, error)
	Audit(actorID, entityID, action string, before, after any, createdAt string) error
	AuditEvents(beforeID int64, limit, offset int) ([]ledger.AuditEvent, error)

	// Wallets. A wallet's balance changes only through Post.
	Wallet(id string) (ledger.Wallet, error)
	Wallets() ([]ledger.Wallet, error)
	InsertWallet(id string, in ledger.WalletInput, creditLimit int64) error
	UpdateWallet(id, name, details string, creditLimit int64, archived bool) error
	WalletBalance(id string) (int64, error)

	// Settings and categories.
	Settings() (ledger.Settings, error)
	SetRate(rate int64) error
	Categories() ([]ledger.Category, error)
	ExpenseCategories() ([]ledger.CategorySpending, error)
	CategoryExists(id, kind string) (bool, error)
	CategoryNameTaken(kind, name string) (bool, error)
	InsertCategory(c ledger.Category) error

	// Transactions: a row per record, its revisions, and its wallet entries.
	InsertTransaction(id string) error
	WriteRevision(r Revision) error
	Post(transactionID string, version int, walletID string, delta, reversalOf int64) error
	CurrentEntries(transactionID string, version int) ([]Entry, error)
	Transaction(id string) (ledger.Transaction, error)
	History(id string) ([]ledger.Transaction, error)
	RecentTransactions(limit, offset int) ([]ledger.Transaction, error)
	TransactionPage(f TransactionFilter, after *TransactionCursor, limit int) ([]ledger.Transaction, []TransactionCursor, error)

	// Recurring schedules and their occurrences.
	Schedules() ([]ledger.ScheduleState, error)
	Schedule(id string) (ledger.Schedule, error)
	InsertSchedule(id string, in ledger.ScheduleInput) error
	UpdateSchedule(s ledger.Schedule) error
	SetNextIndex(scheduleID string, next int) error
	InsertOccurrence(b ledger.Bill) error
	Bill(id string) (ledger.Bill, error)
	DueBills() ([]ledger.Bill, error)
	BillsByStatus(status string, newestFirst bool, limit, offset int) ([]ledger.Bill, error)
	DueBillCount() (count int, oldest string, err error)
	BillPaidBy(transactionID string) (billID string, found bool, err error)
	MarkBillPaid(id, transactionID string) error
	MarkBillSkipped(id string) error
	ReopenBill(id string) error

	// Monthly targets and spending.
	LatestTarget(month string) (*ledger.SavedTarget, error)
	SaveTarget(month string, amount int64, version int) error
	MonthExpenses(month string) ([]ledger.Expense, error)
}
