// Package app holds the household finance use cases: recording and correcting transactions,
// adjusting wallets, confirming bills, and reading lists and summaries. Each use case loads what
// the ledger rules need through the Store port, applies the rules, and writes the result in the
// same transaction. The clock and the household's location are injected, never read globally.
package app

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	"simply-finance/internal/ledger"
)

// Config carries the application's time sources.
type Config struct {
	// Now is the clock; nil uses time.Now.
	Now func() time.Time
	// Location is the household's calendar location (Asia/Dhaka) for dates and recurrence
	// boundaries. It is required.
	Location *time.Location
}

// Service runs the use cases against one Store.
type Service struct {
	store Store
	now   func() time.Time
	loc   *time.Location
}

// New returns the use cases over store.
func New(store Store, config Config) (*Service, error) {
	if store == nil || config.Location == nil {
		return nil, errors.New("app: a store and a location are required")
	}
	if config.Now == nil {
		config.Now = time.Now
	}
	return &Service{store: store, now: config.Now, loc: config.Location}, nil
}

// RequestKeyTTL is how long an Idempotency-Key and its stored response are kept. A retry inside
// this window replays the first response; expired keys are pruned on later writes, after which
// the same key is treated as a new request.
const RequestKeyTTL = 30 * 24 * time.Hour

func (s *Service) today() string           { return ledger.Today(s.now(), s.loc) }
func (s *Service) addDays(days int) string { return ledger.AddDays(s.now(), s.loc, days) }
func (s *Service) instant() string         { return ledger.Instant(s.now()) }

// read runs fn in one read-only snapshot.
func read[T any](ctx context.Context, s *Service, fn func(Tx) (T, error)) (T, error) {
	var out T
	e := s.store.Read(ctx, func(tx Tx) error {
		var e error
		out, e = fn(tx)
		return e
	})
	if e != nil {
		var zero T
		return zero, e
	}
	return out, nil
}

// change runs fn in one write transaction without a request key.
func change[T any](ctx context.Context, s *Service, fn func(Tx) (T, error)) (T, error) {
	var out T
	e := s.store.Change(ctx, func(tx Tx) error {
		var e error
		out, e = fn(tx)
		return e
	})
	if e != nil {
		var zero T
		return zero, e
	}
	return out, nil
}

// write runs a financial or settings mutation under the actor's request key. The fingerprint
// covers the operation and its input, so reusing a key for a different request is refused, and a
// retry of the same request replays the stored response without a second effect.
func write[T any](ctx context.Context, s *Service, actor, key, operation string, input any, fn func(Tx) (T, error)) (T, error) {
	var zero T
	if len(key) < 1 || len(key) > 128 {
		return zero, ledger.Invalid("", "Send an Idempotency-Key header of 1 to 128 characters.")
	}
	raw, e := json.Marshal(input)
	if e != nil {
		return zero, e
	}
	hash := sha256.Sum256(append([]byte(operation+":"), raw...))
	now := s.now().Unix()
	request := RequestKey{ActorID: actor, Key: key, Fingerprint: hex.EncodeToString(hash[:]), CreatedAt: now, ExpiresBefore: now - int64(RequestKeyTTL/time.Second)}
	result, replay, e := s.store.Write(ctx, request, func(tx Tx) (any, error) { return fn(tx) })
	if e != nil {
		return zero, e
	}
	if replay != nil {
		var out T
		e = json.Unmarshal(replay, &out)
		return out, e
	}
	return result.(T), nil
}

func newID() string {
	var b [16]byte
	if _, e := rand.Read(b[:]); e != nil {
		panic(e)
	}
	return hex.EncodeToString(b[:])
}

// findWallet loads a wallet a rule needs, or nil when it does not exist.
func findWallet(tx Tx, id string) (*ledger.Wallet, error) {
	w, e := tx.Wallet(id)
	if errors.Is(e, ledger.ErrNotFound) {
		return nil, nil
	}
	if e != nil {
		return nil, e
	}
	return &w, nil
}

func validPage(limit, offset int) error {
	if limit < 1 || limit > 200 {
		return ledger.Invalid("limit", "Use a limit from 1 to 200.")
	}
	if offset < 0 {
		return ledger.Invalid("offset", "Use an offset of zero or more.")
	}
	return nil
}
