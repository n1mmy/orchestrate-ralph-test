/**
 * Read-side queries.
 *
 * `getActiveCatalog` powers `/catalog` (the Catalog screen).
 * `getTonightData` powers `/` (the Tonight screen) — active Options with
 * their Tags plus the non-future Log entries joined to active Options
 * only, so the ranking engine can compute Scores in one pass.
 * `getLog` powers `/log` — every Log entry joined to its Option (Active
 * and Archived), newest `eaten_on` first.
 *
 * The Tag join is stubbed in the v1 slice — ticket 04 wires Tag attachment
 * — so the Tag arrays are empty until that ticket lands. Tonight ranking
 * still computes correctly: a tagless Option's variety equals its
 * anti-repeat, so the ranking degenerates to pure per-Option recency.
 */
import { and, asc, desc, eq, lte } from "drizzle-orm";

import { db } from "./index";
import { dinnerLog, options, optionTags, rejections, tags } from "./schema";

/**
 * Every Tag name currently in the catalog, ascending. Feeds the `TagInput`
 * autocomplete suggestions on the Catalog form.
 */
export async function getAllTagNames(): Promise<string[]> {
  const rows = await db
    .select({ name: tags.name })
    .from(tags)
    .orderBy(asc(tags.name));
  return rows.map((row) => row.name);
}

export type CatalogRow = {
  id: string;
  name: string;
  kind: "home" | "restaurant";
  url: string | null;
  notes: string | null;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  googlePlaceId: string | null;
  mapsUrl: string | null;
  tags: string[];
};

export type ActiveCatalog = {
  home: CatalogRow[];
  restaurants: CatalogRow[];
};

export async function getActiveCatalog(): Promise<ActiveCatalog> {
  const rows = await db
    .select({
      id: options.id,
      name: options.name,
      kind: options.kind,
      url: options.url,
      notes: options.notes,
      address: options.address,
      phone: options.phone,
      lat: options.lat,
      lng: options.lng,
      googlePlaceId: options.googlePlaceId,
      mapsUrl: options.mapsUrl,
    })
    .from(options)
    .where(eq(options.active, true))
    .orderBy(asc(options.name));

  // Tag names per Option. The join may yield no rows for any Option without
  // Tags; the result map carries empty arrays for those Options.
  const tagRows = await db
    .select({
      optionId: optionTags.optionId,
      name: tags.name,
    })
    .from(optionTags)
    .innerJoin(tags, eq(optionTags.tagId, tags.id));

  const tagsByOption = new Map<string, string[]>();
  for (const row of tagRows) {
    const list = tagsByOption.get(row.optionId) ?? [];
    list.push(row.name);
    tagsByOption.set(row.optionId, list);
  }

  const home: CatalogRow[] = [];
  const restaurants: CatalogRow[] = [];
  for (const row of rows) {
    const enriched: CatalogRow = {
      ...row,
      tags: tagsByOption.get(row.id) ?? [],
    };
    if (row.kind === "home") {
      home.push(enriched);
    } else {
      restaurants.push(enriched);
    }
  }

  return { home, restaurants };
}

/**
 * Tonight read model. The ranking engine only needs a slim subset of each
 * row — `id`, `name`, `kind`, `tags`, `url`, `phone` — so the page renders
 * straight from this shape without a second mapping step.
 */
export type TonightOption = {
  id: string;
  name: string;
  kind: "home" | "restaurant";
  tags: string[];
  url: string | null;
  phone: string | null;
  /** Free-text notes — `null` when absent. Used by AI search snapshots. */
  notes: string | null;
};

export type TonightLogEntry = {
  optionId: string;
  /** SQL `date` string — the page converts to epoch-day before ranking. */
  eatenOn: string;
  /** Free-text note — `null` when absent. Used by AI search snapshots. */
  note: string | null;
};

/**
 * Today's `dinner_log` rows — the input the two-mode Tonight screen uses
 * to switch between picker and decided mode. `createdAt` is the Pick
 * order; `id` is the handle `deleteLogEntry` takes when the Household
 * uses the inline Remove control.
 *
 * `phone` is always null for a Home meal — the Restaurant-only field
 * just passes through whatever the schema carries.
 */
export type TonightTodayLogEntry = {
  id: string;
  optionId: string;
  createdAt: Date;
};

export type TonightData = {
  options: TonightOption[];
  entries: TonightLogEntry[];
  /**
   * The subset of `entries` dated today (the Household's calendar day in
   * `APP_TZ`), with the Log entry id and `createdAt` carried so the
   * decided block can render in Pick order and the Remove control can
   * address each entry by id.
   */
  todayEntries: TonightTodayLogEntry[];
};

/**
 * Active Options with their Tags, plus the Log entries with
 * `eaten_on <= today` joined to active Options only. The ranking engine
 * uses these two lists to compute Scores; planned (future) dinners are
 * deliberately excluded so they don't move the ranking until their date
 * arrives.
 */
export async function getTonightData(todaySql: string): Promise<TonightData> {
  const rows = await db
    .select({
      id: options.id,
      name: options.name,
      kind: options.kind,
      url: options.url,
      phone: options.phone,
      notes: options.notes,
    })
    .from(options)
    .where(eq(options.active, true))
    .orderBy(asc(options.name));

  const tagRows = await db
    .select({
      optionId: optionTags.optionId,
      name: tags.name,
    })
    .from(optionTags)
    .innerJoin(tags, eq(optionTags.tagId, tags.id));

  const tagsByOption = new Map<string, string[]>();
  for (const tagRow of tagRows) {
    const list = tagsByOption.get(tagRow.optionId) ?? [];
    list.push(tagRow.name);
    tagsByOption.set(tagRow.optionId, list);
  }

  // Only entries for *active* Options influence the ranking — archiving an
  // Option must not perturb anyone else's Score (per CONTEXT.md).
  const logRows = await db
    .select({
      optionId: dinnerLog.optionId,
      eatenOn: dinnerLog.eatenOn,
      note: dinnerLog.note,
    })
    .from(dinnerLog)
    .innerJoin(options, eq(dinnerLog.optionId, options.id))
    .where(and(eq(options.active, true), lte(dinnerLog.eatenOn, todaySql)));

  // Today's Log entries — the input to the picker/decided-mode split.
  // Unlike `logRows` we keep this set unfiltered by `options.active`: an
  // Option that has been Picked tonight and then Archived is still a
  // real Pick the screen knows how to skip (its row is absent from
  // `decidedRows`, so `splitTonight` drops the entry).
  const todayRows = await db
    .select({
      id: dinnerLog.id,
      optionId: dinnerLog.optionId,
      createdAt: dinnerLog.createdAt,
    })
    .from(dinnerLog)
    .where(eq(dinnerLog.eatenOn, todaySql));

  return {
    options: rows.map((row) => ({
      ...row,
      tags: tagsByOption.get(row.id) ?? [],
    })),
    entries: logRows.map((row) => ({
      optionId: row.optionId,
      eatenOn: row.eatenOn,
      note: row.note,
    })),
    todayEntries: todayRows.map((row) => ({
      id: row.id,
      optionId: row.optionId,
      createdAt: row.createdAt,
    })),
  };
}

/**
 * Log screen read model. Every entry joined to its Option (Active and
 * Archived), newest `eaten_on` first. The screen handles the
 * "Upcoming" / past split and the by-date grouping client-side.
 */
export type LogEntry = {
  id: string;
  eatenOn: string;
  note: string | null;
  option: {
    id: string;
    name: string;
    kind: "home" | "restaurant";
    active: boolean;
  };
};

export async function getLog(): Promise<LogEntry[]> {
  const rows = await db
    .select({
      id: dinnerLog.id,
      eatenOn: dinnerLog.eatenOn,
      note: dinnerLog.note,
      optionId: options.id,
      optionName: options.name,
      optionKind: options.kind,
      optionActive: options.active,
    })
    .from(dinnerLog)
    .innerJoin(options, eq(dinnerLog.optionId, options.id))
    .orderBy(desc(dinnerLog.eatenOn), desc(dinnerLog.createdAt));

  return rows.map((row) => ({
    id: row.id,
    eatenOn: row.eatenOn,
    note: row.note,
    option: {
      id: row.optionId,
      name: row.optionName,
      kind: row.optionKind,
      active: row.optionActive,
    },
  }));
}

/**
 * Convenience for forms: every Option (Active + Archived), name-ordered,
 * to populate the Log screen's edit/add `<select>`.
 */
export type SelectableOption = {
  id: string;
  name: string;
  kind: "home" | "restaurant";
  active: boolean;
};

export async function getAllOptionsForSelect(): Promise<SelectableOption[]> {
  return db
    .select({
      id: options.id,
      name: options.name,
      kind: options.kind,
      active: options.active,
    })
    .from(options)
    .orderBy(asc(options.name));
}

/**
 * One Option by id, joined to its Tag names. Returns `null` when the id
 * matches no row — including the malformed-uuid case, which would
 * otherwise crash the Postgres driver with `22P02`. The Option detail
 * page maps `null` to `notFound()`.
 *
 * Not filtered by `active` — the detail page is reachable for an
 * Archived Option (ticket 14 wires the un-archive control).
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getOptionById(id: string): Promise<OptionDetail | null> {
  // Screen a malformed id rather than letting Postgres reject it with
  // `22P02 invalid_text_representation` — the page maps `null` to a 404.
  if (!UUID_RE.test(id)) return null;

  const rows = await db
    .select({
      id: options.id,
      name: options.name,
      kind: options.kind,
      url: options.url,
      notes: options.notes,
      active: options.active,
      address: options.address,
      phone: options.phone,
      lat: options.lat,
      lng: options.lng,
      googlePlaceId: options.googlePlaceId,
      mapsUrl: options.mapsUrl,
    })
    .from(options)
    .where(eq(options.id, id));

  if (rows.length === 0) return null;
  const row = rows[0];

  const tagRows = await db
    .select({ name: tags.name })
    .from(optionTags)
    .innerJoin(tags, eq(optionTags.tagId, tags.id))
    .where(eq(optionTags.optionId, id))
    .orderBy(asc(tags.name));

  return {
    ...row,
    tags: tagRows.map((t) => t.name),
  };
}

/**
 * Every Log entry for a single Option, joined to its Option for the
 * `EntryRow` shape — newest `eaten_on` first. The detail page calls
 * this once per request and hands the result to `groupByDay`.
 */
export async function getOptionLog(optionId: string): Promise<LogEntry[]> {
  if (!UUID_RE.test(optionId)) return [];
  const rows = await db
    .select({
      id: dinnerLog.id,
      eatenOn: dinnerLog.eatenOn,
      note: dinnerLog.note,
      optionId: options.id,
      optionName: options.name,
      optionKind: options.kind,
      optionActive: options.active,
    })
    .from(dinnerLog)
    .innerJoin(options, eq(dinnerLog.optionId, options.id))
    .where(eq(dinnerLog.optionId, optionId))
    .orderBy(desc(dinnerLog.eatenOn), desc(dinnerLog.createdAt));

  return rows.map((row) => ({
    id: row.id,
    eatenOn: row.eatenOn,
    note: row.note,
    option: {
      id: row.optionId,
      name: row.optionName,
      kind: row.optionKind,
      active: row.optionActive,
    },
  }));
}

/**
 * Every Tag in the catalog with its id and name, ascending — feeds any
 * caller that needs to look up Tag ids by name. The Option detail page
 * doesn't need ids today, but `rankOption`-driven Tag chips only need
 * the names, so the simpler `getAllTagNames` is preferred for that path.
 */
export type TagRow = { id: string; name: string };

export async function getAllTags(): Promise<TagRow[]> {
  return db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .orderBy(asc(tags.name));
}

/**
 * Full Log of every active Option — past and future-dated Planned dinners
 * alike — for the AI search snapshot. Counterpart of `getTonightData`'s
 * `entries` list, which filters `eaten_on <= today` for the deterministic
 * ranking; the AI path needs the future too so the model can reason about
 * what is already planned.
 *
 * Joined to active Options only, mirroring `getTonightData`'s active
 * filter on Log entries — archived history doesn't feed search.
 */
export async function getFullLogForSnapshot(): Promise<TonightLogEntry[]> {
  const rows = await db
    .select({
      optionId: dinnerLog.optionId,
      eatenOn: dinnerLog.eatenOn,
      note: dinnerLog.note,
    })
    .from(dinnerLog)
    .innerJoin(options, eq(dinnerLog.optionId, options.id))
    .where(eq(options.active, true))
    .orderBy(desc(dinnerLog.eatenOn));

  return rows.map((row) => ({
    optionId: row.optionId,
    eatenOn: row.eatenOn,
    note: row.note,
  }));
}

/**
 * Every Rejection joined to its (active) Option — full history, past *and*
 * future-dated rows alike — for the AI search snapshot. The `lib/rejections`
 * partitioner splits this into today's group (which suppresses) and
 * everything else (which doesn't); see `aiSearchAction`.
 *
 * Active Options only, mirroring the Log join above — a Rejection of an
 * Archived Option doesn't surface to the model.
 *
 * Newest `rejected_on` first; `created_at` breaks a same-day tie so the
 * latest Rejection of an Option sits at the top of its group inside the
 * stable `partitionRejections` sort.
 */
export type SnapshotRejectionRow = {
  optionId: string;
  /** SQL date string `YYYY-MM-DD`. */
  rejectedOn: string;
  reason: string | null;
  optionName: string;
  kind: "home" | "restaurant";
  tags: string[];
};

export async function getRejections(): Promise<SnapshotRejectionRow[]> {
  const rows = await db
    .select({
      optionId: rejections.optionId,
      rejectedOn: rejections.rejectedOn,
      reason: rejections.reason,
      optionName: options.name,
      kind: options.kind,
    })
    .from(rejections)
    .innerJoin(options, eq(rejections.optionId, options.id))
    .where(eq(options.active, true))
    .orderBy(desc(rejections.rejectedOn), desc(rejections.createdAt));

  // Tag names per Option — the snapshot block needs them for readability.
  // One join keyed only by the Options we just selected would be a wash;
  // the Tag table is small, so a single fetch matches `getActiveCatalog`.
  const tagRows = await db
    .select({ optionId: optionTags.optionId, name: tags.name })
    .from(optionTags)
    .innerJoin(tags, eq(optionTags.tagId, tags.id));

  const tagsByOption = new Map<string, string[]>();
  for (const tagRow of tagRows) {
    const list = tagsByOption.get(tagRow.optionId) ?? [];
    list.push(tagRow.name);
    tagsByOption.set(tagRow.optionId, list);
  }

  return rows.map((row) => ({
    optionId: row.optionId,
    rejectedOn: row.rejectedOn,
    reason: row.reason,
    optionName: row.optionName,
    kind: row.kind,
    tags: tagsByOption.get(row.optionId) ?? [],
  }));
}

/**
 * Today's Rejections joined to their (active) Option. Drives the Tonight
 * screen's `rejectedIds` Set and any "Rejected tonight" surface. Joined
 * inner to `options` filtered by `active = true` so an Archived Option's
 * dangling Rejection doesn't surface in the picker filter; the same
 * `getRejections` join used by AI search uses the same filter for the
 * same reason.
 *
 * Newest first by `created_at` — the latest Rejection sits at the top of
 * any "Rejected tonight" disclosure.
 */
export type TodayRejection = {
  /** The `rejections.id` — the handle a "Bring back" action takes. */
  id: string;
  /** The rejected Option's id. */
  optionId: string;
  /** The Option's display name (active Options only). */
  optionName: string;
  /** The reason the Household typed, or `null` when they left it blank. */
  reason: string | null;
};

export async function getTodayRejections(
  todaySqlDate: string,
): Promise<TodayRejection[]> {
  const rows = await db
    .select({
      id: rejections.id,
      optionId: rejections.optionId,
      optionName: options.name,
      reason: rejections.reason,
    })
    .from(rejections)
    .innerJoin(options, eq(rejections.optionId, options.id))
    .where(
      and(
        eq(rejections.rejectedOn, todaySqlDate),
        eq(options.active, true),
      ),
    )
    .orderBy(desc(rejections.createdAt));

  return rows.map((row) => ({
    id: row.id,
    optionId: row.optionId,
    optionName: row.optionName,
    reason: row.reason,
  }));
}

/**
 * Every Rejection joined to its Option for the Log screen's by-date
 * grouping. Not filtered by `active` — an Archived Option's past
 * Rejections still belong on the Log timeline (mirroring `getLog`).
 *
 * Ordered `desc(rejectedOn)` then `asc(name)` so a single day's
 * Rejections sit alphabetically beside that day's Dinner.
 */
export type LogRejectionRow = {
  id: string;
  optionId: string;
  optionName: string;
  kind: "home" | "restaurant";
  rejectedOn: string;
  reason: string | null;
};

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
    .innerJoin(options, eq(rejections.optionId, options.id))
    .orderBy(desc(rejections.rejectedOn), asc(options.name));

  return rows.map((row) => ({
    id: row.id,
    optionId: row.optionId,
    optionName: row.optionName,
    kind: row.kind,
    rejectedOn: row.rejectedOn,
    reason: row.reason,
  }));
}

/**
 * Every Rejection for a single Option in the same `LogRejectionRow`
 * shape — newest `rejected_on` first, ties broken by `createdAt`
 * (newest entry on that date sits on top). The Option detail page
 * calls this once per request.
 *
 * Not filtered by `active`: the detail page is reachable for an
 * Archived Option, and its past Rejections stay on the page.
 */
export async function getOptionRejections(
  optionId: string,
): Promise<LogRejectionRow[]> {
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
    .innerJoin(options, eq(rejections.optionId, options.id))
    .where(eq(rejections.optionId, optionId))
    .orderBy(desc(rejections.rejectedOn), desc(rejections.createdAt));

  return rows.map((row) => ({
    id: row.id,
    optionId: row.optionId,
    optionName: row.optionName,
    kind: row.kind,
    rejectedOn: row.rejectedOn,
    reason: row.reason,
  }));
}

/**
 * Every Option (Active and Archived) as a thin `{ id, name, kind }`,
 * name-ordered. Powers the dated-Rejection edit/add `<select>` on the
 * Log screen and the Option detail page — the management surface needs
 * Archived Options too because Archived history can still be edited.
 */
export type OptionChoice = {
  id: string;
  name: string;
  kind: "home" | "restaurant";
};

export async function getOptionChoices(): Promise<OptionChoice[]> {
  return db
    .select({ id: options.id, name: options.name, kind: options.kind })
    .from(options)
    .orderBy(asc(options.name));
}
