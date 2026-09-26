package ledger

import "time"

// InstantLayout is a fixed-width UTC layout, so stored instants sort correctly as strings.
// RFC3339Nano trims trailing zeros and made "…00.12Z" sort after "…00.123Z".
const InstantLayout = "2006-01-02T15:04:05.000000000Z"

// Instant formats an audit or revision timestamp.
func Instant(t time.Time) string { return t.UTC().Format(InstantLayout) }

// Today is the calendar date of t in the household's location.
func Today(t time.Time, loc *time.Location) string { return AddDays(t, loc, 0) }

// AddDays is the calendar date days after t's date in the household's location.
func AddDays(t time.Time, loc *time.Location, days int) string {
	return t.In(loc).AddDate(0, 0, days).Format("2006-01-02")
}

// ValidDate accepts a YYYY-MM-DD calendar date from 1900 through 9999.
func ValidDate(date string) bool {
	d, e := time.Parse("2006-01-02", date)
	return e == nil && d.Year() >= 1900 && d.Year() <= 9999
}

// ValidMonth accepts a YYYY-MM month.
func ValidMonth(month string) bool { return len(month) == 7 && ValidDate(month+"-01") }

// maxOccurrenceIndex bounds how many occurrences one schedule can generate.
const maxOccurrenceIndex = 10000

// OccurrenceDate is the index-th date of a weekly, monthly, or yearly schedule starting on start.
// Monthly and yearly dates keep the start's day of month, clamped to shorter months, so a January
// 31 schedule is due on February 28 and then March 31 again.
func OccurrenceDate(start, frequency string, index int) (string, error) {
	if !ValidDate(start) || index < 0 || index > maxOccurrenceIndex {
		return "", ErrInvalid
	}
	d, _ := time.Parse("2006-01-02", start)
	if frequency == "weekly" {
		d = d.AddDate(0, 0, 7*index)
	} else {
		months := index
		if frequency == "yearly" {
			months *= 12
		} else if frequency != "monthly" {
			return "", ErrInvalid
		}
		month := time.Date(d.Year(), d.Month(), 1, 0, 0, 0, 0, time.UTC).AddDate(0, months, 0)
		last := month.AddDate(0, 1, -1).Day()
		day := d.Day()
		if day > last {
			day = last
		}
		d = time.Date(month.Year(), month.Month(), day, 0, 0, 0, 0, time.UTC)
	}
	if d.Year() > 9999 {
		return "", ErrInvalid
	}
	return d.Format("2006-01-02"), nil
}

// DueDates lists a schedule's occurrence dates from occurrence index next through the date through
// and its end date, and returns the index after the last one listed.
func DueDates(s Schedule, next int, through string) ([]string, int) {
	dates := []string{}
	for ; next <= maxOccurrenceIndex; next++ {
		date, e := OccurrenceDate(s.StartDate, s.Frequency, next)
		if e != nil || date > through || (s.EndDate != "" && date > s.EndDate) {
			break
		}
		dates = append(dates, date)
	}
	return dates, next
}
