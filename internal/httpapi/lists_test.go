package httpapi_test

import (
	"encoding/json"
	"fmt"
	"net/url"
	"simply-finance/internal/app"
	"simply-finance/internal/ledger"
	"testing"
)

// Offset lists keep answering a bare array; a request with page=cursor, a cursor, or a filter gets
// {"items":[...],"next_cursor":...} instead.
func TestTransactionListCursorPagesAndFilters(t *testing.T) {
	h := newHousehold(t)
	var bank, cash, card ledger.Wallet
	h.me.ok("POST", "/wallets", ledger.WalletInput{Name: "Bank", Type: "bank", OpeningBalance: "1000"}, "bank", &bank)
	h.me.ok("POST", "/wallets", ledger.WalletInput{Name: "Cash", Type: "physical"}, "cash", &cash)
	h.me.ok("POST", "/wallets", ledger.WalletInput{Name: "Debit", Type: "card", CardType: "debit", BankWalletID: bank.ID}, "card", &card)
	for i := 0; i < 5; i++ {
		h.me.ok("POST", "/transactions", ledger.TransactionInput{Kind: "expense", WalletID: card.ID, Amount: "1", Date: fmt.Sprintf("2026-09-0%d", i+1)}, fmt.Sprint("spend-", i), nil)
	}
	var voided ledger.Transaction
	h.me.ok("POST", "/transactions", ledger.TransactionInput{Kind: "expense", WalletID: cash.ID, Amount: "2", Date: "2026-09-10"}, "mistake", &voided)
	h.me.ok("POST", "/transactions/"+voided.ID+"/void", map[string]any{"version": 1, "reason": "Typo"}, "void", nil)

	var legacy []ledger.Transaction
	h.me.ok("GET", "/transactions?limit=3&offset=1", nil, "", &legacy)
	if len(legacy) != 3 {
		t.Fatalf("offset list: %+v", legacy)
	}

	var first, second app.TransactionPage
	h.spouse.ok("GET", "/transactions?wallet_id="+bank.ID+"&limit=4", nil, "", &first)
	if len(first.Items) != 4 || first.NextCursor == nil || first.Items[0].Kind != "opening" || first.Items[1].WalletID != card.ID {
		t.Fatalf("first page: %+v", first)
	}
	h.spouse.ok("GET", "/transactions?wallet_id="+bank.ID+"&limit=4&cursor="+url.QueryEscape(*first.NextCursor), nil, "", &second)
	if len(second.Items) != 2 || second.NextCursor != nil || second.Items[1].Date != "2026-09-01" {
		t.Fatalf("second page: %+v", second)
	}
	status, raw := h.me.do("GET", "/transactions?wallet_id="+bank.ID+"&limit=4&cursor="+url.QueryEscape(*first.NextCursor), nil, "")
	var shape map[string]json.RawMessage
	if status != 200 || json.Unmarshal(raw, &shape) != nil || string(shape["next_cursor"]) != "null" {
		t.Fatalf("last page must carry next_cursor null: %d %s", status, raw)
	}

	var all app.TransactionPage
	h.me.ok("GET", "/transactions?page=cursor", nil, "", &all)
	if len(all.Items) != 7 {
		t.Fatalf("voided records are left out by default: %+v", all.Items)
	}
	h.me.ok("GET", "/transactions?page=cursor&include_voided=true&kind=expense&from=2026-09-05&to=2026-09-30", nil, "", &all)
	if len(all.Items) != 2 || !all.Items[0].Voided || all.Items[1].Date != "2026-09-05" {
		t.Fatalf("filtered: %+v", all.Items)
	}
	for query, field := range map[string]string{
		"page=cursor&offset=10":         "offset",
		"page=next":                     "page",
		"cursor=not-a-cursor!":          "cursor",
		"include_voided=yes":            "include_voided",
		"kind=gift":                     "kind",
		"from=2026-09-10&to=2026-09-01": "to",
		"page=cursor&limit=0":           "limit",
	} {
		env := h.me.fails("GET", "/transactions?"+query, nil, "", 400, "validation_failed")
		if env.Error.Field != field {
			t.Errorf("%s: field %q, want %q", query, env.Error.Field, field)
		}
	}
}

func TestAuditListCursorPages(t *testing.T) {
	h := newHousehold(t)
	for i := 0; i < 3; i++ {
		h.me.ok("POST", "/wallets", ledger.WalletInput{Name: fmt.Sprint("Wallet ", i), Type: "physical"}, fmt.Sprint("wallet-", i), nil)
	}
	var legacy []ledger.AuditEvent
	h.me.ok("GET", "/audit?limit=2", nil, "", &legacy)
	var first, second app.AuditPage
	h.me.ok("GET", "/audit?page=cursor&limit=2", nil, "", &first)
	if len(legacy) != 2 || len(first.Items) != 2 || first.Items[0].ID != legacy[0].ID || first.NextCursor == nil {
		t.Fatalf("first page: %+v, offset list %+v", first, legacy)
	}
	h.me.ok("GET", "/audit?limit=2&cursor="+url.QueryEscape(*first.NextCursor), nil, "", &second)
	if len(second.Items) != 1 || second.NextCursor != nil || second.Items[0].ID >= first.Items[1].ID {
		t.Fatalf("second page: %+v", second)
	}
}
