import { describe, expect, it } from "vitest";

import { optionKind } from "../db/schema";

describe("walking skeleton", () => {
  it("declares the `option_kind` enum with the two valid kinds", () => {
    expect(optionKind.enumValues).toEqual(["home", "restaurant"]);
  });
});
