import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import HomePage from "./page";

describe("HomePage", () => {
  it("renders the app title", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { name: "Pick Me a Dinner" }),
    ).toBeDefined();
  });

  it("renders inside the shared .column primitive", () => {
    const { container } = render(<HomePage />);
    const main = container.querySelector("main");
    expect(main?.classList.contains("column")).toBe(true);
  });
});
