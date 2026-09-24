// The reveal has to reach a panel that was not on the page when it ran.
//
// `:root.js .ds .rise` is opacity:0 and only `in` takes it back to 1, so an
// element the reveal never saw is invisible for as long as the page is open.
// Every conditionally rendered `.rise` is in exactly that position — the
// saved-quotations panel on /quote (DsQuoteBuilder) mounts the moment the
// customer keeps their FIRST quotation, which is always after first render.

import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, act, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useDsBehaviours } from "./useDsBehaviours.js";

// A stand-in for the real observer: jsdom has none, and without one the hook
// takes its reduced-motion path and the animated case is never exercised.
// Everything handed to it is treated as on screen, which is what a visitor
// looking at the panel they just created sees.
function fakeIntersectionObserver() {
  const seen = new Set();
  class IO {
    constructor(cb) {
      this.cb = cb;
    }
    observe(el) {
      if (seen.has(el)) return; // spec: observing twice is a no-op
      seen.add(el);
      this.cb([{ target: el, isIntersecting: true }]);
    }
    unobserve(el) {
      seen.delete(el);
    }
    disconnect() {
      seen.clear();
    }
  }
  return { IO, seen };
}

function Harness() {
  const ref = React.useRef(null);
  const [kept, setKept] = React.useState(false);
  useDsBehaviours(ref);
  return (
    <div className="ds" ref={ref}>
      <div className="panel rise" data-testid="always">
        On the page from the start
      </div>
      <button type="button" onClick={() => setKept(true)}>
        Keep this quotation
      </button>
      {kept && (
        <div id="qt-saved" className="panel rise" data-testid="saved">
          <h3>Kept on this machine</h3>
        </div>
      )}
    </div>
  );
}

const mount = () =>
  render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>,
  );

// The MutationObserver callback is a microtask, so let it run.
const settle = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

afterEach(cleanup);

describe("the reveal reaches content that mounts later", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  });

  it("reveals a panel rendered after the first pass, with the observer running", async () => {
    const { IO } = fakeIntersectionObserver();
    vi.stubGlobal("IntersectionObserver", IO);

    const { getByText, getByTestId, queryByTestId } = mount();
    expect(getByTestId("always").classList.contains("in")).toBe(true);
    expect(queryByTestId("saved")).toBeNull();

    fireEvent.click(getByText("Keep this quotation"));
    await settle();

    // Without this the customer's first kept quotation renders at opacity 0.
    expect(getByTestId("saved").classList.contains("in")).toBe(true);
  });

  it("reveals it with no observer at all, which is the reduced-motion path", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    // `"IntersectionObserver" in window` is what the hook tests, so the key
    // has to go rather than hold undefined.
    delete window.IntersectionObserver;

    const { getByText, getByTestId } = mount();
    expect(getByTestId("always").classList.contains("in")).toBe(true);

    fireEvent.click(getByText("Keep this quotation"));
    await settle();

    expect(getByTestId("saved").classList.contains("in")).toBe(true);
  });

  it("stops watching once the page unmounts", async () => {
    const { IO, seen } = fakeIntersectionObserver();
    vi.stubGlobal("IntersectionObserver", IO);

    const { getByText, unmount } = mount();
    fireEvent.click(getByText("Keep this quotation"));
    await settle();

    unmount();
    expect(seen.size).toBe(0);
    expect(document.documentElement.classList.contains("js")).toBe(false);
  });
});
