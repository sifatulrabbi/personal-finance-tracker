package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	_ "time/tzdata" // The image has no zoneinfo; the household time zone is embedded.

	"simply-finance/internal/app"
	"simply-finance/internal/auth"
	"simply-finance/internal/httpapi"
	"simply-finance/internal/ledger"
	"simply-finance/internal/sqlite"
)

// householdTimezone is the calendar every date and recurrence boundary uses (CLAUDE.md).
const householdTimezone = "Asia/Dhaka"

func serve(path string) error {
	var users []auth.Credential
	if err := json.Unmarshal([]byte(os.Getenv("AUTH_USERS_JSON")), &users); err != nil {
		return errors.New("AUTH_USERS_JSON must be a JSON array of emails and password_hash values")
	}
	proxies, err := httpapi.ParseTrustedProxies(os.Getenv("TRUSTED_PROXY_CIDRS"))
	if err != nil {
		return errors.New("TRUSTED_PROXY_CIDRS must be a comma-separated list of IP addresses or CIDR ranges")
	}
	location, err := time.LoadLocation(householdTimezone)
	if err != nil {
		return fmt.Errorf("load the household time zone: %w", err)
	}
	store, err := sqlite.Open(path)
	if err != nil {
		return fmt.Errorf("open existing database (run migrate explicitly to initialize it): %w", err)
	}
	defer store.Close()
	finance, err := app.New(store, app.Config{Now: time.Now, Location: location})
	if err != nil {
		return err
	}
	handler, err := func() (http.Handler, error) {
		// Starting auth signs out sessions whose ENV credential was removed or changed.
		sessions, err := auth.New(context.Background(), store, auth.Config{Users: users, Now: time.Now})
		if err != nil {
			return nil, err
		}
		return httpapi.New(httpapi.Deps{Finance: finance, Auth: sessions, Ready: store.Health}, httpapi.Config{
			Origin:          env("APP_ORIGIN", "http://localhost:47831"),
			InsecureCookies: os.Getenv("ALLOW_INSECURE_COOKIES") == "true",
			TrustedProxies:  proxies,
		})
	}()
	if err != nil {
		if errors.Is(err, ledger.ErrInvalid) {
			return errors.New("invalid authentication or origin configuration; HTTP requires ALLOW_INSECURE_COOKIES=true and HTTPS requires false")
		}
		return fmt.Errorf("initialize HTTP handler (database preparation requires the explicit migrate command): %w", err)
	}
	handler = httpapi.WithFrontend(handler, env("WEB_DIR", "web/dist"))
	server := &http.Server{
		Addr: env("LISTEN_ADDR", ":47831"), Handler: handler,
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second,
		WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second,
		MaxHeaderBytes: 16 * 1024,
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	done := make(chan error, 1)
	go func() { done <- server.ListenAndServe() }()
	slog.Info("server starting", "address", server.Addr)
	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return server.Shutdown(shutdown)
	}
}

func env(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
