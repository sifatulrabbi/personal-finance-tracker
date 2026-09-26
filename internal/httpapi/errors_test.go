package httpapi_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"path/filepath"
	"simply-finance/internal/apptest"
	"simply-finance/internal/ledger"
	"strings"
	"testing"
	"time"
)

type envelope struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
		Field   string `json:"field"`
	} `json:"error"`
}

type errorClient struct {
	t      *testing.T
	base   string
	client *http.Client
}

// send issues a request and returns the status, headers, and raw body. Headers are the ones a
// well-behaved client sends unless overridden (an empty override value removes the header).
func (c errorClient) send(method, path, body string, headers map[string]string) (int, http.Header, []byte) {
	c.t.Helper()
	r, e := http.NewRequest(method, c.base+path, strings.NewReader(body))
	if e != nil {
		c.t.Fatal(e)
	}
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("X-CSRF-Protection", "1")
	for k, v := range headers {
		if v == "" {
			r.Header.Del(k)
		} else {
			r.Header.Set(k, v)
		}
	}
	res, e := c.client.Do(r)
	if e != nil {
		c.t.Fatal(e)
	}
	defer res.Body.Close()
	data, e := io.ReadAll(res.Body)
	if e != nil {
		c.t.Fatal(e)
	}
	return res.StatusCode, res.Header, data
}

// expect asserts one error response: status, JSON content type, the envelope shape, the code and
// field, a non-empty message, and that the message does not echo the request body.
func (c errorClient) expect(name string, status int, code, field string, gotStatus int, header http.Header, body []byte, sent string) {
	c.t.Helper()
	var env envelope
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.DisallowUnknownFields()
	if e := dec.Decode(&env); e != nil {
		c.t.Errorf("%s: body is not the error envelope: %v %q", name, e, body)
		return
	}
	if gotStatus != status || env.Error.Code != code || env.Error.Field != field || env.Error.Message == "" {
		c.t.Errorf("%s: got %d %+v, want %d %s field=%q", name, gotStatus, env.Error, status, code, field)
	}
	if !strings.HasPrefix(header.Get("Content-Type"), "application/json") {
		c.t.Errorf("%s: content type %q", name, header.Get("Content-Type"))
	}
	if sent != "" && strings.Contains(env.Error.Message, sent) {
		c.t.Errorf("%s: message echoes the request: %q", name, env.Error.Message)
	}
}

func errorServer(t *testing.T) (errorClient, *apptest.Household) {
	t.Helper()
	now := func() time.Time { return time.Date(2026, 9, 14, 12, 0, 0, 0, time.UTC) }
	s, e := openPrepared(t, filepath.Join(t.TempDir(), "errors.sqlite"), now)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { s.Close() })
	h, e := newHandler(s, testConfig{Users: credentials(t), Origin: "http://localhost:47831", InsecureCookies: true, Now: now})
	if e != nil {
		t.Fatal(e)
	}
	server := httptest.NewServer(h)
	t.Cleanup(server.Close)
	jar, _ := cookiejar.New(nil)
	return errorClient{t: t, base: server.URL + "/api/v1", client: &http.Client{Jar: jar}}, s
}

func (c errorClient) login() {
	c.t.Helper()
	if status, _, body := c.send("POST", "/login", `{"email":"sifatul@example.test","password":"correct horse battery"}`, nil); status != 200 {
		c.t.Fatalf("login %d %s", status, body)
	}
}
func (c errorClient) create(path, body, key string, out any) {
	c.t.Helper()
	status, _, data := c.send("POST", path, body, map[string]string{"Idempotency-Key": key})
	if status != 200 {
		c.t.Fatalf("POST %s: %d %s", path, status, data)
	}
	if out != nil {
		if e := json.Unmarshal(data, out); e != nil {
			c.t.Fatal(e)
		}
	}
}

// Regression (S3): 403, 415, 429, unknown routes, and wrong methods answered with plain text or an
// empty body, and every domain failure said only "invalid input". Each error is now one envelope.
func TestEveryAPIErrorUsesTheJSONEnvelope(t *testing.T) {
	c, _ := errorServer(t)
	status, header, body := c.send("GET", "/wallets", "", nil)
	c.expect("anonymous", 401, "unauthenticated", "", status, header, body, "")
	sent := `{"email":"sifatul@example.test","password":"not-the-password"}`
	status, header, body = c.send("POST", "/login", sent, nil)
	c.expect("bad password", 401, "unauthenticated", "", status, header, body, "not-the-password")
	status, header, body = c.send("POST", "/login", `{"email":"sifatul@example.test"}`, map[string]string{"X-CSRF-Protection": ""})
	c.expect("csrf", 403, "forbidden", "", status, header, body, "")
	status, header, body = c.send("POST", "/login", `{"email":"sifatul@example.test"}`, map[string]string{"Origin": "https://evil.test"})
	c.expect("origin", 403, "forbidden", "", status, header, body, "")
	status, header, body = c.send("POST", "/login", `{}`, map[string]string{"Content-Type": "text/plain"})
	c.expect("media type", 415, "unsupported_media_type", "", status, header, body, "")

	c.login()
	status, header, body = c.send("GET", "/nothing-here", "", nil)
	c.expect("unknown route", 404, "not_found", "", status, header, body, "")
	status, header, body = c.send("DELETE", "/wallets", "", nil)
	c.expect("wrong method", 405, "method_not_allowed", "", status, header, body, "")
	if allow := header.Get("Allow"); !strings.Contains(allow, "GET") || !strings.Contains(allow, "POST") {
		t.Errorf("405 Allow header %q", allow)
	}
	status, header, body = c.send("POST", "/wallets", `{"name":"Cash","type":"physical"} {}`, map[string]string{"Idempotency-Key": "two-objects"})
	c.expect("two objects", 400, "validation_failed", "", status, header, body, "")
	status, header, body = c.send("POST", "/wallets", `{"name":7}`, map[string]string{"Idempotency-Key": "wrong-type"})
	c.expect("wrong json type", 400, "validation_failed", "name", status, header, body, "")
	status, header, body = c.send("POST", "/wallets", `{"name":"Cash","type":"physical"}`, nil)
	c.expect("missing key", 400, "validation_failed", "", status, header, body, "")
	status, header, body = c.send("GET", "/transactions?limit=500", "", nil)
	c.expect("limit", 400, "validation_failed", "limit", status, header, body, "")
	status, header, body = c.send("GET", "/transactions/missing/history", "", nil)
	c.expect("missing record", 404, "not_found", "", status, header, body, "")

	var cash, closed, usd ledger.Wallet
	c.create("/wallets", `{"name":"Cash","type":"physical","opening_balance":"1000"}`, "cash", &cash)
	c.create("/wallets", `{"name":"Closed","type":"bank","opening_balance":"50"}`, "closed", &closed)
	c.create("/wallets", `{"name":"Dollars","type":"bank","currency":"USD","opening_balance":"10"}`, "usd", &usd)
	sent = fmt.Sprintf(`{"kind":"expense","wallet_id":%q,"amount":"12.345","date":"2026-09-14"}`, cash.ID)
	status, header, body = c.send("POST", "/transactions", sent, map[string]string{"Idempotency-Key": "bad-amount"})
	c.expect("amount", 400, "validation_failed", "amount", status, header, body, "12.345")
	status, header, body = c.send("POST", "/transactions", fmt.Sprintf(`{"kind":"expense","wallet_id":%q,"amount":"1","date":"2026-09-14"}`, usd.ID), map[string]string{"Idempotency-Key": "no-rate"})
	c.expect("rate", 400, "rate_required", "rate", status, header, body, "")
	status, header, body = c.send("POST", "/transactions", fmt.Sprintf(`{"kind":"expense","wallet_id":%q,"amount":"1","date":"2026-09-14"}`, "no-such-wallet"), map[string]string{"Idempotency-Key": "no-wallet"})
	c.expect("unknown wallet", 404, "not_found", "wallet_id", status, header, body, "")

	var expense ledger.Transaction
	c.create("/transactions", fmt.Sprintf(`{"kind":"expense","wallet_id":%q,"amount":"100","date":"2026-09-14"}`, cash.ID), "expense", &expense)
	edit := fmt.Sprintf(`{"version":1,"kind":"expense","wallet_id":%q,"amount":"90","date":"2026-09-14"}`, cash.ID)
	if status, _, body = c.send("PUT", "/transactions/"+expense.ID, edit, map[string]string{"Idempotency-Key": "edit"}); status != 200 {
		t.Fatalf("edit %d %s", status, body)
	}
	status, header, body = c.send("PUT", "/transactions/"+expense.ID, edit, map[string]string{"Idempotency-Key": "edit-again"})
	c.expect("stale", 409, "stale_version", "version", status, header, body, "")
	status, header, body = c.send("PUT", "/transactions/"+expense.ID, strings.Replace(edit, `"90"`, `"80"`, 1), map[string]string{"Idempotency-Key": "edit"})
	c.expect("key reuse", 409, "idempotency_key_reused", "", status, header, body, "")

	var list []ledger.Transaction
	if status, _, body = c.send("GET", "/transactions", "", nil); status != 200 || json.Unmarshal(body, &list) != nil {
		t.Fatalf("list %d %s", status, body)
	}
	for _, r := range list {
		if r.Kind == "opening" && r.WalletID == cash.ID {
			status, header, body = c.send("POST", "/transactions/"+r.ID+"/void", fmt.Sprintf(`{"version":%d,"reason":"Mistake"}`, r.Version), map[string]string{"Idempotency-Key": "void-opening"})
			c.expect("opening void", 400, "not_correctable", "", status, header, body, "")
		}
	}

	status, header, body = c.send("POST", "/categories", `{"name":"Others","type":"expense"}`, map[string]string{"Idempotency-Key": "dup"})
	c.expect("duplicate category", 409, "duplicate_name", "name", status, header, body, "")

	var schedule ledger.Schedule
	c.create("/schedules", fmt.Sprintf(`{"name":"Wi-Fi","wallet_id":%q,"amount":"10","frequency":"monthly","start_date":"2026-09-01"}`, cash.ID), "wifi", &schedule)
	var due []ledger.Bill
	if status, _, body = c.send("GET", "/bills/due", "", nil); status != 200 || json.Unmarshal(body, &due) != nil || len(due) != 1 {
		t.Fatalf("due %d %s", status, body)
	}
	c.create("/bills/"+due[0].ID+"/skip", `{"reason":"Not owed"}`, "skip", nil)
	status, header, body = c.send("POST", "/bills/"+due[0].ID+"/skip", `{"reason":"Not owed"}`, map[string]string{"Idempotency-Key": "skip-again"})
	c.expect("settled bill", 409, "already_settled", "", status, header, body, "")

	closed.Archived = true
	archive, _ := json.Marshal(closed)
	if status, _, body = c.send("PUT", "/wallets/"+closed.ID, string(archive), map[string]string{"Idempotency-Key": "archive"}); status != 200 {
		t.Fatalf("archive %d %s", status, body)
	}
	status, header, body = c.send("POST", "/transactions", fmt.Sprintf(`{"kind":"expense","wallet_id":%q,"amount":"1","date":"2026-09-14"}`, closed.ID), map[string]string{"Idempotency-Key": "archived"})
	c.expect("archived wallet", 400, "archived_wallet", "wallet_id", status, header, body, "")
}

func TestLoginRateLimitUsesTheJSONEnvelope(t *testing.T) {
	c, _ := errorServer(t)
	var status int
	var header http.Header
	var body []byte
	for i := 0; i < 6; i++ {
		status, header, body = c.send("POST", "/login", `{"email":"sifatul@example.test","password":"wrong"}`, nil)
	}
	c.expect("rate limited", 429, "rate_limited", "", status, header, body, "")
	if header.Get("Retry-After") != "30" {
		t.Errorf("Retry-After %q", header.Get("Retry-After"))
	}
}

func TestServerFailureUsesTheJSONEnvelopeWithoutDetails(t *testing.T) {
	c, s := errorServer(t)
	c.login()
	s.Close()
	status, header, body := c.send("GET", "/wallets", "", nil)
	c.expect("closed database", 500, "internal", "", status, header, body, "")
	if strings.Contains(string(body), "sql") || strings.Contains(string(body), "database") {
		t.Errorf("500 leaks details: %s", body)
	}
}
