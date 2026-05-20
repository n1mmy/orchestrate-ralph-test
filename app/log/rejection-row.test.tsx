import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// Stub the server-action module — the row's button handlers must not call into
// `db` during a unit test. The DB-backed behavior is covered by
// `app/rejection-actions.db.test.ts`. The row's contract here is the inline-
// edit / inline-confirm-delete UI shape (§17), the linked Option name, and the
// quiet "reason" line beneath the name.
vi.mock("../rejection-actions", () => ({
  updateRejection: vi.fn(async () => ({ ok: true })),
  deleteRejection: vi.fn(async () => ({ ok: true })),
}));

import { RejectionRow } from "./rejection-row";
import type { LogOptionChoice, LogRejectionRow } from "@/db/queries";

const CHOICES: LogOptionChoice[] = [
  { id: "opt-1", name: "Pasta", kind: "home", active: true },
  { id: "opt-2", name: "Sushi Place", kind: "restaurant", active: true },
];

function rejection(overrides: Partial<LogRejectionRow> = {}): LogRejectionRow {
  return {
    id: "rej-1",
    optionId: "opt-2",
    optionName: "Sushi Place",
    kind: "restaurant",
    rejectedOn: "2026-05-19",
    reason: "feeling pasta-ish",
    ...overrides,
  };
}

describe("RejectionRow", () => {
  it("renders the Option name linked to its detail page and the reason as a quiet line", () => {
    render(
      <ul>
        <RejectionRow rejection={rejection()} optionChoices={CHOICES} />
      </ul>,
    );
    const link = screen.getByRole("link", { name: "Sushi Place" });
    expect(link.getAttribute("href")).toBe("/catalog/opt-2");
    expect(screen.getByText("feeling pasta-ish")).toBeDefined();
    // "Rejected" meta label appears so the row is distinguishable from a
    // logged Dinner under the same date header.
    expect(screen.getByText("Rejected")).toBeDefined();
  });

  it("renders cleanly with no reason text when the Rejection has no reason", () => {
    render(
      <ul>
        <RejectionRow
          rejection={rejection({ reason: null })}
          optionChoices={CHOICES}
        />
      </ul>,
    );
    // No reason line; the Option name link still shows.
    expect(screen.getByRole("link", { name: "Sushi Place" })).toBeDefined();
    expect(screen.queryByText("feeling pasta-ish")).toBeNull();
  });

  it("swaps Delete for an inline 'Delete · Cancel' confirm step (no modal)", () => {
    render(
      <ul>
        <RejectionRow rejection={rejection()} optionChoices={CHOICES} />
      </ul>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("button", { name: "Delete" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Cancel returns the row to the default Edit · Delete cluster", () => {
    render(
      <ul>
        <RejectionRow rejection={rejection()} optionChoices={CHOICES} />
      </ul>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Edit" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDefined();
  });

  it("Edit expands the row in place into the shared rejection form (Option, date, reason)", () => {
    render(
      <ul>
        <RejectionRow rejection={rejection()} optionChoices={CHOICES} />
      </ul>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    // The form fields — Option select, date input, reason input — are
    // labelled the way the underlying `RejectionForm` lays them out.
    expect(
      screen.getByRole("combobox", { name: "Option" }),
    ).toBeDefined();
    const date = screen.getByLabelText("Date") as HTMLInputElement;
    expect(date.value).toBe("2026-05-19");
    const reason = screen.getByLabelText("Reason (optional)") as HTMLInputElement;
    expect(reason.value).toBe("feeling pasta-ish");
    // Save / Cancel buttons replace the default action cluster.
    expect(screen.getByRole("button", { name: "Save" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined();
  });
});
