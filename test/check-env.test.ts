import { describe, expect, it, vi } from "vitest";

import {
  checkEnvOnBoot,
  envProblems,
  isValidTimeZone,
} from "../lib/check-env";

const goodEnv = {
  DATABASE_URL: "postgres://u:p@host:5432/db",
  APP_SECRET: "a-long-random-string",
  APP_PASSWORD: "shared-household-password",
  APP_TZ: "America/Los_Angeles",
};

describe("envProblems", () => {
  it("returns no problems for a fully-populated env", () => {
    expect(envProblems(goodEnv)).toEqual([]);
  });

  it("flags every missing required key", () => {
    const problems = envProblems({});
    expect(problems).toContain("DATABASE_URL is required but is not set");
    expect(problems).toContain("APP_SECRET is required but is not set");
    expect(problems).toContain("APP_PASSWORD is required but is not set");
    expect(problems).toContain("APP_TZ is required but is not set");
  });

  it("treats an empty string as missing", () => {
    const problems = envProblems({ ...goodEnv, APP_PASSWORD: "" });
    expect(problems).toContain("APP_PASSWORD is required but is not set");
  });

  it("rejects an APP_TZ the runtime does not recognise", () => {
    const problems = envProblems({
      ...goodEnv,
      APP_TZ: "Atlantis/Lost_City",
    });
    expect(problems.some((p) => p.includes("APP_TZ"))).toBe(true);
    expect(problems.some((p) => p.includes("Atlantis/Lost_City"))).toBe(
      true,
    );
  });

  it("accepts a real IANA zone for APP_TZ", () => {
    expect(envProblems({ ...goodEnv, APP_TZ: "Europe/London" })).toEqual([]);
  });
});

describe("isValidTimeZone", () => {
  it("accepts real IANA zones", () => {
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("America/Los_Angeles")).toBe(true);
  });

  it("rejects nonsense", () => {
    expect(isValidTimeZone("Not/A/Zone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});

describe("checkEnvOnBoot", () => {
  it("returns true and does not exit when the env is clean", () => {
    const log = vi.fn();
    const exit = vi.fn() as unknown as (code: number) => never;
    expect(checkEnvOnBoot(goodEnv, log, exit)).toBe(true);
    expect(exit).not.toHaveBeenCalled();
  });

  it("logs every problem loudly and exits non-zero on a missing key", () => {
    const log = vi.fn();
    const exit = vi.fn() as unknown as (code: number) => never;
    checkEnvOnBoot({ ...goodEnv, DATABASE_URL: "" }, log, exit);
    expect(exit).toHaveBeenCalledWith(1);
    const logged = (log as unknown as { mock: { calls: string[][] } }).mock
      .calls.map((c) => c[0])
      .join("\n");
    expect(logged).toMatch(/FATAL/);
    expect(logged).toMatch(/DATABASE_URL/);
  });

  it("exits non-zero on an invalid APP_TZ", () => {
    const log = vi.fn();
    const exit = vi.fn() as unknown as (code: number) => never;
    checkEnvOnBoot(
      { ...goodEnv, APP_TZ: "Atlantis/Lost_City" },
      log,
      exit,
    );
    expect(exit).toHaveBeenCalledWith(1);
    const logged = (log as unknown as { mock: { calls: string[][] } }).mock
      .calls.map((c) => c[0])
      .join("\n");
    expect(logged).toMatch(/APP_TZ/);
  });
});
