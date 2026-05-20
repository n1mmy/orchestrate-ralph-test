/**
 * Pure grouping helper for the Log screen.
 *
 * Splits a newest-first list of Log entries into the "Upcoming" strip
 * (future dates, soonest-first) and the reverse-chronological history
 * grouped by date. The history slice keeps multiple entries on the same
 * date together so the screen can render them as one Dinner under one
 * header ("Today" / "Yesterday" / "Fri, May 16").
 */
import type { LogEntry } from "@/db/queries";

export type DayGroup = {
  date: string;
  entries: LogEntry[];
};

export type GroupedLog = {
  upcoming: DayGroup[];
  past: DayGroup[];
};

export function groupLog(entries: readonly LogEntry[], today: string): GroupedLog {
  const upcomingMap = new Map<string, LogEntry[]>();
  const pastMap = new Map<string, LogEntry[]>();
  for (const entry of entries) {
    const target = entry.eatenOn > today ? upcomingMap : pastMap;
    const list = target.get(entry.eatenOn) ?? [];
    list.push(entry);
    target.set(entry.eatenOn, list);
  }
  const upcoming: DayGroup[] = Array.from(upcomingMap.entries())
    // soonest-first
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, entries]) => ({ date, entries }));
  const past: DayGroup[] = Array.from(pastMap.entries())
    // newest-first
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, entries]) => ({ date, entries }));
  return { upcoming, past };
}

/**
 * Friendly header for a SQL `date` relative to `today` — "Today",
 * "Tomorrow", "Yesterday", or `Fri, May 16`.
 */
export function dayHeader(date: string, today: string): string {
  if (date === today) return "Today";
  // Compare integer epoch-day for the ±1 cases — avoids `new Date(string)`
  // surprises with timezone offsets.
  const [ty, tm, td] = today.split("-").map(Number);
  const [dy, dm, dd] = date.split("-").map(Number);
  const todayMs = Date.UTC(ty, tm - 1, td);
  const dateMs = Date.UTC(dy, dm - 1, dd);
  const diffDays = Math.round((dateMs - todayMs) / 86_400_000);
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  // Format `Fri, May 16` from UTC components so the result is deterministic.
  const utc = new Date(dateMs);
  return utc.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
