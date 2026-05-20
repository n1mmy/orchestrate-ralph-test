import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CatalogScreen } from "./catalog-screen";
import type { ActiveCatalog } from "@/db/queries";

const EMPTY: ActiveCatalog = { home: [], restaurants: [] };

describe("CatalogScreen", () => {
  it("renders inside the shared .column primitive", () => {
    const { container } = render(<CatalogScreen catalog={EMPTY} tagSuggestions={[]} />);
    expect(container.querySelector("main.column")).not.toBeNull();
  });

  it("shows the §17 empty-state copy when the Catalog is empty", () => {
    render(<CatalogScreen catalog={EMPTY} tagSuggestions={[]} />);
    expect(
      screen.getByText("Add a meal or restaurant to get started"),
    ).toBeDefined();
  });

  it("renders Home meals and Restaurants as two sections", () => {
    render(<CatalogScreen catalog={EMPTY} tagSuggestions={[]} />);
    expect(
      screen.getByRole("heading", { name: "Home meals" }),
    ).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "Restaurants" }),
    ).toBeDefined();
  });

  it("renders per-section + Add buttons identical on phone and desktop", () => {
    render(<CatalogScreen catalog={EMPTY} tagSuggestions={[]} />);
    expect(screen.getByRole("button", { name: "+ Add a meal" })).toBeDefined();
    expect(
      screen.getByRole("button", { name: "+ Add a restaurant" }),
    ).toBeDefined();
  });

  it("does not render the Archived disclosure when nothing is Archived", () => {
    render(<CatalogScreen catalog={EMPTY} tagSuggestions={[]} />);
    expect(screen.queryByRole("button", { name: /Archived/ })).toBeNull();
  });

  it("renders a collapsed 'Archived (N)' disclosure that expands to links into each Option's detail page", () => {
    render(
      <CatalogScreen
        catalog={EMPTY}
        archived={[
          { id: "arc-1", name: "Old Pasta" },
          { id: "arc-2", name: "Retired Sushi" },
        ]}
        tagSuggestions={[]}
      />,
    );
    const button = screen.getByRole("button", { name: "Archived (2)" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    // Collapsed by default — the links are not in the DOM yet.
    expect(screen.queryByRole("link", { name: "Old Pasta" })).toBeNull();
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const link1 = screen.getByRole("link", { name: "Old Pasta" });
    const link2 = screen.getByRole("link", { name: "Retired Sushi" });
    expect(link1.getAttribute("href")).toBe("/catalog/arc-1");
    expect(link2.getAttribute("href")).toBe("/catalog/arc-2");
  });

  it("renders each Option row by name with Edit / Archive / Delete actions", () => {
    const catalog: ActiveCatalog = {
      home: [
        {
          id: "h1",
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
        },
      ],
      restaurants: [],
    };
    render(<CatalogScreen catalog={catalog} tagSuggestions={[]} />);
    expect(screen.getByText("Pasta")).toBeDefined();
    // Edit / Archive / Delete each appear as buttons on the row.
    expect(screen.getByRole("button", { name: "Edit" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Archive" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDefined();
  });
});
