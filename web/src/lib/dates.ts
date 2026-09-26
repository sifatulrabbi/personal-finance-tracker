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

function previousDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}
