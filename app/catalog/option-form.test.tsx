import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const createOption = vi.fn();
const updateOption = vi.fn();
vi.mock("./actions", () => ({
  createOption: (...args: unknown[]) => createOption(...args),
  updateOption: (...args: unknown[]) => updateOption(...args),
  archiveOption: vi.fn(),
  deleteOption: vi.fn(),
}));

import { OptionForm } from "./option-form";

describe("OptionForm", () => {
  it("surfaces a blank-name inline field error (§17)", async () => {
    createOption.mockResolvedValueOnce({ ok: false, error: "Enter a name" });
    const onDone = vi.fn();
    const { container } = render(
      <OptionForm kind="home" tagSuggestions={[]} onDone={onDone} />,
    );

    // Submit the form directly — `fireEvent.click` on a submit button is
    // blocked by jsdom's native `required` validation when the name is empty,
    // but `fireEvent.submit` bypasses that and reaches the React handler that
    // surfaces the server action's "Enter a name" result inline.
    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("Enter a name");
    });
    expect(onDone).not.toHaveBeenCalled();
  });

  it("shows the restaurant-only fields on a Restaurant form", () => {
    render(<OptionForm kind="restaurant" tagSuggestions={[]} onDone={() => {}} />);
    expect(screen.getByLabelText("Address")).toBeDefined();
    expect(screen.getByLabelText("Phone")).toBeDefined();
    expect(screen.getByLabelText("Website or menu link")).toBeDefined();
    expect(screen.getByLabelText("Maps link")).toBeDefined();
    expect(screen.getByLabelText("Latitude")).toBeDefined();
    expect(screen.getByLabelText("Longitude")).toBeDefined();
    expect(screen.getByLabelText("Google Place ID")).toBeDefined();
  });

  it("shows only Home-meal fields on a Home form", () => {
    render(<OptionForm kind="home" tagSuggestions={[]} onDone={() => {}} />);
    expect(screen.getByLabelText("Name")).toBeDefined();
    expect(screen.getByLabelText("Recipe link (optional)")).toBeDefined();
    expect(screen.getByLabelText("Notes")).toBeDefined();
    expect(screen.queryByLabelText("Address")).toBeNull();
    expect(screen.queryByLabelText("Phone")).toBeNull();
  });

  it("collapses the form via onDone after a successful save", async () => {
    createOption.mockResolvedValueOnce({ ok: true, value: { id: "x" } });
    const onDone = vi.fn();
    const { container } = render(
      <OptionForm kind="home" tagSuggestions={[]} onDone={onDone} />,
    );

    fireEvent.input(screen.getByLabelText("Name"), {
      target: { value: "Pasta" },
    });
    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(onDone).toHaveBeenCalled();
    });
  });
});
