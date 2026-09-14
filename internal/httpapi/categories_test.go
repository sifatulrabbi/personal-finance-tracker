package httpapi_test

import (
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"path/filepath"
	"simply-finance/internal/finance"
	"simply-finance/internal/httpapi"
	"testing"
	"time"
)

type handlerTransport struct{ handler http.Handler }

func (transport handlerTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	recorder := httptest.NewRecorder()
	transport.handler.ServeHTTP(recorder, request)
	return recorder.Result(), nil
}

func TestCategoryAndMonthlyHTTP(t *testing.T) {
	s, e := openPrepared(t, filepath.Join(t.TempDir(), "http.sqlite"), time.Now)
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	h, e := httpapi.New(s, httpapi.Config{Users: credentials(t), Origin: "http://localhost:8080", InsecureCookies: true})
	if e != nil {
		t.Fatal(e)
	}
	server := struct{ URL string }{URL: "http://localhost:8080"}
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar, Transport: handlerTransport{handler: h}}
	for _, path := range []string{"/categories", "/monthly?month=2026-09"} {
		status, _ := request(t, c, "GET", server.URL+"/api/v1"+path, nil, "")
		if status != 401 {
			t.Fatal(status)
		}
	}
	status, body := request(t, c, "POST", server.URL+"/api/v1/login", map[string]string{"email": "sifatul@example.test", "password": "correct horse battery"}, "")
	if status != 200 {
		t.Fatalf("login %d %s", status, body)
	}
	status, body = request(t, c, "POST", server.URL+"/api/v1/categories", finance.CategoryInput{Name: "Food", Type: "expense"}, "food")
	if status != 200 {
		t.Fatalf("category %d %s", status, body)
	}
	var category finance.Category
	if e = json.Unmarshal(body, &category); e != nil {
		t.Fatal(e)
	}
	status, body = request(t, c, "POST", server.URL+"/api/v1/wallets", finance.WalletInput{Name: "Cash", Type: "physical", OpeningBalance: "1000"}, "wallet")
	if status != 200 {
		t.Fatalf("wallet %d %s", status, body)
	}
	var wallet finance.Wallet
	if e = json.Unmarshal(body, &wallet); e != nil {
		t.Fatal(e)
	}
	status, body = request(t, c, "POST", server.URL+"/api/v1/transactions", finance.TransactionInput{Kind: "expense", WalletID: wallet.ID, Amount: "100", Date: "2026-09-14", CategoryID: category.ID}, "expense")
	if status != 200 {
		t.Fatalf("expense %d %s", status, body)
	}
	status, _ = request(t, c, "POST", server.URL+"/api/v1/transactions", finance.TransactionInput{Kind: "income", WalletID: wallet.ID, Amount: "100", Date: "2026-09-14", CategoryID: category.ID}, "wrong-type")
	if status != 400 {
		t.Fatalf("category type %d", status)
	}
	status, body = request(t, c, "GET", server.URL+"/api/v1/monthly?month=2026-09", nil, "")
	if status != 200 {
		t.Fatalf("monthly %d %s", status, body)
	}
	var monthly finance.MonthlySpending
	if e = json.Unmarshal(body, &monthly); e != nil {
		t.Fatal(e)
	}
	if monthly.Spent != "100.00" {
		t.Fatalf("monthly: %+v", monthly)
	}
	found := false
	for _, row := range monthly.Categories {
		if row.CategoryID == category.ID {
			found = true
			if row.Percentage != "100.00" {
				t.Fatalf("category share: %+v", row)
			}
		}
	}
	if !found {
		t.Fatal("missing expense category")
	}
	status, body = request(t, c, "PUT", server.URL+"/api/v1/monthly/2026-09/target", map[string]any{"amount": "40000", "version": monthly.Target.Version}, "target")
	if status != 200 {
		t.Fatalf("target %d %s", status, body)
	}
	status, _ = request(t, c, "PUT", server.URL+"/api/v1/monthly/2026-09/target", map[string]any{"amount": "50000", "version": monthly.Target.Version}, "stale")
	if status != 409 {
		t.Fatalf("stale target %d", status)
	}
	status, _ = request(t, c, "GET", server.URL+"/api/v1/monthly?month=bad", nil, "")
	if status != 400 {
		t.Fatal(status)
	}
}
