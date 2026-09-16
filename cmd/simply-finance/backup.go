package main

import (
	"fmt"
	"simply-finance/internal/backup"

	"github.com/spf13/cobra"
)

func newBackupCommand(agent bool) *cobra.Command {
	var database, destination string
	var retain int
	name := "backup"
	description := "Create one validated online SQLite snapshot"
	if agent {
		name = "backup-agent"
		description = "Create an immediate backup and then back up once per UTC hour"
	}
	command := &cobra.Command{
		Use:   name,
		Short: description,
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			config := backup.Config{DatabasePath: database, Destination: destination, Retain: retain}
			if agent {
				return (backup.Agent{
					Config: config,
					Logf: func(format string, values ...any) {
						fmt.Fprintf(cmd.OutOrStdout(), format+"\n", values...)
					},
				}).Run(cmd.Context())
			}
			snapshot, err := backup.Create(cmd.Context(), config)
			if err != nil {
				return err
			}
			_, err = fmt.Fprintf(cmd.OutOrStdout(), "backup completed path=%s size_bytes=%d\n", snapshot.Path, snapshot.Size)
			return err
		},
	}
	command.Flags().StringVar(&database, "database", env("DATABASE_PATH", "data/finance.sqlite"), "SQLite database path (defaults to DATABASE_PATH)")
	command.Flags().StringVar(&destination, "destination", env("BACKUP_DIR", ""), "Existing backup directory (defaults to BACKUP_DIR)")
	command.Flags().IntVar(&retain, "retain", 10, "Number of successful snapshots to retain")
	return command
}

func newVerifyBackupCommand() *cobra.Command {
	var database string
	command := &cobra.Command{
		Use:   "verify-backup",
		Short: "Verify a SQLite backup without changing it",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := backup.Verify(cmd.Context(), database); err != nil {
				return err
			}
			_, err := fmt.Fprintln(cmd.OutOrStdout(), "backup verification completed")
			return err
		},
	}
	command.Flags().StringVar(&database, "database", env("DATABASE_PATH", "data/finance.sqlite"), "SQLite backup path (defaults to DATABASE_PATH)")
	return command
}
