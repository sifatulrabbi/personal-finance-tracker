package httpapi

import (
	"context"
	"errors"
	"net/http"
	"simply-finance/internal/auth"
	"simply-finance/internal/ledger"
	"strconv"
	"time"
)

func (s *Server) cookie(w http.ResponseWriter, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{Name: "sf_session", Value: value, Path: "/", HttpOnly: true, Secure: !s.config.InsecureCookies, SameSite: http.SameSiteStrictMode, MaxAge: maxAge})
}
func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if e := decode(w, r, &in); e != nil {
		respond(w, nil, e)
		return
	}
	request := auth.LoginRequest{Email: in.Email, Password: in.Password, Address: clientKey(r, s.config.TrustedProxies)}
	if old, e := r.Cookie("sf_session"); e == nil {
		request.PreviousToken = old.Value
	}
	out, e := s.auth.Login(r.Context(), request)
	if a := entry(r); a != nil && out.User.ID != "" {
		a.actorID = out.User.ID
	}
	var limited *auth.RateLimited
	if errors.As(e, &limited) {
		w.Header().Set("Retry-After", strconv.Itoa(int((limited.Wait+time.Second-1)/time.Second)))
		writeError(w, errRateLimited)
		return
	}
	if e != nil {
		respond(w, nil, e)
		return
	}
	s.cookie(w, out.Token, int(auth.SessionLifetime/time.Second))
	respond(w, out.User, nil)
}
func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	c, e := r.Cookie("sf_session")
	if e == nil {
		e = s.auth.Logout(r.Context(), c.Value)
	}
	s.cookie(w, "", -1)
	respond(w, map[string]bool{"ok": true}, e)
}

// authenticate puts the session's member on the request context and refuses a request without a
// valid session.
func (s *Server) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, e := r.Cookie("sf_session")
		if e != nil {
			respond(w, nil, ledger.ErrUnauthorized)
			return
		}
		u, e := s.auth.Authenticate(r.Context(), c.Value)
		if e != nil {
			respond(w, nil, e)
			return
		}
		if a := entry(r); a != nil {
			a.actorID = u.ID
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), actorKey{}, u)))
	})
}
