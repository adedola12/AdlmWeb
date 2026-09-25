import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import WkDropdown from "./WkDropdown.jsx";
import { claimOpen, openCount } from "./dismiss.js";

const opts = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];

function Two() {
  return (
    <div>
      <p data-testid="outside">elsewhere</p>
      <div data-testid="one">
        <WkDropdown label="One" value="a" options={opts} onPick={() => {}} />
      </div>
      <div data-testid="two">
        <WkDropdown label="Two" value="a" options={opts} onPick={() => {}} />
      </div>
    </div>
  );
}

const isOpen = (el) => el.querySelector(".wk-dd").classList.contains("on");
const trigger = (el) => el.querySelector(".wk-dd-b");

afterEach(() => cleanup());

describe("dropdowns close centrally (R05)", () => {
  it("closes on a pointer-down outside", () => {
    const { getByTestId } = render(<Two />);
    fireEvent.click(trigger(getByTestId("one")));
    expect(isOpen(getByTestId("one"))).toBe(true);
    fireEvent.pointerDown(getByTestId("outside"));
    expect(isOpen(getByTestId("one"))).toBe(false);
  });

  it("stays open for a pointer-down inside it", () => {
    const { getByTestId } = render(<Two />);
    fireEvent.click(trigger(getByTestId("one")));
    fireEvent.pointerDown(getByTestId("one").querySelector(".wk-dd-m"));
    expect(isOpen(getByTestId("one"))).toBe(true);
  });

  it("closes on Escape", () => {
    const { getByTestId } = render(<Two />);
    fireEvent.click(trigger(getByTestId("one")));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(isOpen(getByTestId("one"))).toBe(false);
  });

  it("closes when another dropdown opens", () => {
    const { getByTestId } = render(<Two />);
    fireEvent.click(trigger(getByTestId("one")));
    fireEvent.click(trigger(getByTestId("two")));
    expect(isOpen(getByTestId("two"))).toBe(true);
    expect(isOpen(getByTestId("one"))).toBe(false);
  });

  it("closes a plain-DOM panel (the marketing nav) when a React one opens", () => {
    let navOpen = true;
    let release;
    const closeNav = () => {
      navOpen = false;
      release?.();
    };
    release = claimOpen(closeNav);
    const { getByTestId } = render(<Two />);
    act(() => {
      fireEvent.click(trigger(getByTestId("one")));
    });
    expect(navOpen).toBe(false);
  });

  it("leaves nothing registered once everything is closed", () => {
    const { getByTestId } = render(<Two />);
    fireEvent.click(trigger(getByTestId("one")));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(openCount()).toBe(0);
  });
});
