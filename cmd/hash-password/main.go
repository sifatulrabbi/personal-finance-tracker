package main

import (
	"fmt"
	"io"
	"os"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

func main() {
	password, err := io.ReadAll(io.LimitReader(os.Stdin, 75))
	if err != nil {
		fmt.Fprintln(os.Stderr, "cannot read password from stdin")
		os.Exit(1)
	}
	value := strings.TrimSuffix(strings.TrimSuffix(string(password), "\n"), "\r")
	if len(value) < 12 || len(value) > 72 {
		fmt.Fprintln(os.Stderr, "password must contain 12 to 72 bytes")
		os.Exit(1)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(value), 12)
	if err != nil {
		fmt.Fprintln(os.Stderr, "cannot hash password")
		os.Exit(1)
	}
	fmt.Println(string(hash))
}
