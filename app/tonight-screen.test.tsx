import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// `deleteRejection` is a "use server" action; the test stubs the module so the
// disclosure's "Bring back" button can be observed without a DB.
const deleteRejection = vi.fn();
vi.mock("./rejection-actions", () => ({
  deleteRejection: (...args: unknown[]) => deleteRejection(...args),
  rejectOption: vi.fn(),
}));

import { TonightScreen } from "./tonight-screen";
import type { TodayRejection } from "@/db/queries";

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
