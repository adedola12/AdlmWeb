// The checkout, where being wrong costs money.
//
// Two things this screen could not do, both silent:
//
//   * A discount code did nothing. POST /purchase/cart has read couponCode all
//     along and applies it through validateAndComputeDiscount; this checkout
//     never sent it, so a code that worked on the classic page was ignored here
//     and the buyer was charged full price without being told.
//   * Cloud storage was dropped. The item mapping built
//     { productKey, seats, periods, firstTime } and left storageBlocks out, so
//     storage somebody had chosen and been quoted for was not on the order they
//     paid for. The server prices it per item; it only ever arrived undefined.
//
// Neither would fail loudly. Both end as a wrong amount, which is the one kind
// of wrong a customer notices and nobody else does.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = vi.fn();
vi.mock("../store.jsx", async (orig) => ({
  ...(await orig()),
  useAuth: () => ({ accessToken: "t", user: { _id: "u1", email: "qs@practice.ng" } }),
}));
vi.mock("../api.js", async (orig) => ({ ...(await orig()), apiAuthed: (...a) => api(...a) }));

const CART = [
  { productKey: "revit", qty: 2, seats: 3, firstTime: true, storageBlocks: 2 },
  { productKey: "planswift", qty: 1, seats: 1 },
];

vi.mock("../lib/cart.js", async (orig) => ({
  ...(await orig()),
  readCartItems: () => CART,
  readCartMeta: () => ({ currency: "NGN", org: { name: "", email: "" } }),
  writeCartItems: () => {},
}));

const { default: DsCheckoutWire } = await import("./DsCheckoutWire.jsx");

const mount = () =>
  render(
    <MemoryRouter>
      <DsCheckoutWire />
    </MemoryRouter>,
  );

/**
 * The pay button, by its class rather than its words.
 *
 * Its label changes with the payment method and with whether an order exists
 * ("Pay ...", "Order created", "Invoice requested"), and a text matcher loose
 * enough to catch them all also catches the Apply button. It is the only
 * .btn-full on the screen.
 */
const pay = (c) => c.container.querySelector(".btn-full");

/** Everything this screen reads on mount, so only the call under test matters. */
const baseApi = (path) => {
  const p = String(path);
  if (p.includes("/catalog") || p.includes("/products")) return Promise.resolve({ items: [] });
  if (p.includes("bank-details")) return Promise.resolve({});
  return Promise.resolve({});
};

beforeEach(() => {
  api.mockReset();
  api.mockImplementation(baseApi);
});
afterEach(cleanup);

/** The body of the POST that creates the order. */
const orderBody = () => {
  const call = api.mock.calls.find(
    (c) => String(c[0]).includes("/purchase/cart") && c[1]?.method === "POST",
  );
  return call ? JSON.parse(call[1].body) : null;
};

describe("what reaches the order", () => {
  it("carries the storage blocks somebody was quoted for", async () => {
    const c = mount();
    await screen.findByText(/Discount code/);
    fireEvent.click(pay(c));

    await waitFor(() => expect(orderBody()).toBeTruthy());
    const revit = orderBody().items.find((i) => i.productKey === "revit");
    expect(revit.storageBlocks).toBe(2);
    // And a line without any is sent as 0, not undefined — the server parses
    // the field, and an absent one is a different thing from none.
    expect(orderBody().items.find((i) => i.productKey === "planswift").storageBlocks).toBe(0);
  });

  it("still carries seats and periods as it did", async () => {
    const c = mount();
    await screen.findByText(/Discount code/);
    fireEvent.click(pay(c));
    await waitFor(() => expect(orderBody()).toBeTruthy());
    const revit = orderBody().items.find((i) => i.productKey === "revit");
    expect(revit.seats).toBe(3);
    expect(revit.periods).toBe(2);
    expect(revit.firstTime).toBe(true);
  });
});

describe("a discount code", () => {
  const accepted = (path, init) => {
    if (String(path).includes("/coupons/validate")) {
      return Promise.resolve({ coupon: { code: "QS20" }, discount: 20000 });
    }
    return baseApi(path, init);
  };

  it("is checked before the order is created, not after", async () => {
    api.mockImplementation(accepted);
    // No pay button needed here: the point is that nothing is ordered.
    mount();
    await screen.findByText(/Discount code/);

    fireEvent.change(screen.getByLabelText("Discount code"), { target: { value: "QS20" } });
    fireEvent.click(screen.getByText("Apply"));

    expect(await screen.findByText(/QS20 applied/)).toBeTruthy();
    // Nothing has been ordered yet — the whole point of checking first.
    expect(orderBody()).toBeNull();
  });

  it("reaches the order once accepted", async () => {
    api.mockImplementation(accepted);
    const c = mount();
    await screen.findByText(/Discount code/);
    fireEvent.change(screen.getByLabelText("Discount code"), { target: { value: "QS20" } });
    fireEvent.click(screen.getByText("Apply"));
    await screen.findByText(/QS20 applied/);

    fireEvent.click(pay(c));
    await waitFor(() => expect(orderBody()).toBeTruthy());
    expect(orderBody().couponCode).toBe("QS20");
  });

  it("is NOT sent when it was refused", async () => {
    // A 200 carrying no coupon is a refusal. Sending it anyway would have the
    // server reject it a second time and the buyer learn from the amount.
    api.mockImplementation((path, init) =>
      String(path).includes("/coupons/validate")
        ? Promise.resolve({ coupon: null })
        : baseApi(path, init),
    );
    const c = mount();
    await screen.findByText(/Discount code/);
    fireEvent.change(screen.getByLabelText("Discount code"), { target: { value: "NOPE" } });
    fireEvent.click(screen.getByText("Apply"));

    expect(await screen.findByText(/not accepted/i)).toBeTruthy();
    fireEvent.click(pay(c));
    await waitFor(() => expect(orderBody()).toBeTruthy());
    expect(orderBody().couponCode).toBeUndefined();
  });

  it("is dropped the moment the code is edited", async () => {
    // Otherwise somebody edits an applied code and the order carries the old
    // one, which is a different discount from the one on screen.
    api.mockImplementation(accepted);
    const c = mount();
    await screen.findByText(/Discount code/);
    fireEvent.change(screen.getByLabelText("Discount code"), { target: { value: "QS20" } });
    fireEvent.click(screen.getByText("Apply"));
    await screen.findByText(/QS20 applied/);

    fireEvent.click(screen.getByText("Remove"));
    fireEvent.change(screen.getByLabelText("Discount code"), { target: { value: "QS99" } });
    expect(screen.queryByText(/QS20 applied/)).toBeNull();

    fireEvent.click(pay(c));
    await waitFor(() => expect(orderBody()).toBeTruthy());
    expect(orderBody().couponCode).toBeUndefined();
  });

  it("surfaces the reason the code was refused, which the server words", async () => {
    api.mockImplementation((path, init) => {
      if (String(path).includes("/coupons/validate")) {
        const p = Promise.reject(new Error("Network request failed"));
        p.catch(() => {});
        return p;
      }
      return baseApi(path, init);
    });
    mount();
    await screen.findByText(/Discount code/);
    fireEvent.change(screen.getByLabelText("Discount code"), { target: { value: "QS20" } });
    fireEvent.click(screen.getByText("Apply"));

    // The server's own wording, not ours. "Expired", "not valid for these
    // products" and the like are what the buyer actually needs, and the classic
    // checkout surfaces them the same way (Purchase.jsx, e.message).
    expect(await screen.findByText(/Network request failed/i)).toBeTruthy();
    // ...and nothing anywhere claims the code was applied.
    expect(screen.queryByText(/applied/i)).toBeNull();
  });
});
