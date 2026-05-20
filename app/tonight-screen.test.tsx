import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// `deleteRejection` and `aiSearchAction` are "use server" actions; the tests
// stub the modules so the screen-level UI can be observed without a DB.
const deleteRejection = vi.fn();
vi.mock("./rejection-actions", () => ({
  deleteRejection: (...args: unknown[]) => deleteRejection(...args),
  rejectOption: vi.fn(),
}));

const aiSearchAction = vi.fn();
vi.mock("./tonight-actions", () => ({
  aiSearchAction: (...args: unknown[]) => aiSearchAction(...args),
}));

import { TonightScreen } from "./tonight-screen";
import type { TodayRejection } from "@/db/queries";
import type { TonightRow as TonightRowData } from "@/lib/ranking";

/**
 * Tonight screen tests. The split between picker mode and decided mode is
 * tested in `lib/tonights-dinner.test.ts`; here we cover the screen-level
 * empty-list states — the genuinely-empty Catalog branch lives on `app/page.tsx`,
 * but the "every Option rejected for tonight" honest empty state lands inside
 * the screen and is the new copy from ticket 19.
 */
describe("TonightScreen", () => {
  it("renders the all-rejected empty state when allRejected is true", () => {
    render(
      <TonightScreen
        tonightsDinner={[]}
        pickerRows={[]}
        allRejected
      />,
    );
    expect(
      screen.getByText(
        /Every Option has been rejected for tonight\. They'll be back tomorrow\./,
      ),
    ).toBeDefined();
  });

  it("does not render the all-rejected copy when allRejected is false", () => {
    render(
      <TonightScreen tonightsDinner={[]} pickerRows={[]} allRejected={false} />,
    );
    expect(
      screen.queryByText(
        /Every Option has been rejected for tonight\./,
      ),
    ).toBeNull();
  });

  it("defaults allRejected to false when the prop is omitted", () => {
    render(<TonightScreen tonightsDinner={[]} pickerRows={[]} />);
    expect(
      screen.queryByText(
        /Every Option has been rejected for tonight\./,
      ),
    ).toBeNull();
  });
});

/**
 * The "Rejected tonight (N)" disclosure (ticket 20). Rendered only when today
 * has at least one Rejection, collapsed by default, with a "Bring back"
 * button per row that calls `deleteRejection(rejectionId)`.
 */
describe("RejectedTonightDisclosure (rendered by TonightScreen)", () => {
  const rejections: TodayRejection[] = [
    {
      id: "rej-1",
      optionId: "opt-1",
      optionName: "Pasta",
      optionKind: "home",
      reason: "tired of pasta",
    },
    {
      id: "rej-2",
      optionId: "opt-2",
      optionName: "Joe's Pizza",
      optionKind: "restaurant",
      reason: null,
    },
  ];

  it("does not render when rejectedTonight is empty", () => {
    render(<TonightScreen tonightsDinner={[]} pickerRows={[]} />);
    expect(screen.queryByRole("button", { name: /Rejected tonight/ })).toBeNull();
  });

  it("renders a collapsed disclosure heading with the count when there are Rejections", () => {
    render(
      <TonightScreen
        tonightsDinner={[]}
        pickerRows={[]}
        rejectedTonight={rejections}
      />,
    );
    const toggle = screen.getByRole("button", {
      name: "Rejected tonight (2)",
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    // Collapsed: the list of Rejection rows is not rendered yet.
    expect(screen.queryByText("Pasta")).toBeNull();
    expect(screen.queryByText("Joe's Pizza")).toBeNull();
  });

  it("expands to a <ul> of today's Rejections with Option name and reason on a muted line", () => {
    render(
      <TonightScreen
        tonightsDinner={[]}
        pickerRows={[]}
        rejectedTonight={rejections}
      />,
    );
    const toggle = screen.getByRole("button", {
      name: "Rejected tonight (2)",
    });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    // Both Option names appear inside a list.
    expect(screen.getByText("Pasta")).toBeDefined();
    expect(screen.getByText("Joe's Pizza")).toBeDefined();
    // The reason renders only when one was given.
    expect(screen.getByText("tired of pasta")).toBeDefined();
    // The container is a <ul>.
    const list = screen.getByRole("list");
    expect(list.tagName.toLowerCase()).toBe("ul");
  });

  it("calls deleteRejection(rejectionId) when Bring back is tapped", async () => {
    deleteRejection.mockReset();
    deleteRejection.mockResolvedValueOnce({ ok: true });
    render(
      <TonightScreen
        tonightsDinner={[]}
        pickerRows={[]}
        rejectedTonight={rejections}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Rejected tonight (2)" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Bring back Pasta" }),
    );
    await waitFor(() => {
      expect(deleteRejection).toHaveBeenCalledWith("rej-1");
    });
  });

  it("surfaces an inline error when deleteRejection returns ok: false", async () => {
    deleteRejection.mockReset();
    deleteRejection.mockResolvedValueOnce({
      ok: false,
      error: "That option is no longer available",
    });
    render(
      <TonightScreen
        tonightsDinner={[]}
        pickerRows={[]}
        rejectedTonight={rejections}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Rejected tonight (2)" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Bring back Pasta" }),
    );
    await waitFor(() => {
      expect(
        screen.getByText("That option is no longer available"),
      ).toBeDefined();
    });
  });
});

/**
 * AI search on Tonight (ticket 14) — a search box inside the picker that swaps
 * the deterministic ranked list for an AI-ranked result. A Clear control (or
 * any page reload) restores the deterministic list.
 */
describe("AI search (rendered by TonightScreen)", () => {
  const pickerRows: TonightRowData[] = [
    {
      option: {
        id: "opt-a",
        name: "Alice's Pizza",
        kind: "restaurant",
        tags: ["pizza"],
        url: null,
        phone: null,
      },
      score: 10,
      tags: [],
      recencyDays: 5,
      neverEaten: false,
    },
    {
      option: {
        id: "opt-b",
        name: "Banh Mi",
        kind: "restaurant",
        tags: ["sandwich"],
        url: null,
        phone: null,
      },
      score: 8,
      tags: [],
      recencyDays: 12,
      neverEaten: false,
    },
  ];

  it("renders a search input and a Search button above the picker", () => {
    render(<TonightScreen tonightsDinner={[]} pickerRows={pickerRows} />);
    expect(screen.getByRole("searchbox", { name: "AI search query" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Search" })).toBeDefined();
  });

  it("submitting swaps the deterministic list for an AI-ranked result with the AI rationale on each row", async () => {
    aiSearchAction.mockReset();
    aiSearchAction.mockResolvedValueOnce({
      ok: true,
      results: [
        { optionId: "opt-b", reason: "Light and fast for a Wednesday night." },
        { optionId: "opt-a", reason: "Tag pizza is overdue." },
      ],
    });
    render(<TonightScreen tonightsDinner={[]} pickerRows={pickerRows} />);

    // Before submit: deterministic order is Alice (rank 1), Banh Mi (rank 2).
    const itemsBefore = screen.getAllByRole("listitem");
    expect(itemsBefore[0]?.textContent).toContain("Alice's Pizza");
    expect(itemsBefore[1]?.textContent).toContain("Banh Mi");

    const input = screen.getByRole("searchbox", { name: "AI search query" });
    fireEvent.change(input, { target: { value: "something light" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(aiSearchAction).toHaveBeenCalledWith("something light");
    });

    await waitFor(() => {
      // After submit: Banh Mi is rank 1, then Alice — the AI ordering.
      const itemsAfter = screen.getAllByRole("listitem");
      expect(itemsAfter[0]?.textContent).toContain("Banh Mi");
      expect(itemsAfter[0]?.textContent).toContain(
        "Light and fast for a Wednesday night.",
      );
      expect(itemsAfter[1]?.textContent).toContain("Alice's Pizza");
      expect(itemsAfter[1]?.textContent).toContain("Tag pizza is overdue.");
    });
  });

  it("allows an empty query and still invokes aiSearchAction", async () => {
    aiSearchAction.mockReset();
    aiSearchAction.mockResolvedValueOnce({ ok: true, results: [] });
    render(<TonightScreen tonightsDinner={[]} pickerRows={pickerRows} />);

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => {
      expect(aiSearchAction).toHaveBeenCalledWith("");
    });
  });

  it("Clear restores the deterministic list", async () => {
    aiSearchAction.mockReset();
    aiSearchAction.mockResolvedValueOnce({
      ok: true,
      results: [{ optionId: "opt-b", reason: "Habit fit." }],
    });
    render(<TonightScreen tonightsDinner={[]} pickerRows={pickerRows} />);

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => {
      const items = screen.getAllByRole("listitem");
      expect(items).toHaveLength(1);
      expect(items[0]?.textContent).toContain("Banh Mi");
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    // Deterministic list is back: both rows, in Score-rank order.
    const itemsRestored = screen.getAllByRole("listitem");
    expect(itemsRestored).toHaveLength(2);
    expect(itemsRestored[0]?.textContent).toContain("Alice's Pizza");
  });

  it("a failed search leaves the deterministic list intact and shows a persistent inline error", async () => {
    aiSearchAction.mockReset();
    aiSearchAction.mockResolvedValueOnce({ ok: false });
    render(<TonightScreen tonightsDinner={[]} pickerRows={pickerRows} />);

    // Before submit: deterministic order is Alice (rank 1), Banh Mi (rank 2).
    const itemsBefore = screen.getAllByRole("listitem");
    expect(itemsBefore[0]?.textContent).toContain("Alice's Pizza");
    expect(itemsBefore[1]?.textContent).toContain("Banh Mi");

    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(screen.getByText("Search unavailable — try again")).toBeDefined();
    });

    // The deterministic list is untouched — same rows in the same order.
    const itemsAfter = screen.getAllByRole("listitem");
    expect(itemsAfter).toHaveLength(2);
    expect(itemsAfter[0]?.textContent).toContain("Alice's Pizza");
    expect(itemsAfter[1]?.textContent).toContain("Banh Mi");
  });

  it("the inline error is announced via an aria-live region", async () => {
    aiSearchAction.mockReset();
    aiSearchAction.mockResolvedValueOnce({ ok: false });
    render(<TonightScreen tonightsDinner={[]} pickerRows={pickerRows} />);

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => {
      const message = screen.getByText("Search unavailable — try again");
      // Climb to the closest live region — assistive tech announces text
      // that lands inside an `aria-live` container.
      const live = message.closest("[aria-live]");
      expect(live).not.toBeNull();
    });
  });

  it("the inline error persists across a subsequent submit — not cleared on submit alone", async () => {
    aiSearchAction.mockReset();
    aiSearchAction.mockResolvedValue({ ok: false });
    const { container } = render(
      <TonightScreen tonightsDinner={[]} pickerRows={pickerRows} />,
    );
    const form = container.querySelector("form[role=search]")!;

    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText("Search unavailable — try again")).toBeDefined();
    });

    // A second submit: the error must remain visible across the submit — it
    // is not cleared just because the Household tried again. Use
    // `fireEvent.submit` rather than `fireEvent.click` on the submit button —
    // jsdom's submit-on-click chain is fragile across re-renders with sibling
    // anchor tags in the tree, and `submit` reaches the same React handler.
    fireEvent.submit(form);
    expect(screen.getByText("Search unavailable — try again")).toBeDefined();

    await waitFor(() => {
      expect(aiSearchAction).toHaveBeenCalledTimes(2);
    });
    // Still there after the second failure resolves.
    expect(screen.getByText("Search unavailable — try again")).toBeDefined();
  });

  it("the inline error clears when a subsequent search succeeds", async () => {
    aiSearchAction.mockReset();
    aiSearchAction
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        results: [{ optionId: "opt-a", reason: "Friday pizza tradition." }],
      });
    const { container } = render(
      <TonightScreen tonightsDinner={[]} pickerRows={pickerRows} />,
    );
    const form = container.querySelector("form[role=search]")!;

    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText("Search unavailable — try again")).toBeDefined();
    });

    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.queryByText("Search unavailable — try again")).toBeNull();
    });
  });

  it("the inline error clears when the Clear control is used", async () => {
    aiSearchAction.mockReset();
    aiSearchAction.mockResolvedValueOnce({ ok: false });
    render(<TonightScreen tonightsDinner={[]} pickerRows={pickerRows} />);

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => {
      expect(screen.getByText("Search unavailable — try again")).toBeDefined();
    });

    // Clear is exposed alongside the error so the Household has an explicit
    // way to dismiss it without re-submitting.
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByText("Search unavailable — try again")).toBeNull();
  });
});
