package httpapi

import (
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

func WithFrontend(api http.Handler, directory string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api" || strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/healthz" {
			api.ServeHTTP(w, r)
			return
		}
		if r.Method != "GET" && r.Method != "HEAD" {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		name := r.URL.Path
		if name == "/" {
			name = "/index.html"
		}
		// A client route may be reached with one trailing slash (/wallets/); the router treats it as /wallets.
		name = strings.TrimSuffix(name, "/")
		if path.Clean(name) != name || strings.Contains(name, "\\") || strings.HasPrefix(name, "/.") {
			http.NotFound(w, r)
			return
		}
		file := filepath.Join(directory, filepath.FromSlash(strings.TrimPrefix(name, "/")))
		info, err := os.Stat(file)
		// Unknown extensionless paths are client routes and get the app document; missing build assets stay 404.
		if os.IsNotExist(err) && path.Ext(name) == "" && !strings.HasPrefix(name, "/assets/") {
			file = filepath.Join(directory, "index.html")
			info, err = os.Stat(file)
		}
		if err != nil || !info.Mode().IsRegular() {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFile(w, r, file)
	})
}
