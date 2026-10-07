import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Link, useLocation } from "react-router-dom";

vi.mock("../components/Seo.jsx", () => ({ default: ({ title }) => <meta data-title={title} /> }));

const { default: DsProductRoute } = await import("./DsProductRoute.jsx");

// Stand-ins for his pages: each carries his "Get" button shape.
const fake = (name) =>
  function Page() {
    return (
      <Link to="/purchase" data-ds-page="cart">
        Get {name}
      </Link>
    );
  };
const pages = {
  quiv: fake("QUIV"),
  heron: fake("HERON"),
  rategen: fake("RateGen"),
  mep: fake("SERVIQ"),
  timepro: fake("Time Pro"),
  civiq: fake("CIVIQ"),
};

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + loc.search}</p>;
}

const at = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/product/:key"
          element={<DsProductRoute pages={pages} wrap={(page) => <main>{page}</main>} />}
        />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("/product/:key after the classic page was retired", () => {
  it.each([
    ["revit", "QUIV"],
    ["planswift", "HERON"],
    ["rategen", "RateGen"],
    ["mep", "SERVIQ"],
    ["qs-takeoff", "Time Pro"],
    ["civil3d", "CIVIQ"],
  ])("renders his page for %s", async (key, name) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false });
    const { findByText } = at(`/product/${key}`);
    expect(await findByText(`Get ${name}`)).toBeTruthy();
  });

  it("opens checkout with the product in the order", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false });
    const { findByText, findByTestId } = at("/product/planswift");
    fireEvent.click(await findByText("Get HERON"));
    expect((await findByTestId("where")).textContent).toBe("/purchase?product=planswift");
  });

  it("sends a course key to /learn", async () => {
    const { findByTestId } = at("/product/bimbld");
    expect((await findByTestId("where")).textContent).toBe("/learn");
  });

  it("sends any other key to /products", async () => {
    const { findByTestId } = at("/product/archicad");
    expect((await findByTestId("where")).textContent).toBe("/products");
  });
});
