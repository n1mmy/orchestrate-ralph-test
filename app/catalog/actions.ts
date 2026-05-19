"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { options } from "@/db/schema";
import { authedAction } from "@/lib/authed-action";
import { type ActionResult, err, ok } from "@/lib/action-result";
import { pgErrorMessage } from "@/lib/pg-error";

/**
 * Values a create/update form submits for an Option. The Restaurant-only
 * fields are accepted on every call — empty strings collapse to `null` so a
 * Home meal form leaves them unset, and a Restaurant form fills only the ones
 * the Household typed.
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
 * Create a new Option. The write runs inside a transaction so the Tag sync
 * (ticket 03) commits atomically with it. A blank name is rejected inline.
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
      // Tag sync (ticket 03) will run here, in the same transaction.
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
      // Tag sync (ticket 03) will run here, in the same transaction.
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
