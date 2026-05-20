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
import { dinnerLog, options, optionTags, tags } from "./schema";

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
};

export type TonightLogEntry = {
  optionId: string;
  /** SQL `date` string — the page converts to epoch-day before ranking. */
  eatenOn: string;
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
