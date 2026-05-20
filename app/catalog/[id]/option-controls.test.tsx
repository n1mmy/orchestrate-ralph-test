import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// Stubs for the three server-action modules `OptionControls` reaches into.
// These keep the unit test DB-free; the actions' own DB behavior is covered
// by `actions.db.test.ts` and `rejection-actions.db.test.ts`.
const archiveOption = vi.fn();
const deleteOption = vi.fn();
const updateOption = vi.fn();
const createOption = vi.fn();
const rejectOption = vi.fn();
const pickTonight = vi.fn();
const routerPush = vi.fn();

vi.mock("../actions", () => ({
  archiveOption: (...args: unknown[]) => archiveOption(...args),
  deleteOption: (...args: unknown[]) => deleteOption(...args),
  updateOption: (...args: unknown[]) => updateOption(...args),
  createOption: (...args: unknown[]) => createOption(...args),
}));

vi.mock("../../rejection-actions", () => ({
  rejectOption: (...args: unknown[]) => rejectOption(...args),
}));

vi.mock("../../log/actions", () => ({
  pickTonight: (...args: unknown[]) => pickTonight(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

import { OptionControls } from "./option-controls";
import type { OptionDetail } from "@/db/queries";

const OPTION: OptionDetail = {
  id: "opt-1",
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

function renderControls(overrides?: {
  option?: OptionDetail;
  canDelete?: boolean;
  tagSuggestions?: string[];
  placesEnabled?: boolean;
}) {
  return render(
    <OptionControls
      option={overrides?.option ?? OPTION}
      tagSuggestions={overrides?.tagSuggestions ?? []}
      placesEnabled={overrides?.placesEnabled}
      canDelete={overrides?.canDelete ?? true}
    />,
  );
}

describe("OptionControls", () => {
  beforeEach(() => {
    archiveOption.mockReset();
    deleteOption.mockReset();
    updateOption.mockReset();
    createOption.mockReset();
    rejectOption.mockReset();
    pickTonight.mockReset();
    routerPush.mockReset();
  });

  it("renders the full default toolbar — Edit, Archive, Delete, Reject, Pick", () => {
    renderControls();
    expect(screen.getByRole("button", { name: "Edit" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Archive" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Reject Pasta" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Pick" })).toBeDefined();
  });

  it("hides Delete when canDelete is false (Hard-delete rule)", () => {
    renderControls({ canDelete: false });
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    // The rest of the toolbar still renders.
    expect(screen.getByRole("button", { name: "Edit" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Archive" })).toBeDefined();
  });

  it("swaps the toolbar for an inline OptionForm on Edit", () => {
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    // The reused OptionForm's Save button appears; the toolbar is gone.
    expect(screen.getByRole("button", { name: "Save" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pick" })).toBeNull();
  });

  it("swaps Archive for an inline 'Archive · Cancel' confirm (no modal)", () => {
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(screen.getByRole("button", { name: "Archive" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("swaps Delete for an inline 'Delete · Cancel' confirm (no modal)", () => {
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("button", { name: "Delete" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens an inline reason form on Reject and submits to rejectOption", async () => {
    rejectOption.mockResolvedValueOnce({ ok: true });
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "Reject Pasta" }));
    const reasonField = screen.getByLabelText("Reason (optional)");
    fireEvent.input(reasonField, { target: { value: "Too heavy" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(rejectOption).toHaveBeenCalledWith("opt-1", "Too heavy");
    });
  });

  it("surfaces a same-day Reject collision inline (typed { ok: false })", async () => {
    rejectOption.mockResolvedValueOnce({
      ok: false,
      error: "Already rejected today",
    });
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "Reject Pasta" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "Already rejected today",
      );
    });
    // The reason form is still on screen — the form did not collapse.
    expect(screen.getByLabelText("Reason (optional)")).toBeDefined();
  });

  it("Cancel on the Reject form collapses the row to the default toolbar", () => {
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "Reject Pasta" }));
    expect(screen.getByLabelText("Reason (optional)")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Reason (optional)")).toBeNull();
    expect(screen.getByRole("button", { name: "Edit" })).toBeDefined();
  });

  it("routes to /catalog on a successful Delete", async () => {
    deleteOption.mockResolvedValueOnce({ ok: true });
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    // The cluster is now Delete · Cancel; the visible Delete is the confirm.
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(deleteOption).toHaveBeenCalledWith("opt-1");
    });
    await waitFor(() => {
      expect(routerPush).toHaveBeenCalledWith("/catalog");
    });
  });

  it("shows an inline error and keeps the page when Delete is blocked", async () => {
    deleteOption.mockResolvedValueOnce({
      ok: false,
      error: "In your log — archive instead",
    });
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "In your log — archive instead",
      );
    });
    expect(routerPush).not.toHaveBeenCalled();
    // The page kept rendering — the default toolbar is back.
    expect(screen.getByRole("button", { name: "Edit" })).toBeDefined();
  });
});
