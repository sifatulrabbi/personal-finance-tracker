package httpapi_test

import (
	"simply-finance/internal/ledger"
	"testing"
)

func TestSingleWalletRead(t *testing.T) {
	h := newHousehold(t)
	var created ledger.Wallet
	h.me.ok("POST", "/wallets", ledger.WalletInput{Name: "Cash", Type: "physical", OpeningBalance: "500"}, "cash", &created)
	got := h.spouse.wallet(created.ID)
	if got.ID != created.ID || got.Name != "Cash" || got.Balance != "500.00" {
		t.Fatalf("%+v", got)
	}
	h.me.fails("GET", "/wallets/missing", nil, "", 404, "not_found")
}

// Regression (C7): every expense bumped the wallet's only version, so renaming a wallet while the
// other member recorded an expense failed with a stale version. Metadata edits now check a
// metadata version that spending does not change; adjustments check a separate balance version.
func TestRenameSucceedsWhileTheOtherMemberRecordsAnExpense(t *testing.T) {
	h := newHousehold(t)
	var bank ledger.Wallet
	h.me.ok("POST", "/wallets", ledger.WalletInput{Name: "Bank", Type: "bank", OpeningBalance: "1000"}, "bank", &bank)
	read := h.spouse.wallet(bank.ID)
	h.me.ok("POST", "/transactions", ledger.TransactionInput{Kind: "expense", WalletID: bank.ID, Amount: "100", Date: "2026-09-14"}, "groceries", nil)

	read.Name = "Joint bank"
	var renamed ledger.Wallet
	h.spouse.ok("PUT", "/wallets/"+bank.ID, read, "rename", &renamed)
	if renamed.Name != "Joint bank" || renamed.Balance != "900.00" || renamed.Version != read.Version+1 {
		t.Fatalf("renamed: %+v", renamed)
	}
	// A retry of the same edit sent after a refresh (read-only fields changed) replays, not 409.
	refreshed := h.spouse.wallet(bank.ID)
	refreshed.Version, refreshed.Name = read.Version, "Joint bank"
	h.me.ok("POST", "/transactions", ledger.TransactionInput{Kind: "expense", WalletID: bank.ID, Amount: "1", Date: "2026-09-14"}, "snack", nil)
	refreshed.Balance = h.spouse.wallet(bank.ID).Balance
	h.spouse.ok("PUT", "/wallets/"+bank.ID, refreshed, "rename", nil)

	// The balance version still protects adjustments from a stale balance.
	h.spouse.fails("POST", "/wallets/"+bank.ID+"/adjust", map[string]any{"balance_version": read.BalanceVersion, "balance": "950", "reason": "Statement"}, "stale-adjust", 409, "stale_version")
	current := h.spouse.wallet(bank.ID)
	if current.BalanceVersion <= read.BalanceVersion || current.Version != renamed.Version {
		t.Fatalf("versions: read %+v now %+v", read, current)
	}
	h.spouse.ok("POST", "/wallets/"+bank.ID+"/adjust", map[string]any{"balance_version": current.BalanceVersion, "balance": "950", "reason": "Statement"}, "adjust", nil)
	if w := h.me.wallet(bank.ID); w.Balance != "950.00" || w.Version != renamed.Version {
		t.Fatalf("after adjust: %+v", w)
	}
	// Two metadata edits from the same read still conflict.
	h.me.fails("PUT", "/wallets/"+bank.ID, read, "second-rename", 409, "stale_version")
}
