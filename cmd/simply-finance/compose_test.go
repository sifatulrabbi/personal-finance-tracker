package main

import (
	"os"
	"strings"
	"testing"
)

// Regression: an environment: block on the finance service takes precedence over env_file in
// Docker Compose, so it silently blanked TRUSTED_PROXY_CIDRS set in .env.runtime and brought back
// the household-wide login lockout behind a proxy. Runtime settings must come only from env_file.
func TestComposeFinanceServiceReadsRuntimeSettingsOnlyFromEnvFile(t *testing.T) {
	body, err := os.ReadFile("../../compose.yaml")
	if os.IsNotExist(err) {
		// The Docker build stage copies only cmd/ and internal/; the repository checkout runs this.
		t.Skip("compose.yaml is not part of this build context")
	}
	if err != nil {
		t.Fatal(err)
	}
	inFinance := false
	sawEnvFile := false
	for _, line := range strings.Split(string(body), "\n") {
		trimmed := strings.TrimSpace(line)
		indent := len(line) - len(strings.TrimLeft(line, " "))
		if indent == 2 && strings.HasSuffix(trimmed, ":") {
			inFinance = trimmed == "finance:"
			continue
		}
		if !inFinance || indent != 4 {
			continue
		}
		switch trimmed {
		case "environment:":
			t.Fatal("the finance service must not have an environment: block; put settings in .env.runtime")
		case "env_file:":
			sawEnvFile = true
		}
	}
	if !sawEnvFile {
		t.Fatal("the finance service must load .env.runtime through env_file")
	}
}
