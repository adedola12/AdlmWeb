import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";

let who = null;
vi.mock("../store.jsx", () => ({ useAuth: () => ({ user: who }) }));
vi.mock("./DsShell.jsx", () => ({ default: ({ children }) => <main>{children}</main> }));

const { default: DsFlagRoute } = await import("./DsFlagRoute.jsx");

const view = (live) =>
  render(<DsFlagRoute live={live} full={<p>the real page</p>} soon={<p>coming soon</p>} />);

afterEach(() => {
  cleanup();
  who = null;
});

describe("a page behind a launch flag (R21)", () => {
  it("shows the public Coming soon while the flag is off", async () => {
    who = { role: "user", email: "a@b.c" };
    const { findByText, queryByText } = view(false);
    expect(await findByText("coming soon")).toBeTruthy();
    expect(queryByText("the real page")).toBeNull();
  });

  it("lets staff see the real page with the flag off", async () => {
    who = { role: "admin", email: "admin@adlmstudio.net" };
    const { findByText } = view(false);
    expect(await findByText("the real page")).toBeTruthy();
  });

  it("opens the page to everyone once the flag is on", async () => {
    const { findByText } = view(true);
    await waitFor(async () => expect(await findByText("the real page")).toBeTruthy());
  });
});
