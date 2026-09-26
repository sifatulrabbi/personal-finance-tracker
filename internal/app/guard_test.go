package app

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"strings"
	"testing"
)

// storeUsers are the only functions that may reach the Store port directly.
var storeUsers = map[string]bool{"read": true, "change": true, "write": true, "New": true}

// Every use case runs in one transaction, and the SQLite writer has one connection. A use case
// that opened a second transaction from inside its first (through s.store or a public Service
// method) would wait for itself, and statements using an outer ctx would escape the transaction.
// This test keeps every function and closure that receives a Tx working only through it.
func TestUseCasesUseOnlyTheirTransaction(t *testing.T) {
	fset := token.NewFileSet()
	entries, e := os.ReadDir(".")
	if e != nil {
		t.Fatal(e)
	}
	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		file, e := parser.ParseFile(fset, name, nil, 0)
		if e != nil {
			t.Fatal(e)
		}
		for _, v := range useCaseViolations(fset, file) {
			t.Error(v)
		}
	}
}

// The guard itself catches each mistake it exists for.
func TestUseCaseGuardReportsMistakes(t *testing.T) {
	src := `package app
func (s *Service) Bad(ctx context.Context) error {
	s.store.Read(ctx, nil)
	_, e := write(ctx, s, "", "", "", nil, func(tx Tx) (int, error) {
		w, _ := s.Wallet(ctx, "id")
		return 0, nil
	})
	return e
}
func helper(tx Tx, s *Service) { s.store.Change(nil, nil) }
`
	fset := token.NewFileSet()
	file, e := parser.ParseFile(fset, "bad.go", src, 0)
	if e != nil {
		t.Fatal(e)
	}
	got := strings.Join(useCaseViolations(fset, file), "\n")
	for _, want := range []string{"bad.go:3:2: Bad uses the store directly", "bad.go:5:11: closure calls s.Wallet", "bad.go:5:20: closure uses ctx", "bad.go:10:34: helper uses the store directly"} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %q in:\n%s", want, got)
		}
	}
}

func useCaseViolations(fset *token.FileSet, file *ast.File) []string {
	out := []string{}
	report := func(pos token.Pos, format string, args ...any) {
		out = append(out, fset.Position(pos).String()+": "+fmt.Sprintf(format, args...))
	}
	ast.Inspect(file, func(n ast.Node) bool {
		var body *ast.BlockStmt
		where, inTx := "closure", false
		switch fn := n.(type) {
		case *ast.FuncDecl:
			body, where, inTx = fn.Body, fn.Name.Name, takesTx(fn.Type)
			if !storeUsers[fn.Name.Name] && body != nil {
				ast.Inspect(body, func(n ast.Node) bool {
					if sel, ok := n.(*ast.SelectorExpr); ok && sel.Sel.Name == "store" {
						report(sel.Pos(), "%s uses the store directly; use read, change, or write", where)
					}
					return true
				})
			}
		case *ast.FuncLit:
			body, inTx = fn.Body, takesTx(fn.Type)
		default:
			return true
		}
		if inTx && body != nil {
			checkInsideTransaction(body, where, report)
		}
		return true
	})
	return out
}

func takesTx(ft *ast.FuncType) bool {
	for _, field := range ft.Params.List {
		if ident, ok := field.Type.(*ast.Ident); ok && ident.Name == "Tx" {
			return true
		}
	}
	return false
}

// checkInsideTransaction reports calls to public Service methods, which open their own
// transactions, and uses of an outer request context, from code that already has a Tx.
func checkInsideTransaction(body *ast.BlockStmt, where string, report func(token.Pos, string, ...any)) {
	ast.Inspect(body, func(n ast.Node) bool {
		switch x := n.(type) {
		case *ast.SelectorExpr:
			if recv, ok := x.X.(*ast.Ident); ok && recv.Name == "s" && ast.IsExported(x.Sel.Name) {
				report(x.Pos(), "%s calls s.%s inside a transaction; call the unexported helper with the Tx", where, x.Sel.Name)
			}
			ast.Inspect(x.X, func(inner ast.Node) bool {
				if ident, ok := inner.(*ast.Ident); ok && ident.Name == "ctx" {
					report(ident.Pos(), "%s uses ctx inside a transaction; the Tx carries the request context", where)
				}
				return true
			})
			return false // A field or method named ctx is not the outer context.
		case *ast.Ident:
			if x.Name == "ctx" {
				report(x.Pos(), "%s uses ctx inside a transaction; the Tx carries the request context", where)
			}
		}
		return true
	})
}
