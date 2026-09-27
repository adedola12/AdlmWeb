import { describe, it, expect } from "vitest";
import { plantDraft, plantDraftProblem, plantFigures } from "./plantMath.js";

// The worked mixer from server/util/plantCosting.test.js, so the screen and
// the server are held to the same figures.
const mixer = () => ({
  name: "Concrete mixer (1-bag)",
  hoursPerDay: "8",
  parts: [
    { kind: "hire", description: "Mixer hire", quantity: 1, unit: "day", unitPrice: 25000 },
    { kind: "fuel", description: "Diesel", quantity: 15, unit: "L", unitPrice: 1000 },
    { kind: "operator", description: "Operator", quantity: 1, unit: "day", unitPrice: 8000 },
    { kind: "maintenance", description: "Servicing", quantity: 1, unit: "day", unitPrice: 2000 },
    { kind: "transport", description: "Delivery, spread", quantity: 1, unit: "day", unitPrice: 4000 },
  ],
});

describe("plantFigures", () => {
  it("₦54,000 a day over 8 hours is ₦6,750 an hour", () => {
    const f = plantFigures(mixer());
    expect(f.dayCost).toBe(54000);
    expect(f.hourlyRate).toBe(6750);
  });

  it("a part with no price leaves the machine unpriced, never at ₦0", () => {
    const m = mixer();
    m.parts[1].unitPrice = "";
    const f = plantFigures(m);
    expect(f.hourlyRate).toBe(null);
    expect(f.problems).toEqual(["Diesel has no price"]);
    expect(plantDraftProblem(m)).toBe("Diesel has no price");
  });

  it("the working day is required and at most 24 hours", () => {
    expect(plantDraftProblem({ ...mixer(), hoursPerDay: "" })).toMatch(/more than 0/);
    expect(plantDraftProblem({ ...mixer(), hoursPerDay: "30" })).toMatch(/24/);
    expect(plantDraftProblem(mixer())).toBe(null);
  });

  it("a blank machine starts with one hire part and an 8-hour day", () => {
    const d = plantDraft();
    expect(d.hoursPerDay).toBe("8");
    expect(d.parts).toHaveLength(1);
    expect(d.parts[0].kind).toBe("hire");
  });
});
