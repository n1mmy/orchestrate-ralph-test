/**
 * Resolve `YYYY-MM-DD` plus an IANA time zone into the UTC instant of local
 * midnight on that date.
 *
 * Two-pass: the first guess uses the zone offset at the **UTC** midnight of
 * the date; we then recompute the offset at the candidate instant and apply
 * it. The second pass corrects the rare case where the date's local midnight
 * straddles a DST transition — the first guess can land an hour off,
 * misnaming the date when converted back. Two passes are sufficient for IANA
 * zones, which never shift by more than a couple of hours.
 */

function partsAt(timeZone: string, instant: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(instant);
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") lookup[part.type] = part.value;
  }
  const year = Number(lookup.year);
  const month = Number(lookup.month);
  const day = Number(lookup.day);
  // Intl uses "24" for midnight in 24h `en-US`; normalise to 0.
  const hourRaw = Number(lookup.hour);
  const hour = hourRaw === 24 ? 0 : hourRaw;
  const minute = Number(lookup.minute);
  const second = Number(lookup.second);
  return { year, month, day, hour, minute, second };
}

/** Zone offset in milliseconds at `instant` for `timeZone` (local − UTC). */
function offsetMs(timeZone: string, instant: Date): number {
  const parts = partsAt(timeZone, instant);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - instant.getTime();
}

/**
 * UTC `Date` for local midnight of `YYYY-MM-DD` in `timeZone`.
 *
 * @throws when `dateYmd` does not parse as a `YYYY-MM-DD` head.
 */
export function localMidnightUtc(dateYmd: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateYmd);
  if (!match) {
    throw new Error(`localMidnightUtc: not a YYYY-MM-DD head: ${dateYmd}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // First pass: offset at the UTC midnight of the date.
  const utcMidnight = Date.UTC(year, month - 1, day);
  const firstOffset = offsetMs(timeZone, new Date(utcMidnight));
  const firstGuess = utcMidnight - firstOffset;

  // Second pass: recompute the offset at the candidate instant. This
  // corrects the DST-straddle case.
  const secondOffset = offsetMs(timeZone, new Date(firstGuess));
  return new Date(utcMidnight - secondOffset);
}
