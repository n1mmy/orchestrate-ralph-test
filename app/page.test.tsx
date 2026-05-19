import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TonightRow } from "./tonight-row";
import type { TonightRow as TonightRowData } from "@/lib/ranking";

/**
 * Component tests for the Tonight ledger. The Tonight page itself is an
 * async Server Component that hits the DB — exercising it end-to-end belongs
 * to the DB suite. Here we test what the Tonight row shows on screen.
 */

function row(over: Partial<TonightRowData> = {}): TonightRowData {
  return {
    option: {
      id: "a",
      name: "Aji Ichi",
      kind: "restaurant",
      tags: [],
      url: null,
      phone: null,
    },
    score: 0,
    tags: [],
    recencyDays: 0,
    neverEaten: false,
    ...over,
  };
}

describe("TonightRow", () => {
  it("renders the rank number, Option name, and 'Pick' control", () => {
    render(
      <ol>
        <TonightRow rank={3} row={row()} />
      </ol>,
    );
    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText("Aji Ichi")).toBeDefined();
    expect(screen.getByRole("button", { name: "Pick" })).toBeDefined();
  });

  it("renders a secondary Reject control next to Pick", () => {
    render(
      <ol>
        <TonightRow rank={1} row={row()} />
      </ol>,
    );
    expect(screen.getByRole("button", { name: /Reject Aji Ichi/ })).toBeDefined();
  });

  it("renders the meal-kind left bar via kindBarClass", () => {
    const { container } = render(
      <ol>
        <TonightRow rank={1} row={row({ option: { ...row().option, kind: "home" } })} />
      </ol>,
    );
    expect(container.querySelector("li.border-kind-home")).not.toBeNull();
  });

  it("renders the Recency chip as 'new' when the Option has never been eaten", () => {
    render(
      <ol>
        <TonightRow rank={1} row={row({ neverEaten: true, recencyDays: 60 })} />
      </ol>,
    );
    expect(screen.getByText("new")).toBeDefined();
  });

  it("renders the Recency chip as '60d+' at the CAP ceiling", () => {
    render(
      <ol>
        <TonightRow rank={1} row={row({ neverEaten: false, recencyDays: 60 })} />
      </ol>,
    );
    expect(screen.getByText("60d+")).toBeDefined();
  });

  it("renders the Recency chip as 'Nd' below the ceiling", () => {
    render(
      <ol>
        <TonightRow rank={1} row={row({ recencyDays: 17 })} />
      </ol>,
    );
    expect(screen.getByText("17d")).toBeDefined();
  });

  it("renders one Tag chip per Tag with its name and per-Tag recency", () => {
    render(
      <ol>
        <TonightRow
          rank={1}
          row={row({
            option: { ...row().option, tags: ["fish", "japanese"] },
            tags: [
              { tag: "fish", days: 8, overdue: false },
              { tag: "japanese", days: 20, overdue: true },
            ],
          })}
        />
      </ol>,
    );
    expect(screen.getByText(/fish/)).toBeDefined();
    expect(screen.getByText("8d")).toBeDefined();
    expect(screen.getByText(/japanese/)).toBeDefined();
    expect(screen.getByText("20d")).toBeDefined();
  });
});
