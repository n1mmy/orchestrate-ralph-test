/**
 * DB-backed tests for the prior-data importer.
 *
 * Covers the pure mapping (`mapPriorData`) and the all-or-nothing transaction
 * shape (`runImport`). The pure mapping cases do not touch the DB.
 */
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import {
  type PriorData,
  mapPriorData,
  runImport,
} from "./import-prior-data";
import { db, queryClient } from "@/db";
import { dinnerLog, optionTags, options, tags } from "@/db/schema";

const TZ = "America/Los_Angeles";

function makeMeal(over: Partial<PriorData["meals"][number]> = {}) {
  return {
    id: `meal-${crypto.randomUUID()}`,
    name: `Meal ${crypto.randomUUID().slice(0, 6)}`,
    notes: null,
    tags: [],
    hidden: false,
    url: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  };
}

function makeRestaurant(
  over: Partial<PriorData["restaurants"][number]> = {},
) {
  return {
    id: `rest-${crypto.randomUUID()}`,
    name: `Rest ${crypto.randomUUID().slice(0, 6)}`,
    notes: null,
    tags: [],
    hidden: false,
    phoneNumber: null,
    orderUrl: null,
    menuUrl: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  };
}

function makeDinner(over: Partial<PriorData["dinners"][number]> = {}) {
  return {
    id: `dinner-${crypto.randomUUID()}`,
    date: "2026-03-15",
    notes: null,
    type: null,
    mealId: null,
    restaurantId: null,
    ...over,
  };
}

describe("mapPriorData (pure)", () => {
  it("inverts hidden into active", () => {
    const visible = makeMeal({ hidden: false });
    const archived = makeMeal({ hidden: true });
    const out = mapPriorData(
      { meals: [visible, archived], restaurants: [], dinners: [] },
      TZ,
    );
    const visibleRow = out.options.find((o) => o.name === visible.name);
    const archivedRow = out.options.find((o) => o.name === archived.name);
    expect(visibleRow?.active).toBe(true);
    expect(archivedRow?.active).toBe(false);
  });

  it("coalesces orderUrl / menuUrl into url and maps phoneNumber", () => {
    const orderOnly = makeRestaurant({
      orderUrl: "https://order.example",
      menuUrl: null,
      phoneNumber: "555-0100",
    });
    const menuOnly = makeRestaurant({
      orderUrl: null,
      menuUrl: "https://menu.example",
      phoneNumber: null,
    });
    const both = makeRestaurant({
      orderUrl: "https://order.example",
      menuUrl: "https://menu.example",
    });
    const neither = makeRestaurant({ orderUrl: null, menuUrl: null });

    const out = mapPriorData(
      {
        meals: [],
        restaurants: [orderOnly, menuOnly, both, neither],
        dinners: [],
      },
      TZ,
    );
    const byName = new Map(out.options.map((o) => [o.name, o]));
    expect(byName.get(orderOnly.name)?.url).toBe("https://order.example");
    expect(byName.get(orderOnly.name)?.phone).toBe("555-0100");
    expect(byName.get(menuOnly.name)?.url).toBe("https://menu.example");
    expect(byName.get(menuOnly.name)?.phone).toBeNull();
    expect(byName.get(both.name)?.url).toBe("https://order.example");
    expect(byName.get(neither.name)?.url).toBeNull();
  });

  it("normalizes and dedupes tags across all Options into shared tags + option_tags rows", () => {
    const m1 = makeMeal({ tags: ["Pasta", "pasta", "  PASTA "] });
    const m2 = makeMeal({ tags: ["pasta", "Fish"] });
    const out = mapPriorData(
      { meals: [m1, m2], restaurants: [], dinners: [] },
      TZ,
    );
    expect(out.tags.map((t) => t.name).sort()).toEqual(["fish", "pasta"]);
    // m1 has one tag (pasta only), m2 has two.
    const m1Id = out.options.find((o) => o.name === m1.name)!.id;
    const m2Id = out.options.find((o) => o.name === m2.name)!.id;
    const m1Tags = out.optionTags.filter((ot) => ot.optionId === m1Id);
    const m2Tags = out.optionTags.filter((ot) => ot.optionId === m2Id);
    expect(m1Tags).toHaveLength(1);
    expect(m2Tags).toHaveLength(2);
  });

  it("sets dinner_log.created_at to local midnight in APP_TZ", () => {
    const meal = makeMeal();
    const dinner = makeDinner({ mealId: meal.id, date: "2026-03-15" });
    const out = mapPriorData(
      { meals: [meal], restaurants: [], dinners: [dinner] },
      TZ,
    );
    const row = out.dinnerLog[0];
    // 2026-03-15 local midnight in America/Los_Angeles is post-DST: PDT
    // (UTC-7), so 07:00 UTC.
    expect(row.createdAt.toISOString()).toBe("2026-03-15T07:00:00.000Z");
    expect(row.eatenOn).toBe("2026-03-15");
  });

  it("local midnight survives a DST-straddling date", () => {
    // 2026-03-08 is DST spring-forward in America/Los_Angeles. Local
    // midnight that night is PST (UTC-8), so 08:00 UTC.
    const meal = makeMeal();
    const dinner = makeDinner({ mealId: meal.id, date: "2026-03-08" });
    const out = mapPriorData(
      { meals: [meal], restaurants: [], dinners: [dinner] },
      TZ,
    );
    expect(out.dinnerLog[0].createdAt.toISOString()).toBe(
      "2026-03-08T08:00:00.000Z",
    );
  });

  it("absent Restaurant and Home fields default to null", () => {
    const meal = makeMeal();
    const rest = makeRestaurant();
    const out = mapPriorData(
      { meals: [meal], restaurants: [rest], dinners: [] },
      TZ,
    );
    const mealRow = out.options.find((o) => o.name === meal.name)!;
    const restRow = out.options.find((o) => o.name === rest.name)!;
    expect(mealRow.url).toBeNull();
    expect(mealRow.address).toBeNull();
    expect(mealRow.phone).toBeNull();
    expect(restRow.address).toBeNull();
    expect(restRow.lat).toBeNull();
    expect(restRow.lng).toBeNull();
    expect(restRow.googlePlaceId).toBeNull();
    expect(restRow.mapsUrl).toBeNull();
  });

  it("throws for a Dinner that references neither a Meal nor a Restaurant", () => {
    expect(() =>
      mapPriorData(
        {
          meals: [],
          restaurants: [],
          dinners: [makeDinner({ mealId: null, restaurantId: null })],
        },
        TZ,
      ),
    ).toThrow(/references neither/);
  });

  it("throws for an unresolvable Dinner FK", () => {
    expect(() =>
      mapPriorData(
        {
          meals: [],
          restaurants: [],
          dinners: [makeDinner({ mealId: "ghost", restaurantId: null })],
        },
        TZ,
      ),
    ).toThrow(/unknown id/);
  });
});

describe("runImport (DB)", () => {
  afterAll(async () => {
    await queryClient.end({ timeout: 5 });
  });

  it("inserts options, tags, option_tags, and dinner_log in one transaction", async () => {
    const meal = makeMeal({ tags: ["Alpha", "alpha"] });
    const rest = makeRestaurant({
      tags: ["Beta"],
      orderUrl: "https://order.example",
      phoneNumber: "555-0100",
    });
    const dinner = makeDinner({ mealId: meal.id, date: "2026-04-10" });

    const result = await runImport(
      { meals: [meal], restaurants: [rest], dinners: [dinner] },
      TZ,
    );

    const optionIds = result.options.map((o) => o.id);
    const inserted = await db
      .select({ id: options.id, kind: options.kind, phone: options.phone })
      .from(options)
      .where(inArray(options.id, optionIds));
    expect(inserted).toHaveLength(2);

    const restRow = inserted.find((r) => r.kind === "restaurant");
    expect(restRow?.phone).toBe("555-0100");

    const tagRows = await db
      .select({ name: tags.name })
      .from(tags)
      .where(sql`lower(${tags.name}) IN ('alpha', 'beta')`);
    const tagNames = new Set(tagRows.map((r) => r.name.toLowerCase()));
    expect(tagNames.has("alpha")).toBe(true);
    expect(tagNames.has("beta")).toBe(true);

    const logRows = await db
      .select({ optionId: dinnerLog.optionId, createdAt: dinnerLog.createdAt })
      .from(dinnerLog)
      .where(inArray(dinnerLog.id, result.dinnerLog.map((d) => d.id)));
    expect(logRows).toHaveLength(1);
    expect(logRows[0].createdAt.toISOString()).toBe(
      "2026-04-10T07:00:00.000Z",
    );

    // option_tags rows are present for both Options.
    const otRows = await db
      .select()
      .from(optionTags)
      .where(inArray(optionTags.optionId, optionIds));
    expect(otRows.length).toBeGreaterThanOrEqual(2);
  });

  it("rolls back fully on any failure (no rows persisted)", async () => {
    // Craft an import where the mapping succeeds but the DB insert fails:
    // two dinner_log rows on the same (option_id, eaten_on) violate the
    // composite UNIQUE.
    const meal = makeMeal();
    const dupId = `meal-${crypto.randomUUID()}`;
    meal.id = dupId;
    const dinnerA = makeDinner({ mealId: dupId, date: "2026-05-01" });
    const dinnerB = makeDinner({ mealId: dupId, date: "2026-05-01" });

    const before = await db
      .select({ id: options.id })
      .from(options)
      .where(eq(options.name, meal.name));
    expect(before).toHaveLength(0);

    await expect(
      runImport(
        { meals: [meal], restaurants: [], dinners: [dinnerA, dinnerB] },
        TZ,
      ),
    ).rejects.toThrow();

    const after = await db
      .select({ id: options.id })
      .from(options)
      .where(eq(options.name, meal.name));
    expect(after).toHaveLength(0);
  });
});
