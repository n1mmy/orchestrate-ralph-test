import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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
