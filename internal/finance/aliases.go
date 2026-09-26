package finance

import "simply-finance/internal/ledger"

// Temporary names for records and errors that moved to the ledger package. They keep this step
// small; the next step moves callers to ledger and removes them.
type (
	Error            = ledger.Error
	User             = ledger.User
	WalletInput      = ledger.WalletInput
	Wallet           = ledger.Wallet
	TransactionInput = ledger.TransactionInput
	Transaction      = ledger.Transaction
	Settings         = ledger.Settings
	CategoryInput    = ledger.CategoryInput
	Category         = ledger.Category
	ScheduleInput    = ledger.ScheduleInput
	Schedule         = ledger.Schedule
	Bill             = ledger.Bill
	PaymentInput     = ledger.PaymentInput
	UpcomingBill     = ledger.UpcomingBill
	MonthlyTarget    = ledger.MonthlyTarget
	CategorySpending = ledger.CategorySpending
	MonthlySpending  = ledger.MonthlySpending
	CurrencyTotal    = ledger.CurrencyTotal
	MonthSummary     = ledger.MonthSummary
	BillSummary      = ledger.BillSummary
	Summary          = ledger.Summary
	AuditEvent       = ledger.AuditEvent
)

const (
	CodeValidationFailed     = ledger.CodeValidationFailed
	CodeStaleVersion         = ledger.CodeStaleVersion
	CodeIdempotencyKeyReused = ledger.CodeIdempotencyKeyReused
	CodeArchivedWallet       = ledger.CodeArchivedWallet
	CodeRateRequired         = ledger.CodeRateRequired
	CodeDuplicateName        = ledger.CodeDuplicateName
	CodeAlreadySettled       = ledger.CodeAlreadySettled
	CodeNotCorrectable       = ledger.CodeNotCorrectable
	CodeNotFound             = ledger.CodeNotFound
	CodeUnauthenticated      = ledger.CodeUnauthenticated
	MaxScheduleBackfillDays  = ledger.MaxScheduleBackfillDays
)

var (
	ErrInvalid              = ledger.ErrInvalid
	ErrConflict             = ledger.ErrConflict
	ErrNotFound             = ledger.ErrNotFound
	ErrUnauthorized         = ledger.ErrUnauthorized
	ErrStaleVersion         = ledger.ErrStaleVersion
	ErrIdempotencyKeyReused = ledger.ErrIdempotencyKeyReused
	ErrRateRequired         = ledger.ErrRateRequired
	ErrArchivedWallet       = ledger.ErrArchivedWallet
	ErrAlreadySettled       = ledger.ErrAlreadySettled
	ErrNotCorrectable       = ledger.ErrNotCorrectable
	ErrDuplicateName        = ledger.ErrDuplicateName
	NormalizeEmail          = ledger.NormalizeEmail
	OccurrenceDate          = ledger.OccurrenceDate
)
