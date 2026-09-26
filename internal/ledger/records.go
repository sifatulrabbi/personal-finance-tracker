// Package ledger holds the household's records and the pure rules about them: which inputs are
// valid, which balance effects a record has, how corrections, voids, adjustments, and bill payments
// behave, how recurring dates are generated, and how monthly spending is summed. It never touches
// storage, the clock, or a transport; callers load the records a rule needs and pass them in.
//
// The record structs below are also the JSON wire contract and, for transactions and schedules,
// the stored revision payload format, so their field names and tags must not change casually.
package ledger

import "encoding/json"

type User struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

type WalletInput struct {
	Name           string `json:"name"`
	Type           string `json:"type"`
	CardType       string `json:"card_type"`
	Currency       string `json:"currency"`
	Details        string `json:"details"`
	OpeningBalance string `json:"opening_balance"`
	CreditLimit    string `json:"credit_limit"`
	// BankWalletID links a debit card to the bank wallet it draws from; required for new debit
	// cards and not allowed on other wallets. See docs/adr/0011-debit-cards-view-a-bank-wallet.md.
	BankWalletID string `json:"bank_wallet_id,omitempty"`
	// OpeningBalanceFormula is the calculation that gave OpeningBalance, kept on the opening
	// record as its amount_formula (ADR 0014).
	OpeningBalanceFormula string `json:"opening_balance_formula,omitempty"`
}

type Wallet struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Type            string `json:"type"`
	CardType        string `json:"card_type"`
	Currency        string `json:"currency"`
	Details         string `json:"details"`
	CreditLimit     string `json:"credit_limit"`
	BankWalletID    string `json:"bank_wallet_id,omitempty"`
	Balance         string `json:"balance"`
	Debt            string `json:"debt,omitempty"`
	AvailableCredit string `json:"available_credit,omitempty"`
	Archived        bool   `json:"archived"`
	// Version guards metadata edits (name, details, credit limit, archive). BalanceVersion changes
	// with every balance effect and guards adjustments.
	Version        int `json:"version"`
	BalanceVersion int `json:"balance_version"`
	// BalanceMinor is the signed balance of the wallet's own entries in minor units (negative for
	// credit-card debt). It is never part of the JSON contract.
	BalanceMinor int64 `json:"-"`
}

type TransactionInput struct {
	CategoryID     string `json:"category_id,omitempty"`
	Kind           string `json:"kind"`
	WalletID       string `json:"wallet_id"`
	ToWalletID     string `json:"to_wallet_id,omitempty"`
	Amount         string `json:"amount"`
	ReceivedAmount string `json:"received_amount,omitempty"`
	Rate           string `json:"rate,omitempty"`
	Date           string `json:"date"`
	Note           string `json:"note"`
	Reason         string `json:"reason"`
	// AmountFormula and ReceivedAmountFormula are the optional calculations that gave Amount and
	// ReceivedAmount. Each is kept in canonical form only when it equals its amount (ADR 0014).
	AmountFormula         string `json:"amount_formula,omitempty"`
	ReceivedAmountFormula string `json:"received_amount_formula,omitempty"`
}

// Transaction is one revision of a record. Stored revision payloads are this struct marshaled.
type Transaction struct {
	TransactionInput
	ID         string `json:"id"`
	Version    int    `json:"version"`
	Voided     bool   `json:"voided"`
	BDTAmount  string `json:"bdt_amount"`
	ActorEmail string `json:"actor_email"`
	CreatedAt  string `json:"created_at"`
	// BalanceFormula is the calculation that gave a balance adjustment's target balance. An
	// adjustment's amount is the difference, so its formula is kept apart from amount_formula.
	BalanceFormula string `json:"balance_formula,omitempty"`
}

type Settings struct {
	Rate            string `json:"rate"`
	Version         int    `json:"version"`
	Timezone        string `json:"timezone"`
	DefaultCurrency string `json:"default_currency"`
}

type CategoryInput struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type Category struct {
	CategoryInput
	ID string `json:"id"`
}

// ScheduleInput is also the stored schedule payload.
type ScheduleInput struct {
	CategoryID string `json:"category_id,omitempty"`
	Name       string `json:"name"`
	WalletID   string `json:"wallet_id"`
	Amount     string `json:"amount"`
	StartDate  string `json:"start_date"`
	EndDate    string `json:"end_date,omitempty"`
	Frequency  string `json:"frequency"`
	Note       string `json:"note"`
}

type Schedule struct {
	ScheduleInput
	ID      string `json:"id"`
	Version int    `json:"version"`
	Active  bool   `json:"active"`
}

type Bill struct {
	CategoryID    string `json:"category_id"`
	ID            string `json:"id"`
	ScheduleID    string `json:"schedule_id"`
	DueDate       string `json:"due_date"`
	WalletID      string `json:"wallet_id"`
	Amount        string `json:"amount"`
	Name          string `json:"name"`
	Note          string `json:"note"`
	Status        string `json:"status"`
	TransactionID string `json:"transaction_id,omitempty"`
}

type PaymentInput struct {
	Amount   string `json:"amount"`
	WalletID string `json:"wallet_id"`
	Date     string `json:"date"`
	Note     string `json:"note"`
	Rate     string `json:"rate"`
	// AmountFormula is the calculation that gave Amount; it becomes the expense's amount_formula.
	AmountFormula string `json:"amount_formula,omitempty"`
}

// UpcomingBill is a future occurrence computed from an active schedule. It is not stored and has
// no id until it comes due.
type UpcomingBill struct {
	ScheduleID string `json:"schedule_id"`
	DueDate    string `json:"due_date"`
	WalletID   string `json:"wallet_id"`
	Amount     string `json:"amount"`
	Name       string `json:"name"`
	Note       string `json:"note"`
	CategoryID string `json:"category_id"`
}

// MonthlyTarget is a month's own saved target or, when it has none, the latest earlier saved one.
// InheritedFrom names the month the amount came from when it is not the month's own. A month
// without its own target reports version 1; its first explicit target is saved as version 2.
type MonthlyTarget struct {
	Amount        string `json:"amount"`
	Version       int    `json:"version"`
	InheritedFrom string `json:"inherited_from,omitempty"`
}

type CategorySpending struct {
	CategoryID string `json:"category_id"`
	Name       string `json:"name"`
	Spent      string `json:"spent"`
	Percentage string `json:"percentage"`
}

type MonthlySpending struct {
	Month      string             `json:"month"`
	Spent      string             `json:"spent"`
	Target     MonthlyTarget      `json:"target"`
	Categories []CategorySpending `json:"categories"`
}

type CurrencyTotal struct {
	Currency        string `json:"currency"`
	Cash            string `json:"cash"`
	CardDebt        string `json:"card_debt"`
	AvailableCredit string `json:"available_credit"`
}

type MonthSummary struct {
	Month  string        `json:"month"`
	Spent  string        `json:"spent"`
	Target MonthlyTarget `json:"target"`
}

type BillSummary struct {
	DueCount      int    `json:"due_count"`
	OldestDueDate string `json:"oldest_due_date,omitempty"`
	NextDueDate   string `json:"next_due_date,omitempty"`
}

// Summary is the home screen in one read. See docs/api.md for each figure's definition.
type Summary struct {
	Today            string          `json:"today"`
	Totals           []CurrencyTotal `json:"totals"`
	Month            MonthSummary    `json:"month"`
	Bills            BillSummary     `json:"bills"`
	Recent           []Transaction   `json:"recent"`
	LegacyDebitCards int             `json:"legacy_debit_cards"`
}

type AuditEvent struct {
	ID         int64           `json:"id"`
	ActorEmail string          `json:"actor_email"`
	EntityID   string          `json:"entity_id"`
	Action     string          `json:"action"`
	Before     json.RawMessage `json:"before"`
	After      json.RawMessage `json:"after"`
	CreatedAt  string          `json:"created_at"`
}
