package ledger

import (
	"sort"
	"strings"

	"simply-finance/internal/money"
)

// Effect is one balance change. WalletID is the ledger wallet (a linked debit card's bank); Field
// names the input that selected it, for error reporting.
type Effect struct {
	WalletID string
	Delta    int64
	Field    string
}

// ResolveCategory applies the category rules that need no stored data: only income and expenses
// have a category, and an omitted one is the kind's Others. The caller still checks that the
// returned ID names a stored category of the kind (see CategoryMissing).
func ResolveCategory(kind, categoryID string) (string, error) {
	if kind != "income" && kind != "expense" {
		if categoryID != "" {
			return "", Invalid("category_id", "Only income and expenses have a category.")
		}
		return "", nil
	}
	if categoryID == "" {
		categoryID = "others-" + kind
	}
	return categoryID, nil
}

// CategoryMissing is the error for a category ID that names no stored category of the kind.
func CategoryMissing(kind string) error {
	return Invalid("category_id", "Choose an existing "+kind+" category.")
}

// DefaultCategory resolves a legacy income or expense stored without a category to its Others,
// without changing the stored payload (ADR 0005).
func DefaultCategory(r *Transaction) {
	if r.CategoryID == "" && (r.Kind == "income" || r.Kind == "expense") {
		r.CategoryID = "others-" + r.Kind
	}
}

// RecordFacts are the stored records an income, expense, or transfer names, loaded by the caller.
// A nil wallet was not found.
type RecordFacts struct {
	// CategoryFound reports whether ResolveCategory's ID names a stored category of the kind.
	CategoryFound bool
	From          *Wallet // the wallet_id wallet
	To            *Wallet // the to_wallet_id wallet; only read for transfers
	// DefaultRate is the settings rate, "" when none is set.
	DefaultRate string
}

// PrepareRecord validates a new or corrected income, expense, or transfer and computes its stored
// revision and balance effects. Checks run in a fixed order, so a request with several faults
// always reports the same one first.
func PrepareRecord(in TransactionInput, f RecordFacts) (Transaction, []Effect, error) {
	r := Transaction{TransactionInput: in}
	if in.Kind != "income" && in.Kind != "expense" && in.Kind != "transfer" {
		return r, nil, Invalid("kind", "Choose income, expense, or transfer.")
	}
	cid, err := ResolveCategory(in.Kind, in.CategoryID)
	if err != nil {
		return r, nil, err
	}
	if cid != "" && !f.CategoryFound {
		return r, nil, CategoryMissing(in.Kind)
	}
	r.CategoryID = cid
	if !ValidDate(in.Date) {
		return r, nil, Invalid("date", "Enter a date as YYYY-MM-DD.")
	}
	if len(in.Note) > 2000 {
		return r, nil, Invalid("note", "Keep the note to at most 2,000 bytes.")
	}
	if len(in.Reason) > 500 {
		return r, nil, Invalid("reason", "Keep the reason to at most 500 bytes.")
	}
	if f.From == nil {
		return r, nil, WalletNotFound("wallet_id", ErrNotFound)
	}
	w := *f.From
	amount, err := money.ParseMoney(in.Amount)
	if err != nil || amount <= 0 {
		return r, nil, Invalid("amount", "Enter a positive amount with at most two decimal places.")
	}
	r.Amount = money.FormatMoney(amount)
	var to Wallet
	if in.Kind == "transfer" {
		if in.ToWalletID == w.ID {
			return r, nil, Invalid("to_wallet_id", "Choose a different wallet to transfer to.")
		}
		if f.To == nil {
			return r, nil, WalletNotFound("to_wallet_id", ErrNotFound)
		}
		to = *f.To
		if to.LedgerID() == w.LedgerID() {
			return r, nil, Invalid("to_wallet_id", "A debit card and its bank wallet hold the same money. Choose a different wallet to transfer to.")
		}
	} else if in.ToWalletID != "" {
		return r, nil, Invalid("to_wallet_id", "Only transfers have a destination wallet.")
	} else if in.ReceivedAmount != "" {
		return r, nil, Invalid("received_amount", "Only transfers have a received amount.")
	}
	rate, err := recordRate(in, w, to, f.DefaultRate)
	if err != nil {
		return r, nil, err
	}
	if rate > 0 {
		r.Rate = money.FormatRate(rate)
	}
	bdt := amount
	if w.Currency == "USD" && rate > 0 {
		bdt, err = money.Convert(amount, rate, "USD")
		if err != nil {
			return r, nil, Invalid("amount", "This amount is larger than the supported limit at this rate.")
		}
	}
	r.BDTAmount = money.FormatMoney(bdt)
	if in.Kind != "transfer" {
		delta := amount
		if in.Kind == "expense" {
			delta = -amount
		}
		return r, []Effect{{w.LedgerID(), delta, "wallet_id"}}, nil
	}
	received, err := receivedAmount(in, amount, rate, w, to)
	if err != nil {
		return r, nil, err
	}
	r.ReceivedAmount = money.FormatMoney(received)
	// Without a rate, a USD transfer's BDT value is known only when BDT is received.
	if w.Currency == "USD" && rate == 0 {
		r.BDTAmount = ""
		if to.Currency == "BDT" {
			r.BDTAmount = r.ReceivedAmount
		}
	}
	return r, []Effect{{w.LedgerID(), -amount, "wallet_id"}, {to.LedgerID(), received, "to_wallet_id"}}, nil
}

// recordRate selects a record's rate. A rate is required only when a value must be converted: a
// USD income or expense needs its BDT value, and a cross-currency transfer without a received
// amount derives it from the rate. Any other USD record snapshots the default rate when one is
// set, as a reference. Zero means no rate.
func recordRate(in TransactionInput, from, to Wallet, defaultRate string) (int64, error) {
	if in.Rate != "" {
		rate, err := money.ParseRate(in.Rate)
		if err != nil {
			return 0, Invalid("rate", "Enter a positive rate with at most six decimal places.")
		}
		return rate, nil
	}
	if from.Currency != "USD" && to.Currency != "USD" {
		return 0, nil
	}
	if defaultRate != "" {
		return money.ParseRate(defaultRate)
	}
	needsRate := (in.Kind != "transfer" && from.Currency == "USD") || (in.Kind == "transfer" && to.Currency != from.Currency && in.ReceivedAmount == "")
	if needsRate {
		return 0, ErrRateRequired
	}
	return 0, nil
}

// receivedAmount is what a transfer adds to its destination: the entered received amount, or the
// sent amount converted at the rate across currencies. Same-currency transfers receive exactly the
// amount sent.
func receivedAmount(in TransactionInput, amount, rate int64, from, to Wallet) (int64, error) {
	received := amount
	var err error
	if in.ReceivedAmount != "" {
		received, err = money.ParseMoney(in.ReceivedAmount)
		if err != nil || received <= 0 {
			return 0, Invalid("received_amount", "Enter a positive received amount with at most two decimal places.")
		}
	} else if to.Currency != from.Currency {
		received, err = money.Convert(amount, rate, from.Currency)
		if err != nil || received <= 0 {
			return 0, Invalid("received_amount", "Enter the received amount; it cannot be derived from this amount and rate.")
		}
	}
	if to.Currency == from.Currency && received != amount {
		return 0, Invalid("received_amount", "A transfer between wallets of the same currency must receive the amount sent.")
	}
	return received, nil
}

// CheckNamedWallets applies the rules about which wallets a record may newly name, for a new
// record (old nil) or a correction. from and to are the wallets in.WalletID and in.ToWalletID
// name (nil when the slot is empty or the wallet is missing). A wallet already named in the same
// slot stays allowed, so repairs of existing records keep working. An archived wallet cannot be
// newly named. A legacy unlinked debit card cannot newly take income, expenses, or incoming
// transfers; transfers out of it stay allowed so its balance can be drained.
func CheckNamedWallets(in TransactionInput, old *Transaction, from, to *Wallet) error {
	slots := []struct {
		field, id, before string
		wallet            *Wallet
	}{{"wallet_id", in.WalletID, "", from}, {"to_wallet_id", in.ToWalletID, "", to}}
	if old != nil {
		slots[0].before, slots[1].before = old.WalletID, old.ToWalletID
	}
	for _, slot := range slots {
		if slot.id == "" || (old != nil && slot.id == slot.before) {
			continue
		}
		if slot.wallet == nil {
			return WalletNotFound(slot.field, ErrNotFound)
		}
		if slot.wallet.Archived {
			return Archived(slot.field, "This wallet is archived. Choose an active wallet.")
		}
		if slot.wallet.LegacyDebit() && (slot.field == "to_wallet_id" || in.Kind != "transfer") {
			return Invalid(slot.field, ErrLegacyDebit)
		}
	}
	return nil
}

// BalanceChange is a wallet whose balance a write moves, with the input field that named it.
type BalanceChange struct {
	WalletID string
	Field    string
}

// BalanceChanges lists, sorted by wallet ID, the wallets whose balance moves when a record's
// effects change from before to after. A wallet the corrected record no longer names is not
// listed: moving a record off a wallet is an explicit repair, like a void. Field is "wallet_id"
// when no effect of after names the wallet's field.
func BalanceChanges(before, after []Effect) []BalanceChange {
	net := map[string]int64{}
	fields := map[string]string{}
	for _, ef := range after {
		net[ef.WalletID] += ef.Delta
		if fields[ef.WalletID] == "" {
			fields[ef.WalletID] = ef.Field
		}
	}
	for _, ef := range before {
		if _, named := net[ef.WalletID]; named {
			net[ef.WalletID] -= ef.Delta
		}
	}
	out := []BalanceChange{}
	for wid, delta := range net {
		if delta != 0 {
			field := fields[wid]
			if field == "" {
				field = "wallet_id"
			}
			out = append(out, BalanceChange{wid, field})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].WalletID < out[j].WalletID })
	return out
}

// Messages for an archived wallet whose balance a write would move.
const (
	ArchivedNewRecord  = "This wallet is archived. Choose an active wallet."
	ArchivedCorrection = "This correction would change an archived wallet's balance. Void the record or unarchive the wallet first."
)

// CheckBalance refuses a wallet balance beyond the supported limit.
func CheckBalance(balance int64) error {
	if balance > money.MaxMoney || balance < -money.MaxMoney {
		return ErrBalanceLimit
	}
	return nil
}

// CheckRevisable applies the rules every correction and void must pass before its content is read.
// Reconciliation records are final at every version, so that check precedes the stale check.
func CheckRevisable(old Transaction, version int, void bool, reason string) error {
	if old.Kind == "opening" || old.Kind == "adjustment" {
		return ErrNotCorrectable
	}
	if old.Version != version {
		return ErrStaleVersion
	}
	if old.Voided {
		return ErrVoided
	}
	if void && strings.TrimSpace(reason) == "" {
		return Invalid("reason", "Enter a reason for voiding this record.")
	}
	if len(reason) > 500 {
		return Invalid("reason", "Keep the reason to at most 500 bytes.")
	}
	return nil
}

// CorrectionInput fills a correction's omitted fields from the record it corrects, where empty is
// not itself a valid choice: the rate and the category. A record's kind cannot change.
func CorrectionInput(old Transaction, in TransactionInput) (TransactionInput, error) {
	if in.Rate == "" {
		in.Rate = old.Rate
	}
	if in.CategoryID == "" {
		in.CategoryID = old.CategoryID
	}
	if in.Kind != old.Kind {
		return in, Invalid("kind", "A record's kind cannot change. Void it and record a new one.")
	}
	return in, nil
}

// Void is the revision that voids old: its content is kept, with the reason and the voided flag.
func Void(old Transaction, reason string) Transaction {
	old.Reason = reason
	old.Voided = true
	return old
}
