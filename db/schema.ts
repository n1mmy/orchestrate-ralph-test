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
 * The v1 Drizzle schema for Pick Me a Dinner — four tables. Domain terms come
 * from `.scratch/pick-me-a-dinner/CONTEXT.md`. (The shipped app also carries a
 * `rejections` table; that is a later phase, deliberately out of v1.)
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
