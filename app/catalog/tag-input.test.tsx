import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TagInput } from "./tag-input";

describe("TagInput", () => {
  it("renders as an ARIA combobox over a listbox of options", () => {
    render(
      <TagInput value={[]} suggestions={["pasta", "fish"]} onChange={() => {}} />,
    );
    const combobox = screen.getByRole("combobox");
    expect(combobox.getAttribute("aria-autocomplete")).toBe("list");
    // Focusing the combobox opens the listbox of existing suggestions.
    fireEvent.focus(combobox);
    expect(screen.getByRole("listbox")).toBeDefined();
    const opts = screen.getAllByRole("option");
    expect(opts.map((o) => o.textContent)).toEqual(["pasta", "fish"]);
  });

  it("offers a Create row for free text not in the suggestion set", () => {
    render(
      <TagInput value={[]} suggestions={["pasta"]} onChange={() => {}} />,
    );
    const combobox = screen.getByRole("combobox");
    fireEvent.focus(combobox);
    fireEvent.change(combobox, { target: { value: "Pizza" } });
    const opts = screen.getAllByRole("option");
    // The combobox normalizes the typed text — the Create row shows the
    // canonical lowercased form.
    expect(opts.some((o) => o.textContent?.includes('Create "pizza"'))).toBe(
      true,
    );
  });

  it("Enter on free text commits a normalized token", () => {
    const onChange = vi.fn();
    render(
      <TagInput value={[]} suggestions={[]} onChange={onChange} />,
    );
    const combobox = screen.getByRole("combobox");
    fireEvent.change(combobox, { target: { value: "  Pasta  " } });
    fireEvent.keyDown(combobox, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["pasta"]);
  });

  it("comma commits a normalized token", () => {
    const onChange = vi.fn();
    render(<TagInput value={[]} suggestions={[]} onChange={onChange} />);
    const combobox = screen.getByRole("combobox");
    fireEvent.change(combobox, { target: { value: "Fish" } });
    fireEvent.keyDown(combobox, { key: "," });
    expect(onChange).toHaveBeenCalledWith(["fish"]);
  });

  it("Backspace on an empty field removes the last token", () => {
    const onChange = vi.fn();
    render(
      <TagInput
        value={["pasta", "fish"]}
        suggestions={[]}
        onChange={onChange}
      />,
    );
    const combobox = screen.getByRole("combobox");
    fireEvent.keyDown(combobox, { key: "Backspace" });
    expect(onChange).toHaveBeenCalledWith(["pasta"]);
  });

  it("does not duplicate an existing token when the same Tag is typed again", () => {
    const onChange = vi.fn();
    render(
      <TagInput value={["pasta"]} suggestions={[]} onChange={onChange} />,
    );
    const combobox = screen.getByRole("combobox");
    fireEvent.change(combobox, { target: { value: "PASTA" } });
    fireEvent.keyDown(combobox, { key: "Enter" });
    // Either no call (idempotent) or a call with the same set — never a duplicate.
    if (onChange.mock.calls.length > 0) {
      for (const [next] of onChange.mock.calls) {
        expect(next).toEqual(["pasta"]);
      }
    }
  });

  it("clicking a suggestion commits it", () => {
    const onChange = vi.fn();
    render(
      <TagInput value={[]} suggestions={["pasta"]} onChange={onChange} />,
    );
    const combobox = screen.getByRole("combobox");
    fireEvent.focus(combobox);
    const opt = screen.getByRole("option", { name: "pasta" });
    fireEvent.mouseDown(opt);
    expect(onChange).toHaveBeenCalledWith(["pasta"]);
  });

  it("renders hidden inputs so a plain FormData parse sees every tag", () => {
    const { container } = render(
      <TagInput
        value={["pasta", "fish"]}
        suggestions={[]}
        onChange={() => {}}
        name="tags"
      />,
    );
    const hidden = container.querySelectorAll('input[type="hidden"][name="tags"]');
    expect(Array.from(hidden).map((h) => (h as HTMLInputElement).value)).toEqual(
      ["pasta", "fish"],
    );
  });
});
