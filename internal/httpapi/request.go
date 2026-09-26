package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"simply-finance/internal/ledger"
	"strconv"
	"strings"
)

func actor(r *http.Request) ledger.User { return r.Context().Value(actorKey{}).(ledger.User) }
func key(r *http.Request) string        { return r.Header.Get("Idempotency-Key") }

// input decodes the request body into T and answers with fn's result or error.
func input[T any](fn func(*http.Request, T) (any, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var in T
		if e := decode(w, r, &in); e != nil {
			respond(w, nil, e)
			return
		}
		v, e := fn(r, in)
		respond(w, v, e)
	}
}

// decode reads exactly one JSON object of at most 32 KB with no unknown fields.
func decode(w http.ResponseWriter, r *http.Request, out any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 32*1024)
	defer r.Body.Close()
	b, e := io.ReadAll(r.Body)
	if e != nil {
		return errBodyTooLarge
	}
	if len(strings.TrimSpace(string(b))) == 0 || strings.TrimSpace(string(b))[0] != '{' {
		return errNotOneObject
	}
	dec := json.NewDecoder(strings.NewReader(string(b)))
	dec.DisallowUnknownFields()
	if e = dec.Decode(out); e != nil {
		var typeError *json.UnmarshalTypeError
		if errors.As(e, &typeError) && typeError.Field != "" {
			return &ledger.Error{Code: ledger.CodeValidationFailed, Message: "This field has the wrong JSON type.", Field: typeError.Field}
		}
		return errMalformedBody
	}
	if e = dec.Decode(&struct{}{}); e != io.EOF {
		return errNotOneObject
	}
	return nil
}

var (
	errBodyTooLarge  = &ledger.Error{Code: ledger.CodeValidationFailed, Message: "The request body could not be read or is larger than 32 KB."}
	errNotOneObject  = &ledger.Error{Code: ledger.CodeValidationFailed, Message: "Send exactly one JSON object as the request body."}
	errMalformedBody = &ledger.Error{Code: ledger.CodeValidationFailed, Message: "The request body is not valid JSON for this endpoint, or it has an unknown field."}
	errPathID        = &ledger.Error{Code: ledger.CodeValidationFailed, Message: "The id in the body must match the id in the path.", Field: "id"}
)

// query answers a request that has no body with fn's result or error.
func query(fn func(*http.Request) (any, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		v, e := fn(r)
		respond(w, v, e)
	}
}

func respond(w http.ResponseWriter, v any, e error) {
	if e != nil {
		writeError(w, e)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}
func page(r *http.Request) (int, int, error) {
	l, o := 100, 0
	var e error
	if r.URL.Query().Get("limit") != "" {
		l, e = strconv.Atoi(r.URL.Query().Get("limit"))
		if e != nil {
			return 0, 0, &ledger.Error{Code: ledger.CodeValidationFailed, Message: "Use a whole-number limit.", Field: "limit"}
		}
	}
	if r.URL.Query().Get("offset") != "" {
		o, e = strconv.Atoi(r.URL.Query().Get("offset"))
		if e != nil {
			return 0, 0, &ledger.Error{Code: ledger.CodeValidationFailed, Message: "Use a whole-number offset.", Field: "offset"}
		}
	}
	return l, o, nil
}

// cursorPaged reports whether a list request opted into the cursor-paged form, which answers
// {"items":[...],"next_cursor":...}: it sends page=cursor, a cursor, or any of the list's filters.
// Without them the list keeps its original bare-array, offset-paged answer for older clients.
func cursorPaged(r *http.Request, filters ...string) bool {
	q := r.URL.Query()
	for _, name := range append([]string{"page", "cursor"}, filters...) {
		if q.Has(name) {
			return true
		}
	}
	return false
}

// cursorLimit validates a cursor-paged request's page and offset parameters and returns its limit.
func cursorLimit(r *http.Request) (int, error) {
	q := r.URL.Query()
	if q.Has("page") && q.Get("page") != "cursor" {
		return 0, &ledger.Error{Code: ledger.CodeValidationFailed, Message: "Use page=cursor, or leave page out.", Field: "page"}
	}
	if q.Has("offset") {
		return 0, &ledger.Error{Code: ledger.CodeValidationFailed, Message: "A cursor-paged list does not take an offset. Send the previous page's next_cursor as cursor.", Field: "offset"}
	}
	l, _, e := page(r)
	return l, e
}
