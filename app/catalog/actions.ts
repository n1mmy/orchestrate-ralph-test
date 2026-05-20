"use server";

/**
 * Catalog server actions.
 *
 * Every mutation goes through one of these — there are no direct DB writes
 * from the UI layer. Each action is wrapped in `authedAction` (a pass-through
 * until ticket 06 lands the real password-cookie check) and returns the
 * shared `ActionResult` shape. The two writers (`createOption`,
 * `updateOption`) run inside a `db.transaction` so that the Tag sync ticket 04
 * adds commits atomically with the Option write.
 */
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { options } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { authedAction } from "@/lib/authed-action";
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
};

function normalizeName(raw: string): string {
  return raw.trim();
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

export const createOption = authedAction(
  async (kind: OptionKind, values: OptionFormValues): Promise<ActionResult> => {
    const name = normalizeName(values.name);
    if (name === "") {
      return { ok: false, error: "Enter a name" };
    }
    await db.transaction(async (tx) => {
      await tx.insert(options).values({
        name,
        kind,
        url: blankString(values.url),
        notes: blankString(values.notes),
        ...restaurantFields(values, kind),
      });
      // Tag sync (ticket 04) hooks in here, inside the same transaction.
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
      // Tag sync (ticket 04) hooks in here, inside the same transaction.
    });
    revalidatePath("/catalog");
    return { ok: true };
  },
);

export const archiveOption = authedAction(
  async (id: string): Promise<ActionResult> => {
    await db.update(options).set({ active: false }).where(eq(options.id, id));
    revalidatePath("/catalog");
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
    revalidatePath("/catalog");
    return { ok: true };
  },
);
