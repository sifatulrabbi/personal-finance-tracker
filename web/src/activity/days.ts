import type { Transaction } from "@/api/types";
import { dhakaDate } from "@/lib/dates";

// Records are listed newest first, and each record's `date` is already an Asia/Dhaka
// calendar date, so grouping is string work only: no time zone can move a record to
// another day.

export type DayGroup = { date: string; label: string; records: Transaction[] };

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return undefined;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function previousDay(date: string) {
  const p = parts(date);
  if (!p) return date;
  return new Date(Date.UTC(p.year, p.month - 1, p.day - 1)).toISOString().slice(0, 10);
}

// "Today", "Yesterday", "Thu 24 Sep", or "Thu 24 Sep 2025" outside the current year.
export function dayLabel(date: string, today = dhakaDate()) {
  const p = parts(date);
  if (!p) return date;
  if (date === today) return "Today";
  if (date === previousDay(today)) return "Yesterday";
  const weekday = weekdays[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()];
  const label = `${weekday} ${p.day} ${months[p.month - 1]}`;
  return String(p.year) === today.slice(0, 4) ? label : `${label} ${p.year}`;
}

// Consecutive records with the same date form one group, in list order. A date that shows
// up again later (the server never does this) starts a new group rather than reordering.
export function groupByDay(records: Transaction[], today = dhakaDate()): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const record of records) {
    const last = groups[groups.length - 1];
    if (last && last.date === record.date) last.records.push(record);
    else groups.push({ date: record.date, label: dayLabel(record.date, today), records: [record] });
  }
  return groups;
}
