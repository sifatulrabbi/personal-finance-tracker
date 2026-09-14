package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"simply-finance/internal/finance"
	"simply-finance/internal/httpapi"
)

func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	var users []httpapi.Credential
	if err := json.Unmarshal([]byte(os.Getenv("AUTH_USERS_JSON")), &users); err != nil {
		return errors.New("AUTH_USERS_JSON must be a JSON array of emails and password_hash values")
	}
	path := env("DATABASE_PATH", "data/finance.sqlite")
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	store, err := finance.Open(path, time.Now)
	if err != nil {
		return err
	}
	defer store.Close()
	handler, err := httpapi.New(store, httpapi.Config{
		Users: users, Origin: env("APP_ORIGIN", "http://localhost:47831"),
		InsecureCookies: os.Getenv("ALLOW_INSECURE_COOKIES") == "true",
	})
	if err != nil {
		return errors.New("invalid authentication or origin configuration; HTTP requires ALLOW_INSECURE_COOKIES=true and HTTPS requires false")
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
