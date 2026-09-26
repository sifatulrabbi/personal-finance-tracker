package ledger_test

import (
	"testing"
	"time"
	_ "time/tzdata"

	"simply-finance/internal/ledger"
)

func TestRecurrencePreservesAnchorAcrossShortMonths(t *testing.T) {
	for _, tc := range []struct {
		start, frequency string
		n                int
		want             string
	}{{"2026-01-31", "monthly", 1, "2026-02-28"}, {"2026-01-31", "monthly", 2, "2026-03-31"}, {"2024-02-29", "yearly", 1, "2025-02-28"}, {"2024-02-29", "yearly", 4, "2028-02-29"}, {"2026-09-14", "weekly", 1, "2026-09-21"}} {
		got, e := ledger.OccurrenceDate(tc.start, tc.frequency, tc.n)
		if e != nil || got != tc.want {
			t.Fatalf("%+v: %s %v", tc, got, e)
		}
	}
	if _, e := ledger.OccurrenceDate("2026-02-30", "monthly", 1); e == nil {
		t.Fatal("invalid date accepted")
	}
}

func TestOccurrenceDateRejectsBadInput(t *testing.T) {
	for _, tc := range []struct {
		start, frequency string
		n                int
	}{{"2026-01-01", "daily", 0}, {"2026-01-01", "weekly", -1}, {"2026-01-01", "weekly", 10001}, {"1899-12-31", "weekly", 0}, {"9999-12-01", "monthly", 1}} {
		if got, e := ledger.OccurrenceDate(tc.start, tc.frequency, tc.n); e == nil {
			t.Errorf("%+v: accepted %s", tc, got)
		}
	}
}

// FuzzMonthlyOccurrenceKeepsItsAnchor checks the clamping rule for every start day and index: a
// monthly occurrence falls on the start's day of month, or the month's last day when it is shorter.
func FuzzMonthlyOccurrenceKeepsItsAnchor(f *testing.F) {
	for _, seed := range []struct {
		day   uint8
		index uint16
	}{{31, 1}, {29, 12}, {30, 13}, {1, 0}} {
		f.Add(seed.day, seed.index)
	}
	f.Fuzz(func(t *testing.T, day uint8, index uint16) {
		d := int(day%31) + 1
		n := int(index % 1200)
		start := time.Date(2024, 1, d, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
		got, e := ledger.OccurrenceDate(start, "monthly", n)
		if e != nil {
			t.Fatal(e)
		}
		date, _ := time.Parse("2006-01-02", got)
		month := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC).AddDate(0, n, 0)
		last := month.AddDate(0, 1, -1).Day()
		if date.Year() != month.Year() || date.Month() != month.Month() || date.Day() != min(d, last) {
			t.Fatalf("start %s index %d: %s", start, n, got)
		}
	})
}

func TestDueDatesStopAtThroughAndEndDate(t *testing.T) {
	s := ledger.Schedule{ScheduleInput: ledger.ScheduleInput{StartDate: "2026-01-31", Frequency: "monthly"}}
	dates, next := ledger.DueDates(s, 0, "2026-04-15")
	if len(dates) != 3 || dates[1] != "2026-02-28" || dates[2] != "2026-03-31" || next != 3 {
		t.Fatalf("through: %v %d", dates, next)
	}
	dates, next = ledger.DueDates(s, 3, "2026-04-15")
	if len(dates) != 0 || next != 3 {
		t.Fatalf("nothing new: %v %d", dates, next)
	}
	s.EndDate = "2026-02-28"
	dates, next = ledger.DueDates(s, 0, "2026-12-31")
	if len(dates) != 2 || next != 2 {
		t.Fatalf("end date: %v %d", dates, next)
	}
}

func TestCatchUpFromSkipsDatesBeforeTheBackfillWindow(t *testing.T) {
	s := ledger.Schedule{ScheduleInput: ledger.ScheduleInput{StartDate: "2020-01-06", Frequency: "weekly"}}
	next := ledger.CatchUpFrom(s, 2, "2025-09-14")
	date, _ := ledger.OccurrenceDate(s.StartDate, s.Frequency, next)
	previous, _ := ledger.OccurrenceDate(s.StartDate, s.Frequency, next-1)
	if date < "2025-09-14" || previous >= "2025-09-14" {
		t.Fatalf("first kept occurrence %s (index %d), previous %s", date, next, previous)
	}
	// An index already inside the window is kept, so recent missed bills still come due.
	if got := ledger.CatchUpFrom(s, 400, "2025-09-14"); got != 400 {
		t.Fatalf("inside window moved to %d", got)
	}
}

func TestTodayUsesTheHouseholdLocation(t *testing.T) {
	dhaka, e := time.LoadLocation("Asia/Dhaka")
	if e != nil {
		t.Fatal(e)
	}
	// 18:00 UTC is midnight in Dhaka (UTC+6).
	before := time.Date(2026, 9, 30, 17, 59, 59, 0, time.UTC)
	after := time.Date(2026, 9, 30, 18, 0, 0, 0, time.UTC)
	if ledger.Today(before, dhaka) != "2026-09-30" || ledger.Today(after, dhaka) != "2026-10-01" {
		t.Fatalf("%s %s", ledger.Today(before, dhaka), ledger.Today(after, dhaka))
	}
	if ledger.AddDays(after, dhaka, -366) != "2025-09-30" {
		t.Fatal(ledger.AddDays(after, dhaka, -366))
	}
	if got := ledger.Instant(time.Date(2026, 9, 14, 12, 0, 0, 120_000_000, dhaka)); got != "2026-09-14T06:00:00.120000000Z" {
		t.Fatal(got)
	}
}

func TestValidDateAndMonth(t *testing.T) {
	for date, ok := range map[string]bool{"2026-02-28": true, "2026-02-29": false, "1900-01-01": true, "1899-12-31": false, "2026-9-1": false, "": false} {
		if ledger.ValidDate(date) != ok {
			t.Errorf("date %q", date)
		}
	}
	for month, ok := range map[string]bool{"2026-09": true, "2026-13": false, "2026-9": false, "2026-09-01": false} {
		if ledger.ValidMonth(month) != ok {
			t.Errorf("month %q", month)
		}
	}
}
