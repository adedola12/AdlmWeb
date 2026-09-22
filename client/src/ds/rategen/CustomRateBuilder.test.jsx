// S18 review, finding 7: a custom rate line used to be filed against a row
// number, not a material.
//
// GET /rategen/master numbers its rows `sn: i + 1` over one request's sorted,
// location-scoped list. Add a material to the catalogue, or work in another
// state, and that number means a different row. A line now carries the name
// and unit it was picked by — the identity the price-override system already
// matches on — and leaves refSn for the desktop's own stable serial.

import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

import CustomRateBuilder from "./CustomRateBuilder.jsx";
import { draftToPayload, emptyDraft } from "./customRateDraft.js";

const materials = [
  { sn: 1, description: "Cement", unit: "bag", price: 9000, category: "Concrete" },
  { sn: 2, description: "Steel", unit: "tonne", price: 1200000, category: "Reinforcement" },
  { sn: 3, description: "Steel", unit: "kg", price: 1400, category: "Reinforcement" },
];

const labour = [{ sn: 1, description: "Mason gang", unit: "day", price: 25000, category: "Trades" }];

function mount() {
  const draftRef = { current: null };
  const r = render(
    <CustomRateBuilder
      draftRef={draftRef}
      materials={materials}
      labour={labour}
      sections={[]}
      initial={emptyDraft()}
    />,
  );
  return { ...r, draftRef };
}

afterEach(cleanup);

describe("a line in the custom-rate builder", () => {
  it("files the line by name and unit, not by the catalogue's row number", () => {
    const { getByText, draftRef } = mount();
    fireEvent.click(getByText("+ Add material"));

    const line = draftRef.current.lines[0];
    expect(line.name).toBe("Cement");
    expect(line.unit).toBe("bag");
    expect(line.category).toBe("Concrete");
    // sn: 1 is this request's position in the list, and it is not stored.
    expect(line.refSn).toBe(null);
  });

  it("carries the name into the payload the server files the rate under", () => {
    const { getByText, draftRef } = mount();
    fireEvent.click(getByText("+ Add material"));
    const payload = draftToPayload(
      { ...draftRef.current, name: "Test rate", unit: "m2" },
      "test-1",
      1,
    );
    expect(payload.materials[0].refName).toBe("Cement");
    expect(payload.materials[0].refSn).toBe(null);
    expect(payload.breakdown[0].refSn).toBe(null);
  });

  it("tells two rows of the same name apart by their unit", () => {
    // The catalogue prices steel per tonne and per kg. Picking one has to give
    // that one, which is why the unit is part of a line's identity.
    const { getByText, getByLabelText, draftRef } = mount();
    fireEvent.click(getByText("+ Add material"));
    fireEvent.change(getByLabelText("Materials line"), { target: { value: "Steel|kg" } });

    const line = draftRef.current.lines[0];
    expect(line.name).toBe("Steel");
    expect(line.unit).toBe("kg");
    expect(line.unitPrice).toBe(1400);
  });

  it("shows the line that is actually selected", () => {
    const { getByText, getByLabelText } = mount();
    fireEvent.click(getByText("+ Add material"));
    fireEvent.change(getByLabelText("Materials line"), { target: { value: "Steel|tonne" } });
    expect(getByLabelText("Materials line").value).toBe("Steel|tonne");
  });

  it("leaves a hand-typed plant line alone, because it has no catalogue", () => {
    const { getByText, draftRef } = mount();
    fireEvent.click(getByText("+ Add plant"));
    const line = draftRef.current.lines[0];
    expect(line.kind).toBe("plant");
    expect(line.refSn).toBe(null);
    expect(line.unit).toBe("h");
  });
});
