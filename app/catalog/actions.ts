"use server";

/**
 * Catalog server actions.
 *
 * Every mutation goes through one of these — there are no direct DB writes
 * from the UI layer. Each action is wrapped in `authedAction` (a pass-through
 * until ticket 06 lands the real password-cookie check) and returns the
 * shared `ActionResult` shape. The two writers (`createOption`,
 * `updateOption`) run inside a `db.transaction` so that the Tag sync commits
 * atomically with the Option write.
 */
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { optionTags, options, tags } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { authedAction } from "@/lib/authed-action";
import { normalizeTag } from "@/lib/normalize-tag";
import { pgErrorMessage } from "@/lib/pg-error";

export type OptionKind = "home" | "restaurant";

export type OptionFormValues = {
  name: string;
  url: string | null;
  notes: string | null;
  address: string | null;
  phone: string | null;
  mapsUrl: string | null;
  lat: number | null;
  lng: number | null;
  googlePlaceId: string | null;
  tags: string[];
};

function normalizeName(raw: string): string {
  return raw.trim();
}

/**
 * Revalidate every surface that names an Option's identity. The Catalog
 * lists Options by name; the Option detail page renders the same fields
 * deeper. A control behaves identically wherever it is invoked
 * (ADR-0007), so any Option mutation marks both stale. The wildcard
 * `revalidatePath("/catalog/[id]", "page")` marks every Option's detail
 * page without naming the id explicitly.
 */
function revalidateCatalog(): void {
  revalidatePath("/catalog");
  revalidatePath("/catalog/[id]", "page");
}

function blankString(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

function restaurantFields(values: OptionFormValues, kind: OptionKind) {
  if (kind === "home") {
    return {
      address: null,
      phone: null,
      mapsUrl: null,
      lat: null,
      lng: null,
      googlePlaceId: null,
    };
  }
  return {
    address: blankString(values.address),
    phone: blankString(values.phone),
    mapsUrl: blankString(values.mapsUrl),
    lat: values.lat ?? null,
    lng: values.lng ?? null,
    googlePlaceId: blankString(values.googlePlaceId),
  };
}

/**
 * Drizzle exposes the transaction object's type via the runtime client; we
 * accept the same shape for the helpers below so they can be called inside
 * `db.transaction(async (tx) => …)`.
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Resolve a Tag name to its row id, creating the row when missing.
 *
 * The `tags.lower(name)` functional unique index guarantees one row per
 * case-insensitive name. `insert(...).onConflictDoNothing()` makes the insert
 * idempotent; a `select` then reads the row id — either the one we just
 * inserted or the existing one we lost the race to. Under a concurrent
 * same-Tag insert the loser's first `select` can return zero rows (the
 * winner has inserted but not committed when the loser reads), so we retry
 * the `select` once. A second miss is unexpected and surfaces as a throw.
 */
async function resolveTagId(tx: Tx, name: string): Promise<string> {
  await tx.insert(tags).values({ name }).onConflictDoNothing();
  for (let attempt = 0; attempt < 2; attempt++) {
    const [row] = await tx
      .select({ id: tags.id })
      .from(tags)
      .where(sql`lower(${tags.name}) = ${name}`)
      .limit(1);
    if (row) return row.id;
  }
  throw new Error(`resolveTagId: could not resolve tag "${name}"`);
}

/**
 * Replace an Option's Tag set with `rawTags`.
 *
 * Normalizes via `normalizeTag` and dedupes; deletes the Option's existing
 * `option_tags` rows; then re-inserts one row per Tag, calling
 * `resolveTagId` for each. Runs inside the caller's transaction so the Tag
 * write commits atomically with the Option write.
 */
export async function syncOptionTags(
  tx: Tx,
  optionId: string,
  rawTags: string[],
): Promise<void> {
  const normalized = Array.from(
    new Set(rawTags.map(normalizeTag).filter((tag) => tag !== "")),
  );
  await tx.delete(optionTags).where(eq(optionTags.optionId, optionId));
  if (normalized.length === 0) return;
  for (const name of normalized) {
    const tagId = await resolveTagId(tx, name);
    await tx
      .insert(optionTags)
      .values({ optionId, tagId })
      .onConflictDoNothing();
  }
}

export const createOption = authedAction(
  async (kind: OptionKind, values: OptionFormValues): Promise<ActionResult> => {
    const name = normalizeName(values.name);
    if (name === "") {
      return { ok: false, error: "Enter a name" };
    }
    await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(options)
        .values({
          name,
          kind,
          url: blankString(values.url),
          notes: blankString(values.notes),
          ...restaurantFields(values, kind),
        })
        .returning({ id: options.id });
      await syncOptionTags(tx, inserted.id, values.tags);
    });
    revalidatePath("/catalog");
    return { ok: true };
  },
);

export const updateOption = authedAction(
  async (
    id: string,
    kind: OptionKind,
    values: OptionFormValues,
  ): Promise<ActionResult> => {
    const name = normalizeName(values.name);
    if (name === "") {
      return { ok: false, error: "Enter a name" };
    }
    await db.transaction(async (tx) => {
      await tx
        .update(options)
        .set({
          name,
          kind,
          url: blankString(values.url),
          notes: blankString(values.notes),
          ...restaurantFields(values, kind),
        })
        .where(eq(options.id, id));
      await syncOptionTags(tx, id, values.tags);
    });
    revalidateCatalog();
    return { ok: true };
  },
);

export const archiveOption = authedAction(
  async (id: string): Promise<ActionResult> => {
    await db.update(options).set({ active: false }).where(eq(options.id, id));
    revalidateCatalog();
    return { ok: true };
  },
);

/**
 * Restore an Archived Option to active. Mirrors `archiveOption` — a thin
 * authedAction DB write that flips `active` back to `true` and revalidates
 * the same Catalog surfaces. Benign by design: the detail page's
 * "Un-archive" affordance runs this in one tap because the worst it can
 * do is restore an Option the Household had previously hidden.
 */
export const unarchiveOption = authedAction(
  async (id: string): Promise<ActionResult> => {
    await db.update(options).set({ active: true }).where(eq(options.id, id));
    revalidateCatalog();
    return { ok: true };
  },
);

export const deleteOption = authedAction(
  async (id: string): Promise<ActionResult> => {
    try {
      await db.delete(options).where(eq(options.id, id));
    } catch (error) {
      const friendly = pgErrorMessage(error);
      if (friendly !== null) {
        return { ok: false, error: friendly };
      }
      throw error;
    }
    revalidateCatalog();
    return { ok: true };
  },
);
