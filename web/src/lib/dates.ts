// The household calendar is Asia/Dhaka, whatever the device's own time zone.
export function dhakaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// A calendar date (YYYY-MM-DD, already a Dhaka date) as people read it in a list: "Today",
// "Yesterday", "24 Sep", or "24 Sep 2025" outside the current year. Pure string math, so
// the device's own time zone never shifts the day.
export function shortDate(date: string, today = dhakaDate()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  if (date === today) return "Today";
  if (date === previousDay(today)) return "Yesterday";
  const [, year, month, day] = match;
  const label = `${Number(day)} ${monthNames[Number(month) - 1]}`;
  return year === today.slice(0, 4) ? label : `${label} ${year}`;
}

// A calendar date with its year, for history where "Today" would go stale: "5 Sep 2026".
export function fullDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  return `${Number(match[3])} ${monthNames[Number(match[2]) - 1]} ${match[1]}`;
}

function previousDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

function utcDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

// Whole calendar days from one YYYY-MM-DD date to another. Both are already Asia/Dhaka
// dates (the server's due dates and dhakaDate()), so this is plain calendar arithmetic.
export function daysBetween(from: string, to: string) {
  return Math.round((utcDay(to) - utcDay(from)) / 86_400_000);
}

export type DueTone = "overdue" | "today" | "soon";

// How a bill's due date reads against today: "3 days overdue", "Due today", "Due tomorrow",
// or "Due in 5 days".
export function dueLabel(due: string, today = dhakaDate()): { text: string; tone: DueTone } {
  const days = daysBetween(today, due);
  if (days < 0) {
    const late = -days;
    return { text: `${late} ${late === 1 ? "day" : "days"} overdue`, tone: "overdue" };
  }
  if (days === 0) return { text: "Due today", tone: "today" };
  if (days === 1) return { text: "Due tomorrow", tone: "soon" };
  return { text: `Due in ${days} days`, tone: "soon" };
}

const longMonthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// "2026-09" -> "September 2026".
export function monthLabel(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  return `${longMonthNames[Number(match[2]) - 1]} ${match[1]}`;
}

export function monthName(index: number) {
  return longMonthNames[index];
}

// Moves a YYYY-MM month by a number of months, across year boundaries.
export function shiftMonth(month: string, by: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const total = year * 12 + (monthNumber - 1) + by;
  return `${String(Math.floor(total / 12)).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}`;
}

// A stored instant as people in Dhaka read it: "2 Oct 2026, 3:41 PM".
export function dhakaDateTime(instant: string) {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return instant;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("day")} ${value("month")} ${value("year")}, ${value("hour")}:${value("minute")} ${value("dayPeriod")}`;
}
