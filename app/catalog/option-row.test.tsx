import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// Stub the server-action module so the row's button handlers do not call into
// `db` during a unit test — the DB-backed behavior is covered by
// `actions.db.test.ts`. The row's contract here is purely the inline-confirm
// UI shape (§17): tap "Archive"/"Delete" → action cluster becomes
// "Archive · Cancel"/"Delete · Cancel"; no modal.
vi.mock("./actions", () => ({
  archiveOption: vi.fn(async () => ({ ok: true })),
  deleteOption: vi.fn(async () => ({ ok: true })),
  createOption: vi.fn(async () => ({ ok: true, value: { id: "x" } })),
  updateOption: vi.fn(async () => ({ ok: true })),
}));

import { OptionRow } from "./option-row";
import type { CatalogOption } from "@/db/queries";

const OPTION: CatalogOption = {
  id: "1",
  name: "Pasta",
  kind: "home",
  url: null,
  notes: null,
  active: true,
  address: null,
  phone: null,
  lat: null,
  lng: null,
  googlePlaceId: null,
  mapsUrl: null,
  tags: [],
};

describe("OptionRow", () => {
  it("swaps Archive for an inline 'Archive · Cancel' confirm step (no modal)", () => {
    render(
      <ul>
        <OptionRow option={OPTION} tagSuggestions={[]} />
      </ul>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    // After the first tap, the cluster is Archive · Cancel.
    expect(screen.getByRole("button", { name: "Archive" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined();
    // Edit and Delete have collapsed away — the confirm replaces the cluster.
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    // No modal dialog opened.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("swaps Delete for an inline 'Delete · Cancel' confirm step (no modal)", () => {
    render(
      <ul>
        <OptionRow option={OPTION} tagSuggestions={[]} />
      </ul>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("button", { name: "Delete" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Cancel returns the row to the default action cluster", () => {
    render(
      <ul>
        <OptionRow option={OPTION} tagSuggestions={[]} />
      </ul>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Edit" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Archive" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDefined();
  });

  it("Edit expands the inline OptionForm in place", () => {
    render(
      <ul>
        <OptionRow option={OPTION} tagSuggestions={[]} />
      </ul>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    // The form's Save and Cancel buttons appear; the row's action cluster is gone.
    expect(screen.getByRole("button", { name: "Save" })).toBeDefined();
  });
});
