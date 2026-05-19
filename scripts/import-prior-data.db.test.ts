import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";

import {
  localMidnightUtc,
  mapPriorData,
  runImport,
  type PriorData,
} from "./import-prior-data";
import * as schema from "@/db/schema";
import { dinnerLog, optionTags, options, tags } from "@/db/schema";

/**
 * DB integration suite for the prior-version import script. Proves the
 * mapping rules and the all-or-nothing transaction semantics — every
 * acceptance criterion the issue calls out.
 */

const sql = postgres(process.env.DATABASE_URL ?? "", { max: 1 });
const db = drizzle(sql, { schema });

async function cleanup(): Promise<void> {
  await db.delete(dinnerLog);
  await db.delete(optionTags);
  await db.delete(options);
  await db.delete(tags);
}

beforeAll(cleanup);
afterEach(cleanup);
afterAll(async () => {
  await sql.end();
});

const TZ = "America/New_York";

function priorFixture(overrides: Partial<PriorData> = {}): PriorData {
  return {
    meals: [
      {
        id: "cuid-meal-1",
        name: "Pasta",
        notes: "weeknight",
        createdAt: new Date("2024-01-01T00:00:00Z"),
        hidden: false,
        tags: ["pasta", "Italian"],
      },
      {
        id: "cuid-meal-2",
        name: "Tacos",
        notes: null,
        createdAt: new Date("2024-02-01T00:00:00Z"),
        hidden: true,
        tags: ["Mexican"],
      },
    ],
    restaurants: [
      {
        id: "cuid-rest-1",
        name: "Aji Ichi",
        notes: null,
        createdAt: new Date("2024-03-01T00:00:00Z"),
        hidden: false,
        tags: ["japanese", "sushi"],
        phoneNumber: "555-1234",
        orderUrl: "https://order.example.com/aji",
        menuUrl: null,
      },
      {
        id: "cuid-rest-2",
        name: "Curry House",
        notes: null,
        createdAt: new Date("2024-04-01T00:00:00Z"),
        hidden: false,
        tags: ["Italian"], // same canonical name as the meal — should dedupe
        phoneNumber: null,
        orderUrl: null,
        menuUrl: "https://menu.example.com/curry",
      },
    ],
    dinners: [
      {
        id: "cuid-din-1",
        date: "2024-05-10T00:00:00.000Z",
        notes: "good",
        type: "meal",
        mealId: "cuid-meal-1",
        restaurantId: null,
      },
      {
        id: "cuid-din-2",
        date: "2024-05-11T00:00:00.000Z",
        notes: null,
        type: "restaurant",
        mealId: null,
        restaurantId: "cuid-rest-1",
      },
    ],
    ...overrides,
  };
}

describe("localMidnightUtc", () => {
  it("returns the right UTC instant for a winter (EST = UTC-5) date in America/New_York", () => {
    // 2024-01-15 00:00 in America/New_York is 2024-01-15T05:00:00Z (EST).
    expect(localMidnightUtc("2024-01-15", TZ).toISOString()).toBe(
      "2024-01-15T05:00:00.000Z",
    );
  });

  it("returns the right UTC instant for a summer (EDT = UTC-4) date in America/New_York", () => {
    // 2024-07-15 00:00 in America/New_York is 2024-07-15T04:00:00Z (EDT).
    expect(localMidnightUtc("2024-07-15", TZ).toISOString()).toBe(
      "2024-07-15T04:00:00.000Z",
    );
  });

  it("lands on the correct offset for a date whose midnight straddles a DST change (spring forward)", () => {
    // 2024-03-10 is the US spring-forward day. The day starts at
    // 00:00 EST (UTC-5) = 05:00Z — DST kicks in at 02:00 local. The two-
    // pass logic must pick the *midnight* offset (EST), not the noon-UTC
    // offset (which is already EDT by 12:00Z that date).
    expect(localMidnightUtc("2024-03-10", TZ).toISOString()).toBe(
      "2024-03-10T05:00:00.000Z",
    );
  });

  it("lands on the correct offset for a fall-back day", () => {
    // 2024-11-03 fall-back: day starts at 00:00 EDT (UTC-4) = 04:00Z; the
    // transition is at 02:00 local.
    expect(localMidnightUtc("2024-11-03", TZ).toISOString()).toBe(
      "2024-11-03T04:00:00.000Z",
    );
  });
});

describe("mapPriorData", () => {
  it("inverts `hidden` into `active`", () => {
    const mapped = mapPriorData(priorFixture(), TZ);
    const pasta = mapped.options.find((o) => o.name === "Pasta");
    const tacos = mapped.options.find((o) => o.name === "Tacos");
    expect(pasta?.active).toBe(true);
    expect(tacos?.active).toBe(false);
  });

  it("coalesces orderUrl ?? menuUrl into one `url`", () => {
    const mapped = mapPriorData(priorFixture(), TZ);
    const aji = mapped.options.find((o) => o.name === "Aji Ichi");
    const curry = mapped.options.find((o) => o.name === "Curry House");
    expect(aji?.url).toBe("https://order.example.com/aji");
    expect(curry?.url).toBe("https://menu.example.com/curry");
  });

  it("maps phoneNumber → phone and leaves Restaurant address/lat/lng/google_place_id/maps_url null", () => {
    const mapped = mapPriorData(priorFixture(), TZ);
    const aji = mapped.options.find((o) => o.name === "Aji Ichi");
    expect(aji?.phone).toBe("555-1234");
    expect(aji?.address).toBeNull();
    expect(aji?.lat).toBeNull();
    expect(aji?.lng).toBeNull();
    expect(aji?.googlePlaceId).toBeNull();
    expect(aji?.mapsUrl).toBeNull();
  });

  it("leaves Home meals' url null", () => {
    const mapped = mapPriorData(priorFixture(), TZ);
    const pasta = mapped.options.find((o) => o.name === "Pasta");
    expect(pasta?.url).toBeNull();
  });

  it("normalizes tags via `normalizeTag` and dedupes across all Options", () => {
    const mapped = mapPriorData(priorFixture(), TZ);
    // 4 distinct canonical tags: pasta, italian (appears on Pasta and
    // Curry House), mexican, japanese, sushi — but italian appears under
    // two casings and should collapse.
    const tagNames = mapped.tags.map((t) => t.name).sort();
    expect(tagNames).toEqual(["italian", "japanese", "mexican", "pasta", "sushi"]);
    // All canonical (lowercased + trimmed) — `normalizeTag` was applied.
    for (const t of mapped.tags) {
      expect(t.name).toBe(t.name.trim().toLowerCase());
    }
  });

  it("dedupes a single Option's tags so duplicate casings yield one option_tag row", () => {
    const mapped = mapPriorData(
      priorFixture({
        meals: [
          {
            id: "cuid-meal-x",
            name: "Spaghetti",
            notes: null,
            createdAt: new Date("2024-01-01T00:00:00Z"),
            hidden: false,
            tags: ["Pasta", "  pasta  ", "PASTA", ""],
          },
        ],
        restaurants: [],
        dinners: [],
      }),
      TZ,
    );
    const option = mapped.options[0];
    const rowsForOption = mapped.optionTags.filter(
      (r) => r.optionId === option.id,
    );
    expect(rowsForOption).toHaveLength(1);
    expect(mapped.tags).toHaveLength(1);
    expect(mapped.tags[0].name).toBe("pasta");
  });

  it("rewires Dinner FKs onto the mapped Option uuids", () => {
    const mapped = mapPriorData(priorFixture(), TZ);
    const pasta = mapped.options.find((o) => o.name === "Pasta");
    const aji = mapped.options.find((o) => o.name === "Aji Ichi");
    const dinPasta = mapped.dinnerLog.find((d) => d.eatenOn === "2024-05-10");
    const dinAji = mapped.dinnerLog.find((d) => d.eatenOn === "2024-05-11");
    expect(dinPasta?.optionId).toBe(pasta?.id);
    expect(dinAji?.optionId).toBe(aji?.id);
    // The new ids are fresh uuids, not the prior cuids.
    expect(pasta?.id).not.toBe("cuid-meal-1");
    expect(aji?.id).not.toBe("cuid-rest-1");
  });

  it("sets dinner_log.created_at to the eaten_on date at local midnight in APP_TZ", () => {
    const mapped = mapPriorData(priorFixture(), TZ);
    const dinPasta = mapped.dinnerLog.find((d) => d.eatenOn === "2024-05-10");
    // 2024-05-10 is summer (EDT, UTC-4): midnight ET == 04:00Z.
    expect(dinPasta?.createdAt.toISOString()).toBe("2024-05-10T04:00:00.000Z");
  });

  it("throws when a Dinner references neither a Meal nor a Restaurant", () => {
    expect(() =>
      mapPriorData(
        priorFixture({
          dinners: [
            {
              id: "bad",
              date: "2024-05-10T00:00:00.000Z",
              notes: null,
              type: "meal",
              mealId: null,
              restaurantId: null,
            },
          ],
        }),
        TZ,
      ),
    ).toThrow(/neither a Meal nor a Restaurant/);
  });

  it("throws when a Dinner references an unresolvable Option id", () => {
    expect(() =>
      mapPriorData(
        priorFixture({
          dinners: [
            {
              id: "bad",
              date: "2024-05-10T00:00:00.000Z",
              notes: null,
              type: "meal",
              mealId: "cuid-does-not-exist",
              restaurantId: null,
            },
          ],
        }),
        TZ,
      ),
    ).toThrow(/unknown Option id/);
  });

  it("drops Dinner.type but keeps eaten_on (the YYYY-MM-DD head) and notes → note", () => {
    const mapped = mapPriorData(priorFixture(), TZ);
    const dinPasta = mapped.dinnerLog.find((d) => d.eatenOn === "2024-05-10");
    expect(dinPasta?.note).toBe("good");
    expect(dinPasta).not.toHaveProperty("type");
  });
});

describe("runImport", () => {
  it("inserts options, tags, option_tags, dinner_log inside one transaction", async () => {
    await runImport(priorFixture(), TZ, db);

    const allOptions = await db.select().from(options);
    expect(allOptions).toHaveLength(4);
    const allTags = await db.select().from(tags);
    expect(allTags.map((t) => t.name).sort()).toEqual([
      "italian",
      "japanese",
      "mexican",
      "pasta",
      "sushi",
    ]);
    const allLogs = await db.select().from(dinnerLog);
    expect(allLogs).toHaveLength(2);

    // Spot-check a cross-table link: the "Italian" tag is on two Options.
    const italian = allTags.find((t) => t.name === "italian");
    expect(italian).toBeDefined();
    const italianLinks = await db
      .select()
      .from(optionTags)
      .where(eq(optionTags.tagId, italian!.id));
    expect(italianLinks).toHaveLength(2);
  });

  it("rolls back fully when an insert fails — DB stays untouched", async () => {
    // Force a failure inside the transaction: two Dinners on the same
    // (option_id, eaten_on) violate the v1 unique index. The whole import
    // — including options, tags, option_tags — must roll back.
    const bad: PriorData = priorFixture({
      dinners: [
        {
          id: "din-a",
          date: "2024-05-10T00:00:00.000Z",
          notes: null,
          type: "meal",
          mealId: "cuid-meal-1",
          restaurantId: null,
        },
        {
          id: "din-b",
          date: "2024-05-10T00:00:00.000Z",
          notes: null,
          type: "meal",
          mealId: "cuid-meal-1",
          restaurantId: null,
        },
      ],
    });

    await expect(runImport(bad, TZ, db)).rejects.toThrow();

    expect(await db.select().from(options)).toHaveLength(0);
    expect(await db.select().from(tags)).toHaveLength(0);
    expect(await db.select().from(optionTags)).toHaveLength(0);
    expect(await db.select().from(dinnerLog)).toHaveLength(0);
  });

  it("rolls back fully when the mapping throws — DB stays untouched and no transaction opens", async () => {
    const bad: PriorData = priorFixture({
      dinners: [
        {
          id: "bad",
          date: "2024-05-10T00:00:00.000Z",
          notes: null,
          type: "meal",
          mealId: "cuid-does-not-exist",
          restaurantId: null,
        },
      ],
    });

    await expect(runImport(bad, TZ, db)).rejects.toThrow(/unknown Option id/);

    expect(await db.select().from(options)).toHaveLength(0);
    expect(await db.select().from(tags)).toHaveLength(0);
    expect(await db.select().from(dinnerLog)).toHaveLength(0);
  });
});
