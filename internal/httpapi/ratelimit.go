package httpapi

import (
	"errors"
	"net/http"
	"net/netip"
	"strings"
	"sync"
	"time"
)

// Login throttling (see docs/adr/0009-login-rate-limiting.md). Failures are counted per client
// address and per account email. After a number of free failures each further attempt waits a
// doubling delay after the latest failure, up to a cap. Failures are forgotten after a quiet hour.
// Successful logins do not count and clear the account's failures.
const (
	addressTableSize        = 4096
	unknownAccountTableSize = 1024
	failureMemory           = time.Hour
)

type backoff struct {
	free      int
	base, max time.Duration
}

var (
	addressBackoff = backoff{free: 20, base: 30 * time.Second, max: 15 * time.Minute}
	accountBackoff = backoff{free: 5, base: 30 * time.Second, max: 15 * time.Minute}
)

type failures struct {
	count int
	last  time.Time
}

// wait returns how long a new attempt must wait, given the recorded failures.
func (b backoff) wait(f *failures, now time.Time) time.Duration {
	if f == nil || f.count < b.free || now.Sub(f.last) >= failureMemory {
		return 0
	}
	d := b.max
	if shift := f.count - b.free; shift < 16 {
		d = min(b.base<<shift, b.max)
	}
	return max(f.last.Add(d).Sub(now), 0)
}

// failureTable is a bounded map. When full it forgets the entry with the oldest failure, so an
// attacker spraying keys can at worst flush old records; it can never refuse a new key.
type failureTable struct {
	size    int
	entries map[string]*failures
}

func newFailureTable(size int) *failureTable {
	return &failureTable{size: size, entries: map[string]*failures{}}
}
func (t *failureTable) len() int { return len(t.entries) }
func (t *failureTable) get(key string, now time.Time) *failures {
	f := t.entries[key]
	if f != nil && now.Sub(f.last) >= failureMemory {
		delete(t.entries, key)
		return nil
	}
	return f
}
func (t *failureTable) add(key string, now time.Time) *failures {
	if f := t.get(key, now); f != nil {
		return f
	}
	if len(t.entries) >= t.size {
		oldest := ""
		for k, f := range t.entries {
			if oldest == "" || f.last.Before(t.entries[oldest].last) {
				oldest = k
			}
		}
		delete(t.entries, oldest)
	}
	f := &failures{last: now}
	t.entries[key] = f
	return f
}

type loginLimiter struct {
	mu        sync.Mutex
	now       func() time.Time
	trusted   []netip.Prefix
	addresses *failureTable
	// Configured accounts are tracked outside the bounded tables so a spray of unknown emails can
	// never evict a real account's failures. Unknown emails are still tracked, in a bounded table,
	// so a lock does not reveal which emails are configured.
	accounts map[string]*failures
	unknown  *failureTable
}

func newLoginLimiter(now func() time.Time, trusted []netip.Prefix, emails []string) *loginLimiter {
	l := &loginLimiter{now: now, trusted: trusted, addresses: newFailureTable(addressTableSize), accounts: map[string]*failures{}, unknown: newFailureTable(unknownAccountTableSize)}
	for _, email := range emails {
		l.accounts[email] = &failures{}
	}
	return l
}

func (l *loginLimiter) account(email string, now time.Time, create bool) *failures {
	if f, ok := l.accounts[email]; ok {
		if now.Sub(f.last) >= failureMemory {
			f.count = 0
		}
		return f
	}
	if create {
		return l.unknown.add(email, now)
	}
	return l.unknown.get(email, now)
}

// begin records a pending failure for the address and email, or returns how long the caller must
// wait when either is throttled. Recording before the password check means parallel guesses
// cannot all slip past the check; succeeded removes the pending failure again.
func (l *loginLimiter) begin(address, email string) time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	wait := max(addressBackoff.wait(l.addresses.get(address, now), now), accountBackoff.wait(l.account(email, now, false), now))
	if wait > 0 {
		return wait
	}
	for _, f := range []*failures{l.addresses.add(address, now), l.account(email, now, true)} {
		f.count++
		f.last = now
	}
	return 0
}

func (l *loginLimiter) succeeded(address, email string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	if f := l.addresses.get(address, now); f != nil && f.count > 0 {
		f.count--
	}
	if f := l.account(email, now, false); f != nil {
		f.count = 0
	}
}

// clientKey identifies the client for throttling. The connecting address is used unless it is a
// trusted proxy; then the right-most X-Forwarded-For address that is not itself a trusted proxy is
// used, because each trusted proxy appends the address it received the request from and anything
// further left may be forged by the client. IPv6 clients are grouped by /64.
func (l *loginLimiter) clientKey(r *http.Request) string {
	remote, ok := parseAddr(r.RemoteAddr)
	if !ok {
		return "unparsed"
	}
	client := remote
	if l.isTrusted(remote) {
		hops := strings.Split(strings.Join(r.Header.Values("X-Forwarded-For"), ","), ",")
		for i := len(hops) - 1; i >= 0; i-- {
			hop, ok := parseAddr(strings.TrimSpace(hops[i]))
			if !ok {
				break
			}
			client = hop
			if !l.isTrusted(hop) {
				break
			}
		}
	}
	if client.Is6() {
		p, _ := client.Prefix(64)
		return p.String()
	}
	return client.String()
}

func (l *loginLimiter) isTrusted(a netip.Addr) bool {
	for _, p := range l.trusted {
		if p.Contains(a) {
			return true
		}
	}
	return false
}

func parseAddr(s string) (netip.Addr, bool) {
	if ap, e := netip.ParseAddrPort(s); e == nil {
		return ap.Addr().Unmap(), true
	}
	a, e := netip.ParseAddr(strings.Trim(s, "[]"))
	if e != nil {
		return netip.Addr{}, false
	}
	return a.WithZone("").Unmap(), true
}

// ParseTrustedProxies reads a comma-separated list of CIDR ranges or single addresses, such as the
// TRUSTED_PROXY_CIDRS environment variable. An empty string trusts no proxy.
func ParseTrustedProxies(list string) ([]netip.Prefix, error) {
	out := []netip.Prefix{}
	if strings.TrimSpace(list) == "" {
		return out, nil
	}
	for _, item := range strings.Split(list, ",") {
		item = strings.TrimSpace(item)
		if p, e := netip.ParsePrefix(item); e == nil {
			out = append(out, p.Masked())
			continue
		}
		a, e := netip.ParseAddr(item)
		if e != nil || a.Zone() != "" {
			return nil, errors.New("trusted proxies must be comma-separated IP addresses or CIDR ranges")
		}
		out = append(out, netip.PrefixFrom(a.Unmap(), a.Unmap().BitLen()))
	}
	return out, nil
}
