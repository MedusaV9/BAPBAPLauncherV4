// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SaveAction } from "./SaveAction";
import { CTA, STATUS } from "../copy";

afterEach(() => {
  cleanup();
});

describe("SaveAction (Phase 3 Task 11)", () => {
  it("renders the Save label by default", () => {
    render(<SaveAction onSave={() => undefined} isDirty />);
    const button = screen.getByTestId("rebalance-save-action-button");
    expect(button.textContent).toContain(CTA.save);
  });

  it("renders Saving... while isSaving=true", () => {
    render(<SaveAction onSave={() => undefined} isDirty isSaving />);
    const button = screen.getByTestId("rebalance-save-action-button");
    expect(button.textContent).toContain(STATUS.saving);
    expect(button.getAttribute("aria-busy")).toBe("true");
  });

  it("disables the button when isDirty=false", () => {
    render(<SaveAction onSave={() => undefined} isDirty={false} />);
    const button = screen.getByTestId("rebalance-save-action-button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("disables the button when isSaving=true even if isDirty=true", () => {
    render(<SaveAction onSave={() => undefined} isDirty isSaving />);
    const button = screen.getByTestId("rebalance-save-action-button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("calls onSave on click", () => {
    const onSave = vi.fn();
    render(<SaveAction onSave={onSave} isDirty />);
    fireEvent.click(screen.getByTestId("rebalance-save-action-button"));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("does not call onSave when disabled", () => {
    const onSave = vi.fn();
    render(<SaveAction onSave={onSave} isDirty={false} />);
    fireEvent.click(screen.getByTestId("rebalance-save-action-button"));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("renders STATUS.willApplyNextLaunch when appliesAt='next-launch'", () => {
    render(<SaveAction onSave={() => undefined} appliesAt="next-launch" />);
    expect(screen.getByTestId("rebalance-save-action-note").textContent).toBe(STATUS.willApplyNextLaunch);
  });

  it("renders STATUS.willApplyAfterReload when appliesAt='next-reload'", () => {
    render(<SaveAction onSave={() => undefined} appliesAt="next-reload" />);
    expect(screen.getByTestId("rebalance-save-action-note").textContent).toBe(STATUS.willApplyAfterReload);
  });

  it("renders 'Applies immediately' when appliesAt='now'", () => {
    render(<SaveAction onSave={() => undefined} appliesAt="now" />);
    expect(screen.getByTestId("rebalance-save-action-note").textContent).toBe("Applies immediately");
  });

  it("renders the overflow slot when provided", () => {
    render(
      <SaveAction
        onSave={() => undefined}
        overflow={<details data-testid="custom-overflow"><summary>More</summary>Reset all</details>}
      />,
    );
    expect(screen.getByTestId("rebalance-save-action-overflow")).toBeTruthy();
    expect(screen.getByTestId("custom-overflow")).toBeTruthy();
  });

  it("does not render overflow slot when not provided", () => {
    render(<SaveAction onSave={() => undefined} />);
    expect(screen.queryByTestId("rebalance-save-action-overflow")).toBeNull();
  });
});
