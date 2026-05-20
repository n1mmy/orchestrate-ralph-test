import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "./index";
import { dinnerLog, options, optionTags, rejections, tags } from "./schema";
import type { RankLogEntry, RankOption } from "@/lib/ranking";
import type { RejectionRow } from "@/lib/rejections";
import type { TodayLogEntry } from "@/lib/tonights-dinner";
import { epochDayFromSqlDate } from "@/lib/local-day";

/**
 * A single Option as the Catalog screen consumes it — every column from the
 * `options` row plus the Option's Tag names (an empty array until ticket 03
 * lands the Tag CRUD; the join is wired now so the shape does not churn).
 */
export type CatalogOption = {
  id: string;
  name: string;
  kind: "home" | "restaurant";
  url: string | null;
  notes: string | null;
  active: boolean;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  googlePlaceId: string | null;
  mapsUrl: string | null;
  tags: string[];
};

/**
 * The Catalog as the Catalog screen renders it — active Options only
 * (`active = true`), ordered by name, split by kind. Archived Options are
 * deliberately excluded from the default Catalog list per CONTEXT.md's
 * Archived definition; the Catalog's "Archived (N)" disclosure (ticket 26)
 * loads them separately via `getArchivedOptions`.
 */
export type ActiveCatalog = {
  home: CatalogOption[];
  restaurants: CatalogOption[];
};

/**
 * One Archived Option as the Catalog's "Archived (N)" disclosure links to its
 * detail page (ticket 26). Narrowed to just `{ id, name }` — the disclosure
 * renders a `next/link` to `/catalog/[id]` and shows the Option's name; no
 * other field is needed at that surface.
 */
export type ArchivedOption = {
  id: string;
  name: string;
};

/**
 * The Archived Catalog — `active = false` Options ordered by name. Drives the
 * Catalog's collapsed "Archived (N)" disclosure, which links each entry to
 * its `/catalog/[id]` detail page. Kept distinct from `getActiveCatalog` so
 * the active list reads exactly as before and Archived Options stay invisible
 * outside this one disclosure.
 */
export async function getArchivedOptions(): Promise<ArchivedOption[]> {
  const rows = await db
    .select({ id: options.id, name: options.name })
    .from(options)
    .where(eq(options.active, false))
    .orderBy(asc(options.name));
  return rows;
}

/**
 * Every Tag name in the Catalog, alphabetical. Feeds the `TagInput`
 * autocomplete on the Catalog screen — the suggestions list is the whole set
 * of existing Tags filtered client-side as the Household types. Names are
 * already canonical (`normalizeTag` runs on every write) so no normalization
 * step is needed here. Note: Tags that no longer have any Option attached
 * remain in the `tags` row store and so will appear here; per CONTEXT.md
 * that is harmless — they simply stop appearing on any Option.
 */
export async function getAllTagNames(): Promise<string[]> {
  const rows = await db
    .select({ name: tags.name })
    .from(tags)
    .orderBy(asc(sql`lower(${tags.name})`));
  return rows.map((r) => r.name);
}

/**
 * Load the active Catalog: `active = true` Options ordered by name, each
 * carrying its Tag names. The Tag join is a left-join so an Option with no
 * Tags still appears.
 */
export async function getActiveCatalog(): Promise<ActiveCatalog> {
  const rows = await db
    .select({
      option: options,
      tagName: tags.name,
    })
    .from(options)
    .leftJoin(optionTags, eq(optionTags.optionId, options.id))
    .leftJoin(tags, eq(tags.id, optionTags.tagId))
    .where(eq(options.active, true))
    .orderBy(asc(options.name));

  const byId = new Map<string, CatalogOption>();
  for (const { option, tagName } of rows) {
    let entry = byId.get(option.id);
    if (!entry) {
      entry = {
        id: option.id,
        name: option.name,
        kind: option.kind,
        url: option.url,
        notes: option.notes,
        active: option.active,
        address: option.address,
        phone: option.phone,
        lat: option.lat,
        lng: option.lng,
        googlePlaceId: option.googlePlaceId,
        mapsUrl: option.mapsUrl,
        tags: [],
      };
      byId.set(option.id, entry);
    }
    if (tagName) entry.tags.push(tagName);
  }

  const all = Array.from(byId.values());
  return {
    home: all.filter((o) => o.kind === "home"),
    restaurants: all.filter((o) => o.kind === "restaurant"),
  };
}

/**
 * The three inputs the Tonight screen needs:
 *
 * - **`options`** — the active Catalog, each Option carrying the fields the
 *   ranker reads (`id`, `name`, `kind`, `tags`) plus the two pass-through
 *   restaurant fields (`url`, `phone`) used by later phases, and `notes` for
 *   the AI-search snapshot builder (ticket 14).
 * - **`entries`** — non-future Log rows, joined to active Options only.
 *   Filtered to `eaten_on <= todaySql` so Planned dinners do not move the
 *   ranking, and joined inwardly to `options.active = true` so an Archived
 *   Option's history does not count (per CONTEXT.md's Recency definition).
 *   The ranking math has not changed — `rankTonight` still receives exactly
 *   this set.
 * - **`todayEntries`** — the `dinner_log` rows whose `eaten_on` equals today,
 *   each `{ id, optionId, createdAt }`. The Tonight screen reads this set to
 *   decide its mode (empty → picker, non-empty → decided) and to render the
 *   Tonight's-dinner panel in pick order; `id` is the row handle a "Remove"
 *   action deletes by. Not yet filtered to active Options — an entry whose
 *   Option was Archived after being Picked still appears here, and
 *   `splitTonight` skips it silently if it is absent from the decided
 *   ranking.
 *
 * `eaten_on` is converted to an integer epoch-day at the boundary so the
 * downstream ranker sees only integers — no date arithmetic happens in SQL,
 * and DST cannot perturb the day delta. See ADR-0003 and `lib/local-day.ts`.
 *
 * The AI-search snapshot wants the **full** Log — past and future-dated rows
 * alike — and so reads from `getFullLogForSnapshot` below, not from
 * `getTonightData`. The deterministic ranking keeps its own non-future
 * `entries` here; only the AI path sees the future.
 */
export type TonightOption = RankOption & { notes: string | null };

export type TonightLogEntry = {
  optionId: string;
  /** SQL `date` string (`YYYY-MM-DD`) in the Household's calendar. */
  eatenOn: string;
  note: string | null;
};

export type TonightData = {
  options: TonightOption[];
  entries: RankLogEntry[];
  todayEntries: TodayLogEntry[];
};

export async function getTonightData(todaySql: string): Promise<TonightData> {
  // Active Options with their Tags — left-joined so tagless Options still
  // appear. Same fan-out / re-grouping shape as `getActiveCatalog`. `notes` is
  // carried for the AI-search snapshot builder (ticket 14); the ranker
  // ignores it.
  const optionRows = await db
    .select({
      id: options.id,
      name: options.name,
      kind: options.kind,
      url: options.url,
      phone: options.phone,
      notes: options.notes,
      tagName: tags.name,
    })
    .from(options)
    .leftJoin(optionTags, eq(optionTags.optionId, options.id))
    .leftJoin(tags, eq(tags.id, optionTags.tagId))
    .where(eq(options.active, true))
    .orderBy(asc(options.name));

  const byId = new Map<string, TonightOption>();
  for (const row of optionRows) {
    let entry = byId.get(row.id);
    if (!entry) {
      entry = {
        id: row.id,
        name: row.name,
        kind: row.kind,
        url: row.url,
        phone: row.phone,
        notes: row.notes,
        tags: [],
      };
      byId.set(row.id, entry);
    }
    if (row.tagName) entry.tags.push(row.tagName);
  }

  // Log entries: non-future, joined to active Options only. Feeds the ranker
  // unchanged.
  const logRows = await db
    .select({
      optionId: dinnerLog.optionId,
      eatenOn: dinnerLog.eatenOn,
    })
    .from(dinnerLog)
    .innerJoin(options, eq(options.id, dinnerLog.optionId))
    .where(and(eq(options.active, true), lte(dinnerLog.eatenOn, todaySql)));

  const entries: RankLogEntry[] = logRows.map((r) => ({
    optionId: r.optionId,
    eatenOn: epochDayFromSqlDate(r.eatenOn),
  }));

  // Today's Log entries — the handle the decided block renders by. Includes
  // entries whose Option is Archived (no `active = true` filter) so the
  // Household still sees a settled Pick after Archiving an Option mid-evening;
  // `splitTonight` silently skips an entry whose Option is absent from the
  // active Catalog ranking.
  const todayLogRows = await db
    .select({
      id: dinnerLog.id,
      optionId: dinnerLog.optionId,
      createdAt: dinnerLog.createdAt,
    })
    .from(dinnerLog)
    .where(eq(dinnerLog.eatenOn, todaySql));

  const todayEntries: TodayLogEntry[] = todayLogRows.map((r) => ({
    id: r.id,
    optionId: r.optionId,
    createdAt: r.createdAt,
  }));

  return {
    options: Array.from(byId.values()),
    entries,
    todayEntries,
  };
}

/**
 * Every `dinner_log` row joined to an active Option, **regardless of date** —
 * past entries and future-dated Planned dinners alike — in the `TonightLogEntry`
 * shape (`{ optionId, eatenOn, note }`). Fed straight into the AI-search
 * snapshot, which wants the Household's near future (Planned dinners) in
 * addition to its history — the model, given today's date, tells plan from
 * history itself (ADR-0005, widened by ticket 30).
 *
 * Kept as raw SQL `date` strings, not integer epoch-day form, because the
 * snapshot serialises dates as strings and the model reads weekdays off them.
 *
 * The AI-snapshot counterpart of `getTonightData`'s `entries`, which filters
 * `eaten_on <= today` for the deterministic ranking. Only active Options are
 * joined, mirroring how `getTonightData` already excludes Archived Options'
 * Log rows from AI search.
 */
export async function getFullLogForSnapshot(): Promise<TonightLogEntry[]> {
  const rows = await db
    .select({
      optionId: dinnerLog.optionId,
      eatenOn: dinnerLog.eatenOn,
      note: dinnerLog.note,
    })
    .from(dinnerLog)
    .innerJoin(options, eq(options.id, dinnerLog.optionId))
    .where(eq(options.active, true));
  return rows.map((r) => ({
    optionId: r.optionId,
    eatenOn: r.eatenOn,
    note: r.note,
  }));
}

/**
 * Every Rejection joined to its **active** Option, in the `RejectionRow` shape
 * `lib/rejections.ts`'s `partitionRejections` consumes — the bare Rejection
 * fields (`optionId`, `reason`, `rejectedOn`) plus the Option's `name`, `kind`,
 * and `tags` carried alongside so the snapshot block stays readable without a
 * second lookup. Past, today, and future-dated rows all returned — the
 * partition step in `lib/rejections.ts` is the one that splits them.
 *
 * The SQL `date` string is preserved verbatim (no integer-epoch conversion —
 * the AI-search snapshot serialises dates as strings, and the ranker does not
 * read this set). Ordered newest `rejected_on` first, with `created_at`
 * breaking a same-day tie. Archived Options are excluded by the inner join on
 * `options.active = true`, mirroring how the Log already excludes Archived
 * Options' entries.
 *
 * Kept distinct from ticket 19's `getTodayRejections`: that today-only subset
 * feeds the deterministic suppression and the "Rejected tonight" disclosure,
 * while `getRejections` feeds the AI-search snapshot's full Rejection history.
 */
export async function getRejections(): Promise<RejectionRow[]> {
  const rejectionRows = await db
    .select({
      optionId: rejections.optionId,
      reason: rejections.reason,
      rejectedOn: rejections.rejectedOn,
      createdAt: rejections.createdAt,
      optionName: options.name,
      kind: options.kind,
    })
    .from(rejections)
    .innerJoin(options, eq(options.id, rejections.optionId))
    .where(eq(options.active, true))
    .orderBy(desc(rejections.rejectedOn), desc(rejections.createdAt));

  if (rejectionRows.length === 0) return [];

  // Pull the Tag names for every Option referenced — one extra query rather
  // than a left-join fan-out at the Rejection level (which would multiply
  // every Rejection by its Option's tag count and force a re-grouping).
  const optionIds = Array.from(new Set(rejectionRows.map((r) => r.optionId)));
  const tagRows = await db
    .select({
      optionId: optionTags.optionId,
      name: tags.name,
    })
    .from(optionTags)
    .innerJoin(tags, eq(tags.id, optionTags.tagId))
    .where(inArray(optionTags.optionId, optionIds));

  const tagsByOption = new Map<string, string[]>();
  for (const row of tagRows) {
    let list = tagsByOption.get(row.optionId);
    if (!list) {
      list = [];
      tagsByOption.set(row.optionId, list);
    }
    list.push(row.name);
  }

  return rejectionRows.map((r) => ({
    optionId: r.optionId,
    reason: r.reason,
    rejectedOn: r.rejectedOn,
    optionName: r.optionName,
    kind: r.kind,
    tags: tagsByOption.get(r.optionId) ?? [],
  }));
}

/**
 * A single Log entry as the Log screen renders it — every column from
 * `dinner_log` plus a small slice of the Option it was logged against. The
 * Option name is what the row displays; the kind and `active` flag let the
 * row tint by meal-kind and let the edit form's `<select>` keep an Archived
 * Option selectable (per CONTEXT.md, an entry already logged against an
 * Archived Option stays editable).
 */
export type LogEntry = {
  id: string;
  optionId: string;
  /** SQL `date` string (`YYYY-MM-DD`) in the Household's calendar. */
  eatenOn: string;
  note: string | null;
  option: {
    id: string;
    name: string;
    kind: "home" | "restaurant";
    active: boolean;
  };
};

/**
 * Every Log entry, joined to its Option, newest `eaten_on` first. The
 * `createdAt` tiebreaker keeps the order stable when two rows share a date
 * (deterministic ordering matters for grouped-by-date rendering and tests).
 *
 * Both Active and Archived Options are included — an Archived Option's past
 * Log history is part of the Household's record and must not disappear when
 * the Option is Archived.
 */
export async function getLog(): Promise<LogEntry[]> {
  const rows = await db
    .select({
      id: dinnerLog.id,
      optionId: dinnerLog.optionId,
      eatenOn: dinnerLog.eatenOn,
      note: dinnerLog.note,
      createdAt: dinnerLog.createdAt,
      option: {
        id: options.id,
        name: options.name,
        kind: options.kind,
        active: options.active,
      },
    })
    .from(dinnerLog)
    .innerJoin(options, eq(options.id, dinnerLog.optionId))
    .orderBy(desc(dinnerLog.eatenOn), desc(dinnerLog.createdAt));
  return rows.map((r) => ({
    id: r.id,
    optionId: r.optionId,
    eatenOn: r.eatenOn,
    note: r.note,
    option: r.option,
  }));
}

/**
 * The Option picker the Log edit form renders — every Option, Active and
 * Archived, alphabetical. Both kinds are included so an entry already logged
 * against an Archived Option stays editable (its current Option must remain a
 * selectable value).
 */
export type LogOptionChoice = {
  id: string;
  name: string;
  kind: "home" | "restaurant";
  active: boolean;
};

export async function getLogOptionChoices(): Promise<LogOptionChoice[]> {
  const rows = await db
    .select({
      id: options.id,
      name: options.name,
      kind: options.kind,
      active: options.active,
    })
    .from(options)
    .orderBy(asc(options.name));
  return rows;
}

/**
 * The Option picker the Rejection-edit / Rejection-create forms render
 * (tickets 32, 33). Every Option, Active and Archived, alphabetical — an
 * entry already logged against an Archived Option must stay selectable so the
 * Household can fix an old Rejection's Option without first un-archiving.
 * Distinct from `LogOptionChoice` in that the `active` flag is not needed at
 * the call site: the Rejection forms do not render an "Archived" badge today.
 */
export type OptionChoice = {
  id: string;
  name: string;
  kind: "home" | "restaurant";
};

export async function getOptionChoices(): Promise<OptionChoice[]> {
  const rows = await db
    .select({
      id: options.id,
      name: options.name,
      kind: options.kind,
    })
    .from(options)
    .orderBy(asc(options.name));
  return rows;
}

/**
 * One Rejection as the Log screen and the Option detail page render it — the
 * Rejection's own `id` (the row handle the edit and delete actions key by),
 * the Option it was made against (`optionId`, `optionName`, `kind`), the
 * dated day, and the optional `reason` text. The counterpart of `LogEntry`
 * for Rejections; both Active and Archived Options are included so an
 * Archived Option's Rejection history stays visible.
 */
export type LogRejectionRow = {
  id: string;
  optionId: string;
  optionName: string;
  kind: "home" | "restaurant";
  rejectedOn: string;
  reason: string | null;
};

/**
 * Every Rejection — past, today, and future — joined to its Option, newest
 * `rejected_on` first, then alphabetical by Option name for a stable order
 * within a date. The counterpart of `getLog`; not filtered to active Options.
 */
export async function getLogRejections(): Promise<LogRejectionRow[]> {
  const rows = await db
    .select({
      id: rejections.id,
      optionId: rejections.optionId,
      optionName: options.name,
      kind: options.kind,
      rejectedOn: rejections.rejectedOn,
      reason: rejections.reason,
    })
    .from(rejections)
    .innerJoin(options, eq(options.id, rejections.optionId))
    .orderBy(desc(rejections.rejectedOn), asc(options.name));
  return rows;
}

/**
 * Every Rejection for one Option, newest `rejected_on` first, then newest
 * `created_at` first for a stable order within a date (two same-day
 * Rejections on one Option are not possible under the unique constraint, but
 * the secondary sort keeps the query deterministic). Drives the Option detail
 * page's Rejection-history section (ticket 24); not filtered to active
 * Options — an Archived Option's own Rejection history stays visible on its
 * detail page.
 */
export async function getOptionRejections(
  optionId: string,
): Promise<LogRejectionRow[]> {
  if (!UUID_RE.test(optionId)) return [];
  const rows = await db
    .select({
      id: rejections.id,
      optionId: rejections.optionId,
      optionName: options.name,
      kind: options.kind,
      rejectedOn: rejections.rejectedOn,
      reason: rejections.reason,
      createdAt: rejections.createdAt,
    })
    .from(rejections)
    .innerJoin(options, eq(options.id, rejections.optionId))
    .where(eq(rejections.optionId, optionId))
    .orderBy(desc(rejections.rejectedOn), desc(rejections.createdAt));
  return rows.map((r) => ({
    id: r.id,
    optionId: r.optionId,
    optionName: r.optionName,
    kind: r.kind,
    rejectedOn: r.rejectedOn,
    reason: r.reason,
  }));
}

/**
 * One of today's Rejections, joined to the Option it was made against.
 * The Tonight page reads this set to suppress already-rejected Options from
 * the deterministic picker (a presentation filter, not a Score change). The
 * shape carries the Rejection's own `id` (the row handle a later "Bring
 * back" action deletes by — ticket 20), the `optionId` (the filter key),
 * the Option's `name` and `kind` (the disclosure renders both — ticket 20),
 * and the optional `reason` text the Household typed. `active = true` is
 * an inner-join filter on the query side: a Rejection of an Archived
 * Option already would not appear on Tonight, so it has nothing to render.
 */
export type TodayRejection = {
  id: string;
  optionId: string;
  optionName: string;
  optionKind: "home" | "restaurant";
  reason: string | null;
};

/**
 * One Option as the Option detail page consumes it — every field on
 * `options` (Active or Archived) plus the Option's Tag names. `active` is
 * carried so the page can branch on Archived. Restaurant-only fields are
 * nullable for a Home meal — the page renders them only when set and only
 * for a Restaurant.
 */
export type OptionDetail = {
  id: string;
  name: string;
  kind: "home" | "restaurant";
  url: string | null;
  notes: string | null;
  active: boolean;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  googlePlaceId: string | null;
  mapsUrl: string | null;
  tags: string[];
};

/**
 * Standard 8-4-4-4-12 hexadecimal UUID shape — matches Postgres's `uuid`
 * input format. Used to screen a `params.id` from the route at the query
 * boundary so a non-UUID id collapses to a clean `null` rather than a
 * Postgres-side cast error a 500 would surface to the Household.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Load one Option by id, with its Tag names. Returns `null` when no
 * `options` row matches — both for a malformed (non-UUID) id and for a
 * well-formed id matching no row. The detail page renders Next's
 * `notFound()` against this `null`, so a stale link to a hard-deleted
 * Option lands on a 404 rather than a 500.
 *
 * **Not filtered to active Options.** An Archived Option's detail page is
 * still reachable from the Log screen and from a stale link; per
 * CONTEXT.md an Archived Option's history is preserved, so its detail
 * page must keep loading.
 */
export async function getOptionById(id: string): Promise<OptionDetail | null> {
  if (!UUID_RE.test(id)) return null;
  const rows = await db
    .select({
      option: options,
      tagName: tags.name,
    })
    .from(options)
    .leftJoin(optionTags, eq(optionTags.optionId, options.id))
    .leftJoin(tags, eq(tags.id, optionTags.tagId))
    .where(eq(options.id, id));

  if (rows.length === 0) return null;
  const first = rows[0]!.option;
  const detail: OptionDetail = {
    id: first.id,
    name: first.name,
    kind: first.kind,
    url: first.url,
    notes: first.notes,
    active: first.active,
    address: first.address,
    phone: first.phone,
    lat: first.lat,
    lng: first.lng,
    googlePlaceId: first.googlePlaceId,
    mapsUrl: first.mapsUrl,
    tags: [],
  };
  for (const r of rows) {
    if (r.tagName) detail.tags.push(r.tagName);
  }
  return detail;
}

/**
 * The Option's own Log — every `dinner_log` row for `optionId`, in the
 * shape `rankOption` consumes. Filtered to non-future entries so a
 * Planned dinner does not feed the per-Option recency. Kept distinct from
 * `getTonightData`'s active-only `entries` because an Archived Option's
 * own past dinners are still visible on its detail page even though they
 * are excluded from the active Catalog ranking.
 */
export async function getOptionLog(
  optionId: string,
  todaySqlDate: string,
): Promise<RankLogEntry[]> {
  if (!UUID_RE.test(optionId)) return [];
  const rows = await db
    .select({
      optionId: dinnerLog.optionId,
      eatenOn: dinnerLog.eatenOn,
    })
    .from(dinnerLog)
    .where(
      and(
        eq(dinnerLog.optionId, optionId),
        lte(dinnerLog.eatenOn, todaySqlDate),
      ),
    );
  return rows.map((r) => ({
    optionId: r.optionId,
    eatenOn: epochDayFromSqlDate(r.eatenOn),
  }));
}

/**
 * Every `dinner_log` row for one Option, joined to that Option, in the same
 * `LogEntry` shape the Log screen consumes — newest `eaten_on` first, with
 * `created_at` breaking a same-date tie. Both past and future entries are
 * included; the Option detail page's merged History section relies on this
 * (a Planned dinner for the Option must surface under Upcoming, not be
 * filtered out the way `getOptionLog` does for ranking).
 *
 * A malformed (non-UUID) id collapses to an empty list rather than a
 * Postgres-side cast error, mirroring `getOptionById`.
 */
export async function getOptionLogEntries(
  optionId: string,
): Promise<LogEntry[]> {
  if (!UUID_RE.test(optionId)) return [];
  const rows = await db
    .select({
      id: dinnerLog.id,
      optionId: dinnerLog.optionId,
      eatenOn: dinnerLog.eatenOn,
      note: dinnerLog.note,
      createdAt: dinnerLog.createdAt,
      option: {
        id: options.id,
        name: options.name,
        kind: options.kind,
        active: options.active,
      },
    })
    .from(dinnerLog)
    .innerJoin(options, eq(options.id, dinnerLog.optionId))
    .where(eq(dinnerLog.optionId, optionId))
    .orderBy(desc(dinnerLog.eatenOn), desc(dinnerLog.createdAt));
  return rows.map((r) => ({
    id: r.id,
    optionId: r.optionId,
    eatenOn: r.eatenOn,
    note: r.note,
    option: r.option,
  }));
}

/**
 * Today's Rejections — every `rejections` row whose `rejected_on` equals
 * `todaySqlDate`, joined to its active Option, newest `created_at` first.
 *
 * Because the query keys on `rejected_on = today`, a new calendar day
 * empties the result on its own and a rejected Option reappears on Tonight
 * with no day-boundary code. The single index on `rejected_on`
 * (`rejections_rejected_on_idx`) covers the lookup.
 */
export async function getTodayRejections(
  todaySqlDate: string,
): Promise<TodayRejection[]> {
  const rows = await db
    .select({
      id: rejections.id,
      optionId: rejections.optionId,
      reason: rejections.reason,
      optionName: options.name,
      optionKind: options.kind,
    })
    .from(rejections)
    .innerJoin(options, eq(options.id, rejections.optionId))
    .where(
      and(eq(rejections.rejectedOn, todaySqlDate), eq(options.active, true)),
    )
    .orderBy(desc(rejections.createdAt));
  return rows.map((r) => ({
    id: r.id,
    optionId: r.optionId,
    optionName: r.optionName,
    optionKind: r.optionKind,
    reason: r.reason,
  }));
}
