import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Stub the server-action module so the row's button handlers do not call into
// `db` during a unit test — the DB-backed behavior is covered by
// `app/log/actions.db.test.ts`. The row's contract here is that the Option
// name renders as a `next/link` to `/catalog/[id]` (ticket 27).
vi.mock("./actions", () => ({
  deleteLogEntry: vi.fn(async () => ({ ok: true })),
  updateLogEntry: vi.fn(async () => ({ ok: true })),
}));

import { LogEntryRow } from "./log-entry-row";
import type { LogEntry, LogOptionChoice } from "@/db/queries";

const CHOICES: LogOptionChoice[] = [
  { id: "opt-1", name: "Pasta", kind: "home", active: true },
];

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: "entry-1",
    optionId: "opt-1",
    eatenOn: "2026-05-19",
    note: null,
    option: {
      id: "opt-1",
      name: "Pasta",
      kind: "home",
      active: true,
    },
    ...overrides,
  };
}

describe("LogEntryRow", () => {
  it("links the Option name to its detail page at /catalog/[id]", () => {
    render(
      <ul>
        <LogEntryRow entry={entry()} optionChoices={CHOICES} />
      </ul>,
    );
    const link = screen.getByRole("link", { name: "Pasta" });
    expect(link.getAttribute("href")).toBe("/catalog/opt-1");
  });

  it("renders the optional note as a quiet line under the name link", () => {
    render(
      <ul>
        <LogEntryRow
          entry={entry({ note: "with parmesan" })}
          optionChoices={CHOICES}
        />
      </ul>,
    );
    expect(screen.getByRole("link", { name: "Pasta" })).toBeDefined();
    expect(screen.getByText("with parmesan")).toBeDefined();
  });
});
