package httpapi

import (
	"mime"
	"net/http"
)

// security sets the response security headers and refuses a write without the CSRF header, from
// another origin or site, or with a body that is not JSON.
func (s *Server) security(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		if r.Method != "GET" && r.Method != "HEAD" && r.Method != "OPTIONS" {
			origin := r.Header.Get("Origin")
			media, _, e := mime.ParseMediaType(r.Header.Get("Content-Type"))
			if r.Header.Get("X-CSRF-Protection") != "1" || (origin != "" && origin != s.config.Origin) || r.Header.Get("Sec-Fetch-Site") == "cross-site" {
				writeError(w, errForbidden)
				return
			}
			if e != nil || media != "application/json" {
				writeError(w, errMediaType)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
