package sqlite

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"strings"
	"testing"
)

// poolUsers are the only functions that may touch the connection pools directly.
var poolUsers = map[string]bool{"Read": true, "Change": true, "Write": true, "openDatabase": true, "Close": true, "Health": true, "migrate": true, "Seed": true, "EnsureUser": true, "SaveSession": true, "Session": true, "DeleteSession": true, "ReconcileSessions": true, "VerifyDerivedState": true}

// The writer pool has one connection. Code running inside a transaction that reached for a pool, or
// for a Store method that opens its own transaction, would wait for the connection its own
// transaction holds: a deadlock. It would also leave its statements outside the transaction and its
// request context. This test keeps every function that has a transaction (a records method, or a
// function or closure receiving records or dbtx) working only through that transaction. The use
// cases in internal/app have the same guard.
func TestTransactionCodeUsesOnlyItsTransaction(t *testing.T) {
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
		for _, v := range transactionViolations(fset, file) {
			t.Error(v)
		}
	}
}

// The guard itself catches each mistake it exists for.
func TestTransactionGuardReportsMistakes(t *testing.T) {
	src := `package sqlite
func (s *Store) Bad(ctx context.Context) error {
	s.writer.Exec("x")
	return run(ctx, s.writer, nil, func(tx records) error {
		_, e := s.Session(ctx, "id", now)
		return e
	})
}
func (tx records) Leaky() { s.reader.Query("x") }
func helper(tx dbtx, ctx context.Context) { tx.Exec("x", ctx) }
`
	fset := token.NewFileSet()
	file, e := parser.ParseFile(fset, "bad.go", src, 0)
	if e != nil {
		t.Fatal(e)
	}
	got := strings.Join(transactionViolations(fset, file), "\n")
	for _, want := range []string{"bad.go:3:2: Bad uses a connection pool", "bad.go:5:11: closure calls s.Session", "bad.go:5:21: closure uses ctx", "bad.go:9:29: Leaky uses a connection pool", "bad.go:10:58: helper uses ctx"} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %q in:\n%s", want, got)
		}
	}
}

// txTypes are the parameter and receiver types that mean "already inside a transaction".
var txTypes = map[string]bool{"dbtx": true, "records": true}

func transactionViolations(fset *token.FileSet, file *ast.File) []string {
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
			if fn.Recv != nil {
				switch receiverType(fn) {
				case "dbtx":
					return false // dbtx's own methods wrap the *sql.Tx.
				case "records":
					inTx = true
				}
			}
			if !poolUsers[fn.Name.Name] {
				checkNoPool(body, where, report)
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

func receiverType(fn *ast.FuncDecl) string {
	switch t := fn.Recv.List[0].Type.(type) {
	case *ast.Ident:
		return t.Name
	case *ast.StarExpr:
		if ident, ok := t.X.(*ast.Ident); ok {
			return ident.Name
		}
	}
	return ""
}

func takesTx(ft *ast.FuncType) bool {
	for _, field := range ft.Params.List {
		if ident, ok := field.Type.(*ast.Ident); ok && txTypes[ident.Name] {
			return true
		}
	}
	return false
}

func checkNoPool(body *ast.BlockStmt, where string, report func(token.Pos, string, ...any)) {
	if body == nil {
		return
	}
	ast.Inspect(body, func(n ast.Node) bool {
		if sel, ok := n.(*ast.SelectorExpr); ok && (sel.Sel.Name == "writer" || sel.Sel.Name == "reader") {
			report(sel.Pos(), "%s uses a connection pool directly; use Read, Change, or Write", where)
		}
		return true
	})
}

// checkInsideTransaction reports calls to exported store methods, which open their own
// transactions, and uses of an outer request context, from code that already has a transaction.
func checkInsideTransaction(body *ast.BlockStmt, where string, report func(token.Pos, string, ...any)) {
	ast.Inspect(body, func(n ast.Node) bool {
		switch x := n.(type) {
		case *ast.SelectorExpr:
			if recv, ok := x.X.(*ast.Ident); ok && recv.Name == "s" && ast.IsExported(x.Sel.Name) {
				report(x.Pos(), "%s calls s.%s inside a transaction; use the transaction's records", where, x.Sel.Name)
			}
			ast.Inspect(x.X, func(inner ast.Node) bool {
				if ident, ok := inner.(*ast.Ident); ok && ident.Name == "ctx" {
					report(ident.Pos(), "%s uses ctx inside a transaction; the transaction carries the request context", where)
				}
				return true
			})
			return false // A field or method named ctx is not the outer context.
		case *ast.Ident:
			if x.Name == "ctx" {
				report(x.Pos(), "%s uses ctx inside a transaction; the transaction carries the request context", where)
			}
		}
		return true
	})
}
