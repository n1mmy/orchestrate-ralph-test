"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { optionTags, options, tags } from "@/db/schema";
import { authedAction } from "@/lib/authed-action";
import { type ActionResult, err, ok } from "@/lib/action-result";
import { normalizeTag } from "@/lib/normalize-tag";
import { pgErrorMessage } from "@/lib/pg-error";

/**
 * The transaction-scoped Drizzle handle. We use the type of `db.transaction`'s
 * callback parameter so `syncOptionTags` can be called from any transaction
 * the action layer opens, without re-importing internal Drizzle types.
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Values a create/update form submits for an Option. The Restaurant-only
 * fields are accepted on every call — empty strings collapse to `null` so a
 * Home meal form leaves them unset, and a Restaurant form fills only the ones
 * the Household typed.
 *
 * `tags` carries the raw Tag names the Household typed; the server normalizes
 * again via `normalizeTag` before any DB write so a stale client cannot bypass
 * the `tags.lower(name)` unique index.
 */
export type OptionFormValues = {
  name: string;
  url?: string;
  notes?: string;
  // Restaurant-only — accepted on every kind, written only when relevant.
  address?: string;
  phone?: string;
  mapsUrl?: string;
  lat?: string;
  lng?: string;
  googlePlaceId?: string;
  // Tags — raw strings; the server re-normalizes before writing.
  tags?: string[];
};

/** Trim a form string and collapse blanks to `null` — the DB stores `null`. */
function nullish(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Parse a coordinate field from a form string. Blank → `null`. */
function parseCoord(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

/**
 * Map a form's values to the column set the DB expects. Home meals only carry
 * `name`, `url`, `notes`; the restaurant-only fields stay `null`.
 */
function valuesForKind(
  kind: "home" | "restaurant",
  values: OptionFormValues,
): {
  name: string;
  kind: "home" | "restaurant";
  url: string | null;
  notes: string | null;
  address: string | null;
  phone: string | null;
  mapsUrl: string | null;
  lat: number | null;
  lng: number | null;
  googlePlaceId: string | null;
} {
  return {
    name: values.name.trim(),
    kind,
    url: nullish(values.url),
    notes: nullish(values.notes),
    address: kind === "restaurant" ? nullish(values.address) : null,
    phone: kind === "restaurant" ? nullish(values.phone) : null,
    mapsUrl: kind === "restaurant" ? nullish(values.mapsUrl) : null,
    lat: kind === "restaurant" ? parseCoord(values.lat) : null,
    lng: kind === "restaurant" ? parseCoord(values.lng) : null,
    googlePlaceId:
      kind === "restaurant" ? nullish(values.googlePlaceId) : null,
  };
}

/**
 * Resolve a Tag name to its `tags.id`, reusing an existing row when the name
 * already exists (case-insensitively).
 *
 * The strategy is an idempotent `insert ... on conflict do nothing` against
 * the `tags.lower(name)` unique index, with a `select` fallback for the
 * conflict case. The retry-once is the subtle part: under a concurrent
 * same-Tag insert the loser's `on conflict do nothing` returns no row *and*
 * the loser's first `select` can miss the winner's not-yet-committed row.
 * One retry is enough because the winner's transaction has committed by then.
 *
 * The Tag name passed in is assumed to be already normalized by the caller
 * (`syncOptionTags` filters and normalizes the incoming set); we still pass
 * the normalized value to keep the data clean and the unique index honest.
 */
export async function resolveTagId(tx: Tx, name: string): Promise<string> {
  const canonical = normalizeTag(name);
  for (let attempt = 0; attempt < 2; attempt++) {
    // No `target` — the `tags` table has exactly one unique index
    // (`tags_lower_name_unique` on `lower(name)`), so `on conflict do
    // nothing` falls on it. `returning` is empty when the conflict swallowed
    // the insert; that is the signal to fall through to the `select`.
    const inserted = await tx
      .insert(tags)
      .values({ name: canonical })
      .onConflictDoNothing()
      .returning({ id: tags.id });
    if (inserted.length > 0) return inserted[0].id;

    const found = await tx
      .select({ id: tags.id })
      .from(tags)
      .where(sql`lower(${tags.name}) = ${canonical}`)
      .limit(1);
    if (found.length > 0) return found[0].id;
  }
  // The race window cannot stay open across two attempts — the loser's
  // winning sibling transaction has committed by the second `select`. If we
  // genuinely land here, the DB is in an unexpected state and a thrown error
  // is correct.
  throw new Error(`resolveTagId: could not resolve tag "${canonical}"`);
}

/**
 * Replace the Option's Tag set with the given raw names. Runs inside the
 * caller's transaction so the Option write and the Tag sync commit
 * atomically — half-applied state is impossible.
 *
 * The incoming names are normalized via `normalizeTag` and deduped through a
 * `Set` (blank entries are filtered out); then the Option's existing
 * `option_tags` rows are deleted and re-inserted against the resolved tag
 * ids. Re-using `resolveTagId` means "Pasta" attached when "pasta" already
 * exists reuses the existing row rather than duplicating it.
 *
 * Tag edits are not retroactive — only matters once ranking exists
 * (ticket 04), but the data model here must not assume otherwise: we never
 * mutate `tags.name`, only attach and detach `option_tags` rows.
 */
export async function syncOptionTags(
  tx: Tx,
  optionId: string,
  rawTags: string[],
): Promise<void> {
  const canonical = Array.from(
    new Set(rawTags.map(normalizeTag).filter((t) => t !== "")),
  );

  await tx.delete(optionTags).where(eq(optionTags.optionId, optionId));

  if (canonical.length === 0) return;

  const ids = await Promise.all(canonical.map((name) => resolveTagId(tx, name)));
  // Defensive dedupe — two distinct names can never resolve to the same id
  // under the unique index, but the typing does not enforce that.
  const uniqueIds = Array.from(new Set(ids));
  await tx
    .insert(optionTags)
    .values(uniqueIds.map((tagId) => ({ optionId, tagId })));
}

/**
 * Create a new Option. The write runs inside a transaction so the Tag sync
 * commits atomically with it. A blank name is rejected inline.
 */
export const createOption = authedAction(
  async (
    kind: "home" | "restaurant",
    values: OptionFormValues,
  ): Promise<ActionResult<{ id: string }>> => {
    if (values.name.trim() === "") return err("Enter a name");
    const row = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(options)
        .values(valuesForKind(kind, values))
        .returning({ id: options.id });
      await syncOptionTags(tx, inserted.id, values.tags ?? []);
      return inserted;
    });
    revalidatePath("/catalog");
    return ok({ id: row.id });
  },
);

/**
 * Update an existing Option. Same transaction discipline as `createOption`.
 */
export const updateOption = authedAction(
  async (
    id: string,
    kind: "home" | "restaurant",
    values: OptionFormValues,
  ): Promise<ActionResult> => {
    if (values.name.trim() === "") return err("Enter a name");
    await db.transaction(async (tx) => {
      await tx
        .update(options)
        .set(valuesForKind(kind, values))
        .where(eq(options.id, id));
      await syncOptionTags(tx, id, values.tags ?? []);
    });
    revalidatePath("/catalog");
    return ok();
  },
);

/**
 * Archive an Option (`active = false`). The Option leaves the default Catalog
 * list and Tonight, but its Log history is untouched — that is the whole
 * point of Archive over Hard-delete.
 */
export const archiveOption = authedAction(
  async (id: string): Promise<ActionResult> => {
    await db
      .update(options)
      .set({ active: false })
      .where(eq(options.id, id));
    revalidatePath("/catalog");
    return ok();
  },
);

/**
 * Hard-delete an Option. Allowed only for an Option with zero Log entries —
 * the `dinner_log.option_id` `ON DELETE RESTRICT` constraint enforces that at
 * the DB level. A `23503` is translated by `pgErrorMessage` into the inline
 * "In your log — archive instead" message rather than a 500.
 */
export const deleteOption = authedAction(
  async (id: string): Promise<ActionResult> => {
    try {
      await db.delete(options).where(eq(options.id, id));
    } catch (error) {
      const message = pgErrorMessage(error);
      if (message !== null) return err(message);
      throw error;
    }
    revalidatePath("/catalog");
    return ok();
  },
);

