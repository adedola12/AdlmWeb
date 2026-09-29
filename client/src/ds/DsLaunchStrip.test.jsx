import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, act, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DsLaunchStrip, { LIVE_LEAD } from "./DsLaunchStrip.jsx";
import { LAUNCH } from "../config/launch.js";

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
    const { container } = mount({ at: "", event: "Official launch in" });
    expect(container.querySelector(".launch-strip")).toBeNull();
  });

  it("counts down every second and takes itself down when the time comes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T09:59:58+01:00"));
    const { container } = mount({ at: "2026-10-15T10:00:00+01:00", event: "Official launch in", cta: { label: "See", to: "/x" } });
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
    const launch = { at: new Date(Date.now() + 86400000).toISOString(), event: "Official launch in" };
    const { container, getByLabelText } = mount(launch);
    fireEvent.click(getByLabelText("Close the countdown"));
    expect(container.querySelector(".launch-strip")).toBeNull();
    cleanup();
    expect(mount(launch).container.querySelector(".launch-strip")).toBeNull();
  });

  it("says the new site is live, because it only renders on the new site", () => {
    // The strip is part of the new build, so whoever sees it is on the live
    // new site. It read "The new ADLM Studio opens in 5 days" on the live new
    // site from 24 Sep; this keeps that from coming back.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T12:00:00+01:00"));
    const { container } = mount(LAUNCH);
    const text = container.querySelector(".launch-strip .lab").textContent;
    expect(text.startsWith(LIVE_LEAD)).toBe(true);
    expect(text).toContain(LAUNCH.event);
  });

  it("the configured wording never announces the site as not yet open", () => {
    const words = [LAUNCH.event, LAUNCH.cta?.label].join(" ");
    expect(words).not.toMatch(/\b(opens?|opening|coming soon|will (open|launch)|goes live|not yet)\b/i);
    expect(LIVE_LEAD).toMatch(/\bis live\b/);
  });
});
