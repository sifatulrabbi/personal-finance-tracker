package auth

import (
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
	addresses *failureTable
	// Configured accounts are tracked outside the bounded tables so a spray of unknown emails can
	// never evict a real account's failures. Unknown emails are still tracked, in a bounded table,
	// so a lock does not reveal which emails are configured.
	accounts map[string]*failures
	unknown  *failureTable
}

func newLoginLimiter(now func() time.Time, emails []string) *loginLimiter {
	l := &loginLimiter{now: now, addresses: newFailureTable(addressTableSize), accounts: map[string]*failures{}, unknown: newFailureTable(unknownAccountTableSize)}
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
