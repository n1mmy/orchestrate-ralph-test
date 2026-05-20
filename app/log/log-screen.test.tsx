import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

// Server actions stub — none of the row's button handlers should reach `db`
// in a unit test. Behavior covered by `app/log/actions.db.test.ts` and
// `app/rejection-actions.db.test.ts`.
vi.mock("./actions", () => ({
  logForDate: vi.fn(async () => ({ ok: true })),
  updateLogEntry: vi.fn(async () => ({ ok: true })),
  deleteLogEntry: vi.fn(async () => ({ ok: true })),
}));
vi.mock("../rejection-actions", () => ({
  createRejection: vi.fn(async () => ({ ok: true })),
  updateRejection: vi.fn(async () => ({ ok: true })),
  deleteRejection: vi.fn(async () => ({ ok: true })),
}));

import { LogScreen } from "./log-screen";
import type {
  LogEntry,
  LogOptionChoice,
  LogRejectionRow,
  OptionChoice,
} from "@/db/queries";

const TODAY = "2026-05-19"; // Tue, May 19 2026
const TOMORROW = "2026-05-20";
const YESTERDAY = "2026-05-18";
const LAST_WEEK = "2026-05-12";

const PASTA: LogOptionChoice = {
  id: "opt-1",
  name: "Pasta",
  kind: "home",
  active: true,
};
const SUSHI: LogOptionChoice = {
  id: "opt-2",
  name: "Sushi Place",
  kind: "restaurant",
  active: true,
};
const OPTION_CHOICES: LogOptionChoice[] = [PASTA, SUSHI];
const REJECTION_OPTION_CHOICES: OptionChoice[] = [
  { id: "opt-1", name: "Pasta", kind: "home" },
  { id: "opt-2", name: "Sushi Place", kind: "restaurant" },
];

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: "ent-1",
    optionId: "opt-1",
    eatenOn: TODAY,
    note: null,
    option: { id: "opt-1", name: "Pasta", kind: "home", active: true },
    ...overrides,
  };
}

function rejection(overrides: Partial<LogRejectionRow> = {}): LogRejectionRow {
  return {
    id: "rej-1",
    optionId: "opt-2",
    optionName: "Sushi Place",
    kind: "restaurant",
    rejectedOn: TODAY,
    reason: null,
    ...overrides,
  };
}

function renderScreen(
  args: Partial<Parameters<typeof LogScreen>[0]> = {},
) {
  return render(
    <LogScreen
      entries={args.entries ?? []}
      rejections={args.rejections ?? []}
      optionChoices={args.optionChoices ?? OPTION_CHOICES}
      rejectionOptionChoices={
        args.rejectionOptionChoices ?? REJECTION_OPTION_CHOICES
      }
      todaySql={args.todaySql ?? TODAY}
    />,
  );
}

describe("LogScreen — empty state", () => {
  it("shows the empty copy only when both entries and rejections are empty", () => {
    renderScreen({});
    expect(
      screen.getByText("No dinners logged yet — pick one on Tonight →"),
    ).toBeDefined();
  });

  it("hides the empty copy when there are entries", () => {
    renderScreen({ entries: [entry()] });
    expect(
      screen.queryByText("No dinners logged yet — pick one on Tonight →"),
    ).toBeNull();
  });

  it("hides the empty copy when there are only rejections", () => {
    renderScreen({ rejections: [rejection()] });
    expect(
      screen.queryByText("No dinners logged yet — pick one on Tonight →"),
    ).toBeNull();
  });
});

describe("LogScreen — interleaved DayGroups", () => {
  it("renders Log entries first then Rejections under a shared date header", () => {
    renderScreen({
      entries: [entry({ id: "e-1", eatenOn: YESTERDAY })],
      rejections: [
        rejection({ id: "r-1", rejectedOn: YESTERDAY, optionId: "opt-2" }),
      ],
    });
    // Single date header for Yesterday.
    const headers = screen.getAllByText("Yesterday");
    expect(headers.length).toBe(1);
    // Both the entry and the Rejection render — entry's Option name shows
    // as plain text, the Rejection's as a link to the detail page.
    expect(screen.getByText("Pasta")).toBeDefined();
    expect(screen.getByRole("link", { name: "Sushi Place" })).toBeDefined();
  });

  it("renders a Rejection-only date as its own group", () => {
    renderScreen({
      rejections: [rejection({ rejectedOn: YESTERDAY })],
    });
    expect(screen.getByText("Yesterday")).toBeDefined();
    expect(screen.getByText("Rejected")).toBeDefined();
  });
});

describe("LogScreen — Upcoming and History", () => {
  it("renders a future-dated Rejection in the Upcoming strip", () => {
    renderScreen({
      rejections: [rejection({ rejectedOn: TOMORROW })],
    });
    expect(screen.getByText("Upcoming")).toBeDefined();
    expect(screen.getByText("Tomorrow")).toBeDefined();
  });

  it("caps Upcoming at UPCOMING_CAP and shows a '+N more planned' line", () => {
    // Six future-dated rejections, each on a distinct day.
    const future = ["2026-05-20", "2026-05-21", "2026-05-22", "2026-05-23", "2026-05-24", "2026-05-25"];
    const rejs = future.map((d, i) =>
      rejection({ id: `r-${i}`, rejectedOn: d, optionId: "opt-2" }),
    );
    renderScreen({ rejections: rejs });
    // UPCOMING_CAP = 5; one hidden.
    expect(screen.getByText("+1 more planned")).toBeDefined();
  });

  it('shows the "History" sub-heading only when both Upcoming and History are present', () => {
    renderScreen({
      entries: [entry({ eatenOn: YESTERDAY })],
      rejections: [rejection({ rejectedOn: TOMORROW })],
    });
    expect(screen.getByText("History")).toBeDefined();
    expect(screen.getByText("Upcoming")).toBeDefined();
  });

  it('omits the "History" sub-heading when there is no Upcoming', () => {
    renderScreen({
      entries: [entry({ eatenOn: YESTERDAY })],
    });
    expect(screen.queryByText("History")).toBeNull();
  });
});

describe("LogScreen — top add controls", () => {
  it("renders separate '+ Add a dinner' and '+ Add a rejection' buttons at the top", () => {
    renderScreen({});
    expect(
      screen.getByRole("button", { name: "+ Add a dinner" }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "+ Add a rejection" }),
    ).toBeDefined();
  });

  it("opening '+ Add a rejection' exposes a Cancel that closes the inline form", () => {
    renderScreen({});
    fireEvent.click(
      screen.getByRole("button", { name: "+ Add a rejection" }),
    );
    // Form is now open: Add button (not "+ Add a rejection") + Cancel.
    expect(screen.getByRole("button", { name: "Add" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
  });

  it("the top rejection form's date defaults to today", () => {
    renderScreen({});
    fireEvent.click(
      screen.getByRole("button", { name: "+ Add a rejection" }),
    );
    const date = screen.getByLabelText("Date") as HTMLInputElement;
    expect(date.value).toBe(TODAY);
  });
});

describe("LogScreen — per-DayGroup add controls", () => {
  it("renders '+ Dinner' and '+ Rejection' buttons next to each date header", () => {
    renderScreen({
      entries: [entry({ eatenOn: LAST_WEEK })],
    });
    // The Last-week group is rendered; its buttons are children of the
    // group, alongside the date header.
    expect(screen.getByRole("button", { name: "+ Dinner" })).toBeDefined();
    expect(screen.getByRole("button", { name: "+ Rejection" })).toBeDefined();
  });

  it("opening '+ Rejection' on a past DayGroup pre-fills the date to that group's date", () => {
    renderScreen({
      entries: [entry({ eatenOn: LAST_WEEK })],
    });
    fireEvent.click(screen.getByRole("button", { name: "+ Rejection" }));
    const date = screen.getByLabelText("Date") as HTMLInputElement;
    expect(date.value).toBe(LAST_WEEK);
  });

  it("opening '+ Dinner' on a past DayGroup pre-fills the date to that group's date", () => {
    renderScreen({
      entries: [entry({ eatenOn: LAST_WEEK })],
    });
    fireEvent.click(screen.getByRole("button", { name: "+ Dinner" }));
    // The dinner form's date input is also labelled "Date".
    const date = screen.getByLabelText("Date") as HTMLInputElement;
    expect(date.value).toBe(LAST_WEEK);
  });

  it("uses a min-h-11 touch target on the per-day add buttons", () => {
    renderScreen({ entries: [entry({ eatenOn: LAST_WEEK })] });
    const btn = screen.getByRole("button", { name: "+ Dinner" });
    expect(btn.className).toContain("min-h-11");
  });
});

describe("AddRejectionForm — `onSaved` only on `ok`", () => {
  it("calls createRejection and fires onSaved when the action returns ok", async () => {
    const { AddRejectionForm } = await import("./rejection-row");
    const onSaved = vi.fn();
    const onCancel = vi.fn();
    const mod = await import("../rejection-actions");
    (mod.createRejection as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
    });

    render(
      <AddRejectionForm
        optionChoices={REJECTION_OPTION_CHOICES}
        defaultDate={TODAY}
        onCancel={onCancel}
        onSaved={onSaved}
      />,
    );
    fireEvent.submit(screen.getByRole("button", { name: "Add" }).closest("form")!);
    // Microtask + transition flush.
    await new Promise((r) => setTimeout(r, 0));
    expect(mod.createRejection).toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
  });

  it("surfaces the action's error inline and does NOT fire onSaved when the action returns !ok", async () => {
    const { AddRejectionForm } = await import("./rejection-row");
    const onSaved = vi.fn();
    const onCancel = vi.fn();
    const mod = await import("../rejection-actions");
    (mod.createRejection as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      error: "Already rejected for that date",
    });

    render(
      <AddRejectionForm
        optionChoices={REJECTION_OPTION_CHOICES}
        defaultDate={TODAY}
        onCancel={onCancel}
        onSaved={onSaved}
      />,
    );
    fireEvent.submit(screen.getByRole("button", { name: "Add" }).closest("form")!);
    await new Promise((r) => setTimeout(r, 0));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Already rejected for that date")).toBeDefined();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("renders Home meals / Restaurants optgroups in the Option select", async () => {
    const { AddRejectionForm } = await import("./rejection-row");
    render(
      <AddRejectionForm
        optionChoices={REJECTION_OPTION_CHOICES}
        defaultDate={TODAY}
        onCancel={() => {}}
        onSaved={() => {}}
      />,
    );
    const select = screen.getByRole("combobox", { name: "Option" });
    expect(select.querySelector('optgroup[label="Home meals"]')).not.toBeNull();
    expect(select.querySelector('optgroup[label="Restaurants"]')).not.toBeNull();
  });
});
