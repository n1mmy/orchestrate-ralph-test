import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TonightScreen } from "./tonight-screen";

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
