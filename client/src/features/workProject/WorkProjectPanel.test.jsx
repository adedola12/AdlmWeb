import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";
import WorkProjectPanel from "./WorkProjectPanel.jsx";
import { useProjectPanel, PANEL_EXIT_MS } from "./useProjectPanel.js";

// Layer L5 of his project page. WORK.md §13: a bill line, a rate build-up, a
// task or the model changes open "over the tab — never a new page". It is the
// biggest structural difference from the classic workspace, where the same
// things are separate screens.

afterEach(cleanup);

describe("the side panel", () => {
  it("is a dialog named by its title, so a screen reader announces it", () => {
    render(<WorkProjectPanel title="A.1 · Excavate foundation trench">body</WorkProjectPanel>);
    const panel = screen.getByRole("dialog", { name: "A.1 · Excavate foundation trench" });
    expect(panel).toBeTruthy();
    expect(panel.classList.contains("pj-panel")).toBe(true);
  });

  it("goes into document.body, not into the page", () => {
    // .pj-panel is position:fixed, and an ancestor with a transform, filter or
    // backdrop-filter would make itself the containing block and pin the panel
    // inside the page. .ds .nav carries a backdrop-filter, which is exactly what
    // put the mobile menu behind the header.
    const { container } = render(<WorkProjectPanel title="T">body</WorkProjectPanel>);
    expect(container.querySelector(".pj-panel")).toBe(null);
    expect(document.body.querySelector(".pj-panel")).toBeTruthy();
  });

  it("is wrapped in .ds, or the ported stylesheet would not match it", () => {
    // Every rule is written `.ds .pj-panel` (ds-work-proj.css:296). Portalled to
    // body without the wrapper, the panel renders unstyled.
    render(<WorkProjectPanel title="T">body</WorkProjectPanel>);
    const panel = document.body.querySelector(".pj-panel");
    expect(panel.closest(".ds")).toBeTruthy();
  });

  it("starts without .on so the slide-in has something to transition from", () => {
    render(<WorkProjectPanel title="T">body</WorkProjectPanel>);
    // The class lands on the next frame; this is the frame before it.
    expect(document.body.querySelector(".pj-panel").classList.contains("on")).toBe(false);
  });

  it("shows its title and body", () => {
    render(<WorkProjectPanel title="Rate build-up">the build-up</WorkProjectPanel>);
    expect(screen.getByText("Rate build-up")).toBeTruthy();
    expect(screen.getByText("the build-up")).toBeTruthy();
  });

  it("closes on the X", () => {
    const onClose = vi.fn();
    render(<WorkProjectPanel title="T" onClose={onClose}>body</WorkProjectPanel>);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<WorkProjectPanel title="T" onClose={onClose}>body</WorkProjectPanel>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("leaves Escape alone while a feedback dialog is over it", () => {
    // His guard (work-proj.js:427). The feedback dialog is modal over the panel,
    // so Escape belongs to whichever is on top — without this, one press closes
    // both.
    const back = document.createElement("div");
    back.className = "fb-back";
    document.body.appendChild(back);
    const onClose = vi.fn();
    render(<WorkProjectPanel title="T" onClose={onClose}>body</WorkProjectPanel>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    back.remove();
  });

  it("ignores other keys", () => {
    const onClose = vi.fn();
    render(<WorkProjectPanel title="T" onClose={onClose}>body</WorkProjectPanel>);
    fireEvent.keyDown(document, { key: "Enter" });
    fireEvent.keyDown(document, { key: "x" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("takes focus, and hands it back when it goes", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { unmount } = render(<WorkProjectPanel title="T">body</WorkProjectPanel>);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("drops .on when told it is leaving, so the slide-out happens", () => {
    const { rerender } = render(
      <WorkProjectPanel title="T" visible={false}>body</WorkProjectPanel>,
    );
    expect(document.body.querySelector(".pj-panel").classList.contains("on")).toBe(false);
    rerender(<WorkProjectPanel title="T" visible>body</WorkProjectPanel>);
    // Still pre-frame, so still not on — the point is only that `visible` gates it.
    expect(document.body.querySelector(".pj-panel")).toBeTruthy();
  });
});

// A component that drives the hook, so its timing is observable.
function Harness() {
  const { content, visible, show, close } = useProjectPanel();
  return (
    <>
      <button type="button" onClick={() => show({ title: "Line A.1" })}>open</button>
      <button type="button" onClick={close}>shut</button>
      {content ? (
        <WorkProjectPanel title={content.title} visible={visible} onClose={close}>
          panel body
        </WorkProjectPanel>
      ) : null}
    </>
  );
}

describe("opening and closing it", () => {
  it("opens with whatever it is given", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).toBe(null);
    fireEvent.click(screen.getByText("open"));
    expect(screen.getByRole("dialog", { name: "Line A.1" })).toBeTruthy();
  });

  it("keeps the panel mounted for the slide-out, then removes it", () => {
    vi.useFakeTimers();
    try {
      render(<Harness />);
      fireEvent.click(screen.getByText("open"));
      fireEvent.click(screen.getByText("shut"));
      // His closePanel() removes .on, waits 220ms, then removes the node. In
      // React the node would go instantly and the exit would never be seen.
      expect(screen.getByRole("dialog")).toBeTruthy();
      act(() => { vi.advanceTimersByTime(PANEL_EXIT_MS - 1); });
      expect(screen.queryByRole("dialog")).toBeTruthy();
      act(() => { vi.advanceTimersByTime(1); });
      expect(screen.queryByRole("dialog")).toBe(null);
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-opening during the slide-out cancels it rather than blinking", () => {
    vi.useFakeTimers();
    try {
      render(<Harness />);
      fireEvent.click(screen.getByText("open"));
      fireEvent.click(screen.getByText("shut"));
      fireEvent.click(screen.getByText("open"));
      act(() => { vi.advanceTimersByTime(PANEL_EXIT_MS * 2); });
      // The pending removal must not fire and take the re-opened panel with it.
      expect(screen.getByRole("dialog", { name: "Line A.1" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("opening with nothing does not open an empty panel", () => {
    function Empty() {
      const { content, show } = useProjectPanel();
      return (
        <>
          <button type="button" onClick={() => show(null)}>open nothing</button>
          {content ? <WorkProjectPanel title="x">y</WorkProjectPanel> : null}
        </>
      );
    }
    render(<Empty />);
    fireEvent.click(screen.getByText("open nothing"));
    expect(screen.queryByRole("dialog")).toBe(null);
  });
});
