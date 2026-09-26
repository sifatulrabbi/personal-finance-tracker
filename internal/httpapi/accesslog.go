package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"time"
)

// accessEntry collects what inner handlers learn about a request: the route pattern that matched
// and the authenticated actor. It is shared through the request context because each mux and the
// authentication middleware see their own copy of the request.
type accessEntry struct {
	route   string
	actorID string
}
type accessKey struct{}

func entry(r *http.Request) *accessEntry {
	e, _ := r.Context().Value(accessKey{}).(*accessEntry)
	return e
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(status int) {
	if s.status == 0 {
		s.status = status
	}
	s.ResponseWriter.WriteHeader(status)
}
func (s *statusRecorder) Write(b []byte) (int, error) {
	if s.status == 0 {
		s.status = http.StatusOK
	}
	return s.ResponseWriter.Write(b)
}

// accessLog writes one structured line per request: method, route pattern, status, duration,
// actor ID, and a random request ID that is also returned in X-Request-ID. It never logs bodies,
// headers, cookies, paths with identifiers, or query values.
func (s *Server) accessLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var raw [16]byte
		if _, e := rand.Read(raw[:]); e != nil {
			panic(e)
		}
		id := hex.EncodeToString(raw[:])
		w.Header().Set("X-Request-ID", id)
		e := &accessEntry{}
		rec := &statusRecorder{ResponseWriter: w}
		start := time.Now()
		next.ServeHTTP(rec, r.WithContext(context.WithValue(r.Context(), accessKey{}, e)))
		route := e.route
		if route == "" {
			route = "unmatched"
		}
		status := rec.status
		if status == 0 {
			status = http.StatusOK
		}
		method := r.Method
		switch method {
		case "GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS":
		default:
			method = "other"
		}
		s.logger.Info("request", "request_id", id, "method", method, "route", route, "status", status, "duration", time.Since(start), "actor_id", e.actorID)
	})
}
