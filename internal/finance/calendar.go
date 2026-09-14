package finance

import (
	"time"
	_ "time/tzdata"
)

func OccurrenceDate(start, frequency string, index int) (string, error) {
	if !validDate(start) || index < 0 || index > 10000 {
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
