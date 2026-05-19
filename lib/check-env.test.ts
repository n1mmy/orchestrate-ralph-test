import { describe, it, expect } from "vitest";
import { envProblems, isValidIanaZone } from "./check-env";

describe("isValidIanaZone", () => {
  it("accepts canonical IANA zones", () => {
    expect(isValidIanaZone("America/New_York")).toBe(true);
    expect(isValidIanaZone("Europe/London")).toBe(true);
    expect(isValidIanaZone("UTC")).toBe(true);
  });

  it("rejects garbage strings", () => {
    expect(isValidIanaZone("Not/A_Zone")).toBe(false);
    expect(isValidIanaZone("EST5EDT_bogus")).toBe(false);
    expect(isValidIanaZone("")).toBe(false);
  });
});

describe("envProblems", () => {
  const ok = {
    DATABASE_URL: "postgres://x",
    APP_SECRET: "s",
    APP_PASSWORD: "p",
    APP_TZ: "America/New_York",
  };

  it("returns no problems for a clean env", () => {
    expect(envProblems(ok)).toEqual([]);
  });

  it("flags every missing required var", () => {
    const result = envProblems({});
    // 4 required vars; APP_TZ being missing is reported as required-missing,
    // not as an invalid-zone — only set-but-invalid zones get the extra row.
    expect(result.length).toBe(4);
    expect(result.some((m) => m.includes("DATABASE_URL"))).toBe(true);
    expect(result.some((m) => m.includes("APP_SECRET"))).toBe(true);
    expect(result.some((m) => m.includes("APP_PASSWORD"))).toBe(true);
    expect(result.some((m) => m.includes("APP_TZ"))).toBe(true);
  });

  it("treats empty-string env vars as missing", () => {
    const result = envProblems({ ...ok, DATABASE_URL: "" });
    expect(result.some((m) => m.includes("DATABASE_URL"))).toBe(true);
  });

  it("flags an invalid APP_TZ even when it is set", () => {
    const result = envProblems({ ...ok, APP_TZ: "Mars/Olympus_Mons" });
    expect(result.length).toBe(1);
    expect(result[0]).toMatch(/APP_TZ/);
    expect(result[0]).toMatch(/IANA/);
  });
});
