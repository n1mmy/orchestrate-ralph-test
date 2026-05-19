import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Component tests for the Tonight row's Reject control. The control is the
 * two-step Reject → Submit inline form on the row: tapping Reject expands a
 * reason input, Submit calls `rejectOption(option.id, reason)`, Cancel
 * collapses it with nothing recorded, and an `{ ok: false }` write surfaces
 * the error inline rather than silently dropping.
 */
const rejectOption = vi.fn();
vi.mock("./rejection-actions", () => ({
  rejectOption: (...args: unknown[]) => rejectOption(...args),
}));

import { RejectControl } from "./reject-control";

describe("RejectControl", () => {
  it("renders a Reject button with aria-expanded=false and no reason form initially", () => {
    rejectOption.mockReset();
    render(<RejectControl optionId="opt-1" optionName="Pasta" />);
    const reject = screen.getByRole("button", { name: /Reject Pasta/ });
    expect(reject.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText("Reason (optional)")).toBeNull();
  });

  it("expands an autofocused reason form on tap; aria-expanded becomes true and aria-controls ties to the form", () => {
    rejectOption.mockReset();
    render(<RejectControl optionId="opt-1" optionName="Pasta" />);
    const reject = screen.getByRole("button", { name: /Reject Pasta/ });
    fireEvent.click(reject);
    expect(reject.getAttribute("aria-expanded")).toBe("true");
    const input = screen.getByLabelText("Reason (optional)") as HTMLInputElement;
    expect(input).toBeDefined();
    expect(document.activeElement).toBe(input);
    const controls = reject.getAttribute("aria-controls");
    expect(controls).not.toBeNull();
    const form = document.getElementById(controls!);
    expect(form).not.toBeNull();
    expect(form?.tagName.toLowerCase()).toBe("form");
  });

  it("collapses the form and records nothing on Cancel", () => {
    rejectOption.mockReset();
    render(<RejectControl optionId="opt-1" optionName="Pasta" />);
    fireEvent.click(screen.getByRole("button", { name: /Reject Pasta/ }));
    const input = screen.getByLabelText("Reason (optional)") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "tired of pasta" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Reason (optional)")).toBeNull();
    expect(rejectOption).not.toHaveBeenCalled();
  });

  it("submits the Rejection on Submit and invokes onRejected on success", async () => {
    rejectOption.mockReset();
    rejectOption.mockResolvedValueOnce({ ok: true });
    const onRejected = vi.fn();
    render(
      <RejectControl
        optionId="opt-1"
        optionName="Pasta"
        onRejected={onRejected}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Reject Pasta/ }));
    const input = screen.getByLabelText("Reason (optional)") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "tired of pasta" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(rejectOption).toHaveBeenCalledWith("opt-1", "tired of pasta");
    });
    await waitFor(() => {
      expect(onRejected).toHaveBeenCalled();
    });
  });

  it("submits an empty reason as the empty string (action collapses to null)", async () => {
    rejectOption.mockReset();
    rejectOption.mockResolvedValueOnce({ ok: true });
    render(<RejectControl optionId="opt-1" optionName="Pasta" />);
    fireEvent.click(screen.getByRole("button", { name: /Reject Pasta/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(rejectOption).toHaveBeenCalledWith("opt-1", "");
    });
  });

  it("surfaces an inline error on a failed Rejection rather than silently dropping it", async () => {
    rejectOption.mockReset();
    rejectOption.mockResolvedValueOnce({
      ok: false,
      error: "That option is no longer available",
    });
    const onRejected = vi.fn();
    render(
      <RejectControl
        optionId="opt-1"
        optionName="Pasta"
        onRejected={onRejected}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Reject Pasta/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(
        screen.getByText("That option is no longer available"),
      ).toBeDefined();
    });
    expect(onRejected).not.toHaveBeenCalled();
    // Form stays open so the Household can retry or Cancel.
    expect(screen.getByLabelText("Reason (optional)")).toBeDefined();
  });
});
