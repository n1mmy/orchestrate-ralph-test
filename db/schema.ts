import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * The Drizzle schema for Pick Me a Dinner. The v1 cut is four tables (Options,
 * Tags, Option↔Tag, Log); `rejections` lands in Phase 5 (ticket 19) — a member
 * of the Household turns down an Option for tonight, it leaves tonight's
 * deterministic picker, and it returns on its own the next calendar day.
 * Domain terms come from `.scratch/pick-me-a-dinner/CONTEXT.md`.
 */

/** An Option is exactly one kind: a Home meal or a Restaurant. */
export const optionKind = pgEnum("option_kind", ["home", "restaurant"]);

/**
 * `options` — the Catalog. The unified table for both kinds of Option; the
 * restaurant-only fields are nullable and unused for Home meals.
 */
export const options = pgTable("options", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: optionKind("kind").notNull(),
  url: text("url"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Restaurant-only fields — nullable.
  address: text("address"),
  phone: text("phone"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  googlePlaceId: text("google_place_id"),
  mapsUrl: text("maps_url"),
});

/**
 * `tags` — free-form, case-insensitive labels. Case-insensitive uniqueness is
 * enforced by a unique index on `lower(name)` (no `citext` extension).
 */
export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
  },
  (table) => [
    uniqueIndex("tags_lower_name_unique").on(sql`lower(${table.name})`),
  ],
);

/**
 * `option_tags` — the many-to-many join between Options and Tags. Both FKs
 * cascade on delete; the composite primary key is `(option_id, tag_id)`. A
 * separate index on `tag_id` covers the reverse lookup — Postgres does not
 * auto-index FK columns.
 */
export const optionTags = pgTable(
  "option_tags",
  {
    optionId: uuid("option_id")
      .notNull()
      .references(() => options.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.optionId, table.tagId] }),
    index("option_tags_tag_id_idx").on(table.tagId),
  ],
);

/**
 * `dinner_log` — the Log. One row records that one Option was (or will be)
 * eaten on one date. The Option FK is `ON DELETE RESTRICT`: an Option with Log
 * history is Archived, never hard-deleted. `(option_id, eaten_on)` is unique —
 * the same Option cannot be logged twice on one date.
 */
export const dinnerLog = pgTable(
  "dinner_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    optionId: uuid("option_id")
      .notNull()
      .references(() => options.id, { onDelete: "restrict" }),
    eatenOn: date("eaten_on").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("dinner_log_option_eaten_on_unique").on(
      table.optionId,
      table.eatenOn,
    ),
  ],
);

/**
 * `rejections` — a Household turn-down of an Option for one calendar day.
 * A Rejection is **not** a Log entry and carries no Score weight; it is a
 * presentation filter only (ADR-0003, ADR-0006). The Option FK is
 * `ON DELETE CASCADE` because a Rejection of a hard-deleted Option is
 * meaningless and the cascade keeps a Rejection from blocking the
 * Catalog's hard-delete (allowed only for Options with no Log history —
 * ADR-0001). `reason` is optional. `rejected_on` is the Household's
 * calendar day in `APP_TZ`; the today's-rejections query keys on it, so a
 * new calendar day empties the result on its own — no day-boundary code.
 * The table is single-household-small, so the only index needed at this
 * phase is on `rejected_on` to support that query.
 * `(option_id, rejected_on)` is unique: manual dated entry (ADR-0008)
 * means the same date can be revisited by hand, so the same Option must
 * not carry two Rejections for one date. This supersedes ADR-0006's note
 * that no such constraint was needed while Rejections were live-only.
 */
export const rejections = pgTable(
  "rejections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    optionId: uuid("option_id")
      .notNull()
      .references(() => options.id, { onDelete: "cascade" }),
    reason: text("reason"),
    rejectedOn: date("rejected_on").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("rejections_rejected_on_idx").on(table.rejectedOn),
    unique("rejections_option_rejected_on_unique").on(
      table.optionId,
      table.rejectedOn,
    ),
  ],
);

/** Row type for the `rejections` table — the shape `db.select()` returns. */
export type Rejection = typeof rejections.$inferSelect;
