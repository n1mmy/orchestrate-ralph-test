/**
 * Drizzle schema for Pick Me a Dinner (v1 — four tables).
 *
 * The shipped app also carries a `rejections` table; that lands in a later
 * phase. See `.scratch/pick-me-a-dinner/CONTEXT.md` for the domain language.
 */
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
  uniqueIndex,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const optionKind = pgEnum("option_kind", ["home", "restaurant"]);

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
  // Restaurant-only fields — nullable for home meals.
  address: text("address"),
  phone: text("phone"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  googlePlaceId: text("google_place_id"),
  mapsUrl: text("maps_url"),
});

/**
 * Tag names are stored as-typed. Case-insensitive uniqueness is enforced by a
 * functional unique index on `lower(name)` — no `citext` extension required.
 */
export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
  },
  (table) => ({
    lowerNameUnique: uniqueIndex("tags_lower_name_unique").on(
      sql`lower(${table.name})`,
    ),
  }),
);

/**
 * Join table between Options and Tags. Both FKs cascade so deleting either
 * end cleans up its mapping; Postgres does not auto-index FK columns, so
 * the `tag_id` index is added explicitly.
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
  (table) => ({
    pk: primaryKey({ columns: [table.optionId, table.tagId] }),
    tagIdIdx: index("option_tags_tag_id_idx").on(table.tagId),
  }),
);

/**
 * `dinner_log` is the realised history. `eaten_on` may be past, today, or
 * future (a future row is a Planned dinner). The FK is `ON DELETE RESTRICT`
 * so an Option with any Log entry cannot be hard-deleted — it must be
 * Archived (see CONTEXT.md and ADR-0001).
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
  (table) => ({
    optionEatenOnUnique: unique("dinner_log_option_eaten_on_unique").on(
      table.optionId,
      table.eatenOn,
    ),
  }),
);
