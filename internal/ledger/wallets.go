package ledger

import (
	"strings"

	"simply-finance/internal/money"
)

// ErrLegacyDebit is the message for a new balance on a debit card created before bank links.
const ErrLegacyDebit = "This debit card is not linked to a bank wallet, so it takes no new activity. Record it on the bank wallet, or add the card again linked to its bank wallet."

// LedgerID is the wallet whose entries carry this wallet's balance effects: a linked debit card
// posts to its bank wallet; every other wallet, including a legacy unlinked debit card, to itself.
func (w Wallet) LedgerID() string {
	if w.BankWalletID != "" {
		return w.BankWalletID
	}
	return w.ID
}

// LegacyDebit reports a debit card created before bank links existed. It keeps its own recorded
// balance but takes no new balance; see ADR 0011.
func (w Wallet) LegacyDebit() bool { return w.CardType == "debit" && w.BankWalletID == "" }

// SetAmounts fills the wallet's displayed amounts from its credit limit and its own signed balance
// in minor units. A credit card shows its debt and available credit and a zero balance, because
// card debt is not cash. A linked debit card has no entries of its own, so it shows zero.
func (w *Wallet) SetAmounts(limit, balance int64) {
	w.BalanceMinor = balance
	w.CreditLimit = money.FormatMoney(limit)
	w.Balance = money.FormatMoney(balance)
	w.Debt, w.AvailableCredit = "", ""
	if w.CardType == "credit" {
		w.Debt = money.FormatMoney(-balance)
		w.AvailableCredit = money.FormatMoney(limit + balance)
		w.Balance = "0.00"
	}
}

// ValidWalletText checks a wallet's name and details.
func ValidWalletText(name, details string) error {
	if strings.TrimSpace(name) == "" || len(name) > 120 {
		return Invalid("name", "Enter a name of at most 120 bytes.")
	}
	if len(details) > 2000 {
		return Invalid("details", "Keep the details to at most 2,000 bytes.")
	}
	return nil
}

// NewWallet is a validated wallet to create: its input with the currency resolved, its credit
// limit, and the opening balance effect in minor units (negative for credit-card debt).
type NewWallet struct {
	Input         WalletInput
	CreditLimit   int64
	OpeningEffect int64
	// HasOpening is false for a linked debit card, which records no opening balance.
	HasOpening bool
	// OpeningAmount is the opening record's amount as entered, before the credit-card sign.
	OpeningAmount int64
}

// ValidateNewWallet checks a new wallet. bank is the wallet in.BankWalletID names, loaded by the
// caller for a debit card (nil when missing or not asked for).
func ValidateNewWallet(in WalletInput, bank *Wallet) (NewWallet, error) {
	var out NewWallet
	if err := ValidWalletText(in.Name, in.Details); err != nil {
		return out, err
	}
	if in.BankWalletID != "" && in.CardType != "debit" {
		return out, Invalid("bank_wallet_id", "Only debit cards link to a bank wallet.")
	}
	if in.CardType == "debit" {
		if in.BankWalletID == "" {
			return out, Invalid("bank_wallet_id", "Choose the bank wallet this debit card draws from.")
		}
		if bank == nil {
			return out, WalletNotFound("bank_wallet_id", ErrNotFound)
		}
		if bank.Type != "bank" {
			return out, Invalid("bank_wallet_id", "A debit card must link to a bank wallet.")
		}
		if bank.Archived {
			return out, Archived("bank_wallet_id", "This bank wallet is archived. Choose an active one.")
		}
		if in.Currency == "" {
			in.Currency = bank.Currency
		} else if in.Currency != bank.Currency {
			return out, Invalid("currency", "A debit card uses its bank wallet's currency.")
		}
	}
	if in.Currency == "" {
		in.Currency = "BDT"
	}
	if in.Currency != "BDT" && in.Currency != "USD" {
		return out, Invalid("currency", "Choose BDT or USD.")
	}
	if in.Type != "physical" && in.Type != "bank" && in.Type != "digital" && in.Type != "card" {
		return out, Invalid("type", "Choose physical, bank, digital, or card.")
	}
	if in.Type == "card" {
		if in.CardType != "credit" && in.CardType != "debit" {
			return out, Invalid("card_type", "Choose credit or debit for a card.")
		}
	} else if in.CardType != "" {
		return out, Invalid("card_type", "Only card wallets have a card type.")
	}
	opening, limit := int64(0), int64(0)
	var err error
	if in.OpeningBalance != "" {
		opening, err = money.ParseMoney(in.OpeningBalance)
		if err != nil {
			return out, Invalid("opening_balance", "Enter an opening balance with at most two decimal places.")
		}
	}
	if in.CreditLimit != "" {
		limit, err = money.ParseMoney(in.CreditLimit)
		if err != nil || limit < 0 {
			return out, Invalid("credit_limit", "Enter a credit limit of zero or more, with at most two decimal places.")
		}
	}
	if in.CardType != "credit" && limit != 0 {
		return out, Invalid("credit_limit", "Only credit cards have a credit limit.")
	}
	if in.CardType == "debit" && opening != 0 {
		return out, Invalid("opening_balance", "A debit card has no balance of its own. Record the balance on its bank wallet.")
	}
	out = NewWallet{Input: in, CreditLimit: limit, HasOpening: in.CardType != "debit", OpeningAmount: opening, OpeningEffect: opening}
	if in.CardType == "credit" {
		out.OpeningEffect = -opening
	}
	return out, nil
}

// OpeningPayload is the stored revision payload of a wallet's opening balance. It predates the
// Transaction payload shape and has no id, version, or author; the transaction row supplies them.
func OpeningPayload(walletID string, amount int64, date string) map[string]any {
	return map[string]any{"kind": "opening", "wallet_id": walletID, "amount": money.FormatMoney(amount), "date": date}
}

// ValidateWalletUpdate checks an edit of old's metadata and returns the new credit limit. Only the
// name, details, credit limit, and archive status can change.
func ValidateWalletUpdate(old, in Wallet) (int64, error) {
	if old.Version != in.Version {
		return 0, ErrStaleVersion
	}
	if err := ValidWalletText(in.Name, in.Details); err != nil {
		return 0, err
	}
	for _, f := range []struct{ field, got, want string }{{"type", in.Type, old.Type}, {"card_type", in.CardType, old.CardType}, {"currency", in.Currency, old.Currency}, {"bank_wallet_id", in.BankWalletID, old.BankWalletID}} {
		if f.got != f.want {
			return 0, Invalid(f.field, "A wallet's type, card type, currency, and bank link cannot change.")
		}
	}
	limit, err := money.ParseMoney(in.CreditLimit)
	if err != nil || limit < 0 {
		return 0, Invalid("credit_limit", "Enter a credit limit of zero or more, with at most two decimal places.")
	}
	if old.CardType != "credit" && limit != 0 {
		return 0, Invalid("credit_limit", "Only credit cards have a credit limit.")
	}
	return limit, nil
}

// Adjustment returns the balance adjustment record that brings w to target, dated today, and its
// effect. balanceVersion is w's BalanceVersion as read, so the target is refused if any balance
// effect happened since. For a credit card the target is the debt owed.
func Adjustment(w Wallet, balanceVersion int, target, reason, today string) (Transaction, []Effect, error) {
	var r Transaction
	if w.BalanceVersion != balanceVersion {
		return r, nil, ErrStaleVersion
	}
	if w.Archived {
		return r, nil, Archived("", "This wallet is archived. Unarchive it before adjusting its balance.")
	}
	if w.CardType == "debit" && !w.LegacyDebit() {
		return r, nil, Invalid("", "A debit card has no balance of its own. Adjust its bank wallet instead.")
	}
	if strings.TrimSpace(reason) == "" || len(reason) > 500 {
		return r, nil, Invalid("reason", "Enter a reason of at most 500 bytes.")
	}
	entered, err := money.ParseMoney(target)
	if err != nil {
		return r, nil, Invalid("balance", "Enter a balance with at most two decimal places.")
	}
	desired := entered
	if w.CardType == "credit" {
		desired = -desired
	}
	if w.LegacyDebit() && desired != 0 {
		return r, nil, Invalid("balance", "This debit card is not linked to a bank wallet. It can only be adjusted to zero.")
	}
	delta := desired - w.BalanceMinor
	if delta == 0 {
		return r, nil, Invalid("balance", "The wallet already has this balance.")
	}
	if delta > money.MaxMoney || delta < -money.MaxMoney {
		return r, nil, Invalid("balance", "This adjustment is larger than the supported limit.")
	}
	r = Transaction{Version: 1, TransactionInput: TransactionInput{Kind: "adjustment", WalletID: w.ID, Amount: money.FormatMoney(delta), Date: today, Reason: reason, Note: "Balance set to " + money.FormatMoney(entered)}}
	return r, []Effect{{w.ID, delta, "wallet_id"}}, nil
}
