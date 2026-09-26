import React from "react";
import { describe, it, expect } from "vitest";
import { render, within, waitFor } from "@testing-library/react";
import lazyScreen from "./lazyScreen.jsx";

// Every query is scoped to the container this render returned. vitest runs
// without `globals`, so @testing-library never registers its auto-cleanup and
// the document keeps the previous test's markup — a `screen` query here would
// happily match the test above it.
const mount = (el) => within(render(el).container);

// A loader we control, so the pending state can be looked at rather than
// raced past.
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("lazyScreen", () => {
  it("says it is loading, then renders the screen with its props", async () => {
    const d = deferred();
    const Screen = lazyScreen(() => d.promise);

    const view = mount(<Screen name="Adedolapo" />);
    expect(view.getByText("Loading…")).toBeTruthy();

    d.resolve({ default: ({ name }) => <p>Hello {name}</p> });
    await waitFor(() => expect(view.getByText("Hello Adedolapo")).toBeTruthy());
    expect(view.queryByText("Loading…")).toBeNull();
  });

  it("offers a reload when the chunk itself cannot be fetched", async () => {
    const Screen = lazyScreen(() =>
      Promise.reject(new Error("Failed to fetch dynamically imported module: /assets/x.js")),
    );

    const view = mount(<Screen />);
    await waitFor(() =>
      expect(view.getByText(/the app was updated while this tab was open/)).toBeTruthy(),
    );
    expect(view.getByRole("button", { name: "Reload" })).toBeTruthy();
  });

  // The distinction LazyScreen exists to make: a fault in the screen must not
  // be reported as a stale chunk, because reloading does not fix it and the
  // message sends whoever reads it to look at caches.
  it("shows a screen's own error as a fault in the screen", async () => {
    const Screen = lazyScreen(async () => ({
      default: () => {
        throw new Error("budgetItems is not iterable");
      },
    }));

    const view = mount(<Screen />);
    await waitFor(() => expect(view.getByText(/fault in the page/)).toBeTruthy());
    expect(view.getByText("budgetItems is not iterable")).toBeTruthy();
    expect(view.queryByText(/app was updated/)).toBeNull();
  });
});
