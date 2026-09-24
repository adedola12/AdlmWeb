import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, act, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DsLaunchStrip from "./DsLaunchStrip.jsx";

const mount = (launch) =>
  render(
    <MemoryRouter>
      <DsLaunchStrip launch={launch} />
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  sessionStorage.clear();
});

describe("the launch countdown strip (R20)", () => {
  it("shows nothing until a date is set", () => {
    const { container } = mount({ at: "", label: "Opens in" });
    expect(container.querySelector(".launch-strip")).toBeNull();
  });

  it("counts down every second and takes itself down when the time comes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T09:59:58+01:00"));
    const { container } = mount({ at: "2026-10-15T10:00:00+01:00", label: "Opens in", cta: { label: "See", to: "/x" } });
    const units = () => [...container.querySelectorAll(".launch-count .u b")].map((b) => b.textContent);
    expect(units()).toEqual(["1", "00", "00", "02"]);
    act(() => vi.advanceTimersByTime(1000));
    expect(units()).toEqual(["1", "00", "00", "01"]);
    act(() => vi.setSystemTime(new Date("2026-10-15T10:00:01+01:00")));
    act(() => vi.advanceTimersByTime(1000));
    expect(container.querySelector(".launch-strip")).toBeNull();
    expect(document.documentElement.style.getPropertyValue("--launch-strip-h")).toBe("");
  });

  it("can be closed for the session", () => {
    const launch = { at: new Date(Date.now() + 86400000).toISOString(), label: "Opens in" };
    const { container, getByLabelText } = mount(launch);
    fireEvent.click(getByLabelText("Close the countdown"));
    expect(container.querySelector(".launch-strip")).toBeNull();
    cleanup();
    expect(mount(launch).container.querySelector(".launch-strip")).toBeNull();
  });
});
