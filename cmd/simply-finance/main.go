package main

import (
	"fmt"
	"github.com/spf13/cobra"
	"golang.org/x/crypto/bcrypt"
	"io"
	"os"
	"simply-finance/internal/finance"
	"strings"
	"time"
)

func newCommand() *cobra.Command {
	root := &cobra.Command{Use: "simply-finance", Short: "Household finance server and database tools", SilenceUsage: true, SilenceErrors: true}
	root.CompletionOptions.DisableDefaultCmd = true
	root.RunE = func(cmd *cobra.Command, args []string) error { return cmd.Help() }
	root.Args = cobra.NoArgs
	for _, name := range []string{"serve", "migrate", "seed"} {
		var path string
		descriptions := map[string]string{"serve": "Serve the application without preparing the database", "migrate": "Apply pending embedded schema migrations", "seed": "Insert missing default data into a migrated database"}
		command := &cobra.Command{Use: name, Short: descriptions[name], Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, args []string) error {
			switch name {
			case "serve":
				return serve(path)
			case "migrate":
				if err := finance.Migrate(path); err != nil {
					return err
				}
			case "seed":
				s, err := finance.Open(path, time.Now)
				if err != nil {
					return err
				}
				defer s.Close()
				if err = s.Seed(cmd.Context()); err != nil {
					return err
				}
			}
			_, err := fmt.Fprintln(cmd.OutOrStdout(), name+" completed")
			return err
		}}
		command.Flags().StringVar(&path, "database", env("DATABASE_PATH", "data/finance.sqlite"), "SQLite database path (defaults to DATABASE_PATH)")
		root.AddCommand(command)
	}
	root.AddCommand(&cobra.Command{Use: "hash-password", Short: "Hash a 12–72 byte password read from standard input", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, args []string) error {
		password, err := io.ReadAll(io.LimitReader(cmd.InOrStdin(), 75))
		if err != nil {
			return fmt.Errorf("cannot read password from stdin")
		}
		value := strings.TrimSuffix(strings.TrimSuffix(string(password), "\n"), "\r")
		if len(value) < 12 || len(value) > 72 {
			return fmt.Errorf("password must contain 12 to 72 bytes")
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(value), 12)
		if err != nil {
			return fmt.Errorf("cannot hash password")
		}
		_, err = fmt.Fprintln(cmd.OutOrStdout(), string(hash))
		return err
	}})
	return root
}

func main() {
	if err := newCommand().Execute(); err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}
}
