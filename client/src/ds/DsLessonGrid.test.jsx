import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

const video = (id, extra = {}) => ({ _id: id, youtubeId: `yt${id}`, title: `Lesson ${id}`, durationSec: 125, ...extra });

vi.mock("../lib/freeVideos.js", async (orig) => ({
  ...(await orig()),
  fetchLessonLibrary: vi.fn(async () => ({
    filters: ["Revit", "PlanSwift", "Rates", "Getting started"],
    sections: [
      { slug: "getting-started", filter: "Getting started", label: "Getting started", videos: [video("g1")] },
      { slug: "quiv", filter: "Revit", label: "QUIV for Revit", videos: [video("q1"), video("q2"), video("q3", { recommended: true })] },
      { slug: "heron", filter: "PlanSwift", label: "HERON for PlanSwift", videos: [video("h1"), video("h2")] },
    ],
  })),
}));

const { default: DsLessonGrid } = await import("./DsLessonGrid.jsx");

let where = "";
const Spy = () => {
  const l = useLocation();
  where = l.search;
  return null;
};

function mount(url = "/learn") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <DsLessonGrid />
              <Spy />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  cleanup();
  window.innerWidth = 1280;
});

describe("his free lessons, on the real library (R02)", () => {
  it("shows one row of three, recommended first, with his count and Show more", async () => {
    const { container, getByText } = mount();
    await waitFor(() => expect(container.querySelectorAll(".ltile").length).toBe(3));
    expect(container.querySelector(".ltile h4").textContent).toBe("Lesson q3");
    expect(container.querySelector(".ltile .eyebrow").textContent).toBe("Revit · 2:05");
    expect(container.querySelector(".ltile p").textContent).toBe("QUIV for Revit");
    expect(container.querySelector(".ltile").getAttribute("href")).toBe("/learn/free/q3");
    expect(getByText("Showing 3 of 6 lessons")).toBeTruthy();
    fireEvent.click(getByText("Show more lessons"));
    expect(container.querySelectorAll(".lrow").length).toBe(2);
    expect(getByText("All 6 lessons")).toBeTruthy();
  });

  it("offers only the chips with lessons behind them, and keeps the choice in the URL", async () => {
    const { container, getByText } = mount();
    await waitFor(() => expect(container.querySelectorAll("#lesson-filters button").length).toBe(4));
    expect([...container.querySelectorAll("#lesson-filters button")].map((b) => b.textContent)).toEqual([
      "All",
      "Revit",
      "PlanSwift",
      "Getting started",
    ]);
    fireEvent.click(getByText("PlanSwift"));
    expect(where).toBe("?lessons=PlanSwift");
    expect([...container.querySelectorAll(".ltile h4")].map((h) => h.textContent)).toEqual(["Lesson h1", "Lesson h2"]);
    expect(getByText("All 2 lessons")).toBeTruthy();
  });

  it("opens on the filter a link asks for", async () => {
    const { container } = mount("/learn?lessons=Getting%20started");
    await waitFor(() => expect(container.querySelectorAll(".ltile").length).toBe(1));
    expect(container.querySelector("#lesson-filters .on").textContent).toBe("Getting started");
  });
});
