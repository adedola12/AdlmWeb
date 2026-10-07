import { describe, it, expect } from "vitest";
import { marginRowsFrom, marginRowsPayload } from "./tradeMargins.js";

const trades = [
  { sectionKey: "blockwork", sectionLabel: "Blockwork", yours: { overheadPercent: 10, profitPercent: 20 }, adlm: { overheadPercent: null, profitPercent: null } },
  { sectionKey: "mep", sectionLabel: "MEP", yours: { overheadPercent: null, profitPercent: null }, adlm: { overheadPercent: 12, profitPercent: 15 } },
];

describe("trade margin rows", () => {
  it("a customer edits their own figures; ADLM's ride along for reference", () => {
    const rows = marginRowsFrom(trades, "custom");
    expect(rows[0]).toMatchObject({ sectionKey: "blockwork", overheadPercent: 10, profitPercent: 20 });
    expect(rows[1]).toMatchObject({ sectionKey: "mep", overheadPercent: "", profitPercent: "" });
    expect(rows[1].adlm).toEqual({ overheadPercent: 12, profitPercent: 15 });
    expect(rows[0].builtin).toEqual({ overheadPercent: 10, profitPercent: 10 });
  });

  it("the admin edits ADLM's figures against 10 / 25", () => {
    const rows = marginRowsFrom(trades, "master");
    expect(rows[1]).toMatchObject({ overheadPercent: 12, profitPercent: 15 });
    expect(rows[1].builtin).toEqual({ overheadPercent: 10, profitPercent: 25 });
  });

  it("a trade with both boxes blank is dropped, which resets it to the default", () => {
    const { problem, rows } = marginRowsPayload(marginRowsFrom(trades, "custom"));
    expect(problem).toBe(null);
    expect(rows).toEqual([{ sectionKey: "blockwork", overheadPercent: 10, profitPercent: 20 }]);
  });

  it("keeps a half that was set and sends the other as null", () => {
    const { rows } = marginRowsPayload([{ sectionKey: "finishes", sectionLabel: "Finishes", overheadPercent: "", profitPercent: "18" }]);
    expect(rows).toEqual([{ sectionKey: "finishes", overheadPercent: null, profitPercent: 18 }]);
  });

  it("refuses a negative or non-numeric figure in words", () => {
    expect(marginRowsPayload([{ sectionKey: "mep", sectionLabel: "MEP", overheadPercent: "-2", profitPercent: "" }]).problem).toBe(
      "MEP: Overhead cannot be less than 0%",
    );
    expect(marginRowsPayload([{ sectionKey: "mep", sectionLabel: "MEP", overheadPercent: "", profitPercent: "abc" }]).problem).toBe(
      "MEP: Profit has to be a number",
    );
  });
});
