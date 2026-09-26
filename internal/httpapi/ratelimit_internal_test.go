package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http/httptest"
	"net/netip"
	"testing"
)

// Regression (S2): once 1,024 addresses were tracked, every new address was refused, so a spray of
// addresses locked the household out. A full table now forgets its oldest entry instead.
func TestAFullTrackingTableNeverRefusesEveryone(t *testing.T) {
	s := timingServer(t)
	// A fast comparison keeps thousands of attempts quick; the limiter is what is under test.
	s.compare = func(hash, password []byte) error {
		if string(password) == "correct horse battery" {
			return nil
		}
		return errors.New("mismatch")
	}
	h := s.handler()
	login := func(remote, email, password string) int {
		body, _ := json.Marshal(map[string]string{"email": email, "password": password})
		r := httptest.NewRequest("POST", "http://localhost:8080/api/v1/login", bytes.NewReader(body))
		r.RemoteAddr = remote
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-CSRF-Protection", "1")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w.Code
	}
	spray := addressTableSize + 500
	for i := 0; i < spray; i++ {
		addr := netip.AddrFrom4([4]byte{100, byte(64 + i>>16), byte(i >> 8), byte(i)})
		if status := login(netip.AddrPortFrom(addr, 1000).String(), fmt.Sprintf("spray%d@example.test", i), "wrong"); status != 401 {
			t.Fatalf("spray %d: %d", i, status)
		}
	}
	if n := s.limiter.addresses.len(); n > addressTableSize {
		t.Fatalf("address table grew to %d", n)
	}
	if n := s.limiter.unknown.len(); n > unknownAccountTableSize {
		t.Fatalf("unknown-account table grew to %d", n)
	}
	if status := login("198.51.100.9:1000", "low@example.test", "correct horse battery"); status != 200 {
		t.Fatalf("household member after a spray: %d", status)
	}
	if status := login("198.51.100.10:1000", "nobody@example.test", "wrong"); status != 401 {
		t.Fatalf("new address after a spray: %d", status)
	}
}
