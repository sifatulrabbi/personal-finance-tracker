package httpapi_test

import (
	"bytes"
	"encoding/json"
	"golang.org/x/crypto/bcrypt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"path/filepath"
	"simply-finance/internal/finance"
	"simply-finance/internal/httpapi"
	"testing"
	"time"
)

func credentials(t *testing.T) []httpapi.Credential {
	t.Helper()
	h, e := bcrypt.GenerateFromPassword([]byte("correct horse battery"), 10)
	if e != nil {
		t.Fatal(e)
	}
	return []httpapi.Credential{{Email: "sifatul@example.test", PasswordHash: string(h), Name: "Sifatul"}, {Email: "wife@example.test", PasswordHash: string(h), Name: "Wife"}}
}
func request(t *testing.T, c *http.Client, method, url string, body any, key string) (int, []byte) {
	t.Helper()
	b, e := json.Marshal(body)
	if e != nil {
		t.Fatal(e)
	}
	r, e := http.NewRequest(method, url, bytes.NewReader(b))
	if e != nil {
		t.Fatal(e)
	}
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("X-CSRF-Protection", "1")
	if key != "" {
		r.Header.Set("Idempotency-Key", key)
	}
	res, e := c.Do(r)
	if e != nil {
		t.Fatal(e)
	}
	defer res.Body.Close()
	data, e := io.ReadAll(res.Body)
	if e != nil {
		t.Fatal(e)
	}
	return res.StatusCode, data
}
func TestAuthenticatedHouseholdHTTPWorkflow(t *testing.T) {
	s, e := openPrepared(t, filepath.Join(t.TempDir(), "http.sqlite"), time.Now)
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	h, e := httpapi.New(s, httpapi.Config{Users: credentials(t), Origin: "http://localhost:8080", InsecureCookies: true})
	if e != nil {
		t.Fatal(e)
	}
	server := httptest.NewServer(h)
	defer server.Close()
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}
	status, _ := request(t, c, "GET", server.URL+"/api/v1/wallets", nil, "")
	if status != 401 {
		t.Fatalf("anonymous %d", status)
	}
	status, _ = request(t, c, "POST", server.URL+"/api/v1/login", map[string]string{"email": "sifatul@example.test", "password": "wrong"}, "")
	if status != 401 {
		t.Fatalf("bad password %d", status)
	}
	status, body := request(t, c, "POST", server.URL+"/api/v1/login", map[string]string{"email": "sifatul@example.test", "password": "correct horse battery"}, "")
	if status != 200 {
		t.Fatalf("login %d %s", status, body)
	}
	status, body = request(t, c, "POST", server.URL+"/api/v1/wallets", finance.WalletInput{Name: "Cash", Type: "physical", OpeningBalance: "1000"}, "create-cash")
	if status != 200 {
		t.Fatalf("wallet %d %s", status, body)
	}
	var w finance.Wallet
	json.Unmarshal(body, &w)
	status, body = request(t, c, "POST", server.URL+"/api/v1/transactions", finance.TransactionInput{Kind: "expense", WalletID: w.ID, Amount: "100", Date: "2026-09-14"}, "expense")
	if status != 200 {
		t.Fatalf("expense %d %s", status, body)
	}
	var r finance.Transaction
	json.Unmarshal(body, &r)
	if r.ActorEmail != "sifatul@example.test" {
		t.Fatal(r)
	}
	status, _ = request(t, c, "POST", server.URL+"/api/v1/logout", nil, "")
	if status != 200 {
		t.Fatal(status)
	}
	status, _ = request(t, c, "GET", server.URL+"/api/v1/wallets", nil, "")
	if status != 401 {
		t.Fatal(status)
	}
	status, _ = request(t, c, "POST", server.URL+"/api/v1/login", map[string]string{"email": "wife@example.test", "password": "correct horse battery"}, "")
	if status != 200 {
		t.Fatal(status)
	}
	status, body = request(t, c, "GET", server.URL+"/api/v1/wallets", nil, "")
	var ws []finance.Wallet
	json.Unmarshal(body, &ws)
	if status != 200 || len(ws) != 1 || ws[0].Balance != "900.00" {
		t.Fatalf("shared %d %s", status, body)
	}
}
func TestSessionRevocationAndRequestGuards(t *testing.T) {
	s, e := openPrepared(t, filepath.Join(t.TempDir(), "auth.sqlite"), time.Now)
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	users := credentials(t)
	config := httpapi.Config{Users: users, Origin: "https://finance.example.test"}
	handler, e := httpapi.New(s, config)
	if e != nil {
		t.Fatal(e)
	}
	login := httptest.NewRequest("POST", "https://finance.example.test/api/v1/login", bytes.NewBufferString(`{"email":"sifatul@example.test","password":"correct horse battery"}`))
	login.Header.Set("Content-Type", "application/json")
	login.Header.Set("X-CSRF-Protection", "1")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, login)
	if rec.Code != 200 {
		t.Fatalf("login %d %s", rec.Code, rec.Body)
	}
	cookie := rec.Result().Cookies()[0]
	if !cookie.Secure || !cookie.HttpOnly || cookie.SameSite != http.SameSiteStrictMode {
		t.Fatal(cookie)
	}
	check := func(h http.Handler, want int) {
		t.Helper()
		r := httptest.NewRequest("GET", "https://finance.example.test/api/v1/me", nil)
		r.AddCookie(cookie)
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, r)
		if rr.Code != want {
			t.Fatalf("me: %d want %d", rr.Code, want)
		}
	}
	check(handler, 200)
	for _, tc := range []struct {
		body, origin, csrf string
		want               int
	}{{`{"name":"Cash","type":"physical"}`, "https://evil.test", "1", 403}, {`{"name":"Cash","type":"physical"}`, "", "", 403}, {`{"name":"Cash","type":"physical","actor_email":"wife@example.test"}`, "", "1", 400}, {`null`, "", "1", 400}, {`{} {}`, "", "1", 400}} {
		r := httptest.NewRequest("POST", "https://finance.example.test/api/v1/wallets", bytes.NewBufferString(tc.body))
		r.AddCookie(cookie)
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Origin", tc.origin)
		r.Header.Set("X-CSRF-Protection", tc.csrf)
		r.Header.Set("Idempotency-Key", "guard")
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, r)
		if rr.Code != tc.want {
			t.Fatalf("guard %+v: %d %s", tc, rr.Code, rr.Body)
		}
	}
	config.Users = users[1:]
	removed, e := httpapi.New(s, config)
	if e != nil {
		t.Fatal(e)
	}
	check(removed, 401)
	config.Users = users
	restored, e := httpapi.New(s, config)
	if e != nil {
		t.Fatal(e)
	}
	check(restored, 401)
}

func TestHTTPRatesDebtAndRecurringPaymentLifecycle(t *testing.T) {
	now := func() time.Time { return time.Date(2026, 9, 14, 12, 0, 0, 0, time.UTC) }
	s, err := openPrepared(t, filepath.Join(t.TempDir(), "lifecycle.sqlite"), now)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	h, err := httpapi.New(s, httpapi.Config{Users: credentials(t), Origin: "http://localhost:47831", InsecureCookies: true, Now: now})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(h)
	defer server.Close()
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}
	call := func(method, path string, input any, key string, out any) {
		t.Helper()
		status, body := request(t, c, method, server.URL+"/api/v1"+path, input, key)
		if status != 200 {
			t.Fatalf("%s %s: %d %s", method, path, status, body)
		}
		if out != nil {
			if err := json.Unmarshal(body, out); err != nil {
				t.Fatal(err)
			}
		}
	}
	call("POST", "/login", map[string]string{"email": "wife@example.test", "password": "correct horse battery"}, "", nil)
	var bank, card finance.Wallet
	call("POST", "/wallets", finance.WalletInput{Name: "Bank", Type: "bank", OpeningBalance: "10000"}, "bank", &bank)
	call("POST", "/wallets", finance.WalletInput{Name: "Credit", Type: "card", CardType: "credit", CreditLimit: "50000"}, "card", &card)
	var settings finance.Settings
	call("PUT", "/settings", map[string]any{"version": 1, "rate": "120"}, "rate", &settings)
	if settings.Rate != "120.000000" {
		t.Fatal(settings)
	}
	var purchase finance.Transaction
	call("POST", "/transactions", finance.TransactionInput{Kind: "expense", WalletID: card.ID, Amount: "2000", Date: "2026-09-14"}, "purchase", &purchase)
	call("POST", "/transactions", finance.TransactionInput{Kind: "transfer", WalletID: bank.ID, ToWalletID: card.ID, Amount: "1500", Date: "2026-09-14"}, "repay", nil)
	var schedule finance.Schedule
	call("POST", "/schedules", finance.ScheduleInput{Name: "Wi-Fi", WalletID: bank.ID, Amount: "1000", Frequency: "monthly", StartDate: "2026-09-01"}, "wifi", &schedule)
	var due []finance.Bill
	call("GET", "/bills/due", nil, "", &due)
	if len(due) != 1 {
		t.Fatal(due)
	}
	var payment finance.Transaction
	call("POST", "/bills/"+due[0].ID+"/confirm", finance.PaymentInput{Amount: "1020", Date: "2026-09-14", Note: "Includes charge"}, "confirm", &payment)
	if payment.Amount != "1020.00" || payment.ActorEmail != "wife@example.test" {
		t.Fatal(payment)
	}
	call("POST", "/transactions/"+payment.ID+"/void", map[string]any{"version": 1, "reason": "Wrong payment"}, "void", nil)
	call("GET", "/bills/due", nil, "", &due)
	if len(due) != 1 {
		t.Fatal(due)
	}
	call("POST", "/bills/"+due[0].ID+"/confirm", finance.PaymentInput{Date: "2026-09-14"}, "confirm-again", nil)
	var wallets []finance.Wallet
	call("GET", "/wallets", nil, "", &wallets)
	for _, w := range wallets {
		if w.ID == bank.ID && w.Balance != "7500.00" {
			t.Fatal(w)
		}
		if w.ID == card.ID && (w.Debt != "500.00" || w.AvailableCredit != "49500.00") {
			t.Fatal(w)
		}
	}
	var history []finance.Transaction
	call("GET", "/transactions/"+payment.ID+"/history", nil, "", &history)
	if len(history) != 2 || !history[1].Voided {
		t.Fatal(history)
	}
}
