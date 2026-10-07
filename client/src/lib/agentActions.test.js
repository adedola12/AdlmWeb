import { describe, it, expect, vi } from "vitest";
import { runAgentAction, waGreeting, waLink } from "./agentActions.js";

// The server emits four action types and they are Ada's only structured output.
// One surface ran them; the project workspace read json.reply and dropped
// json.actions entirely — so every upsell she offered on the screen a QS works
// in did nothing at all.

const deps = () => ({
  navigate: vi.fn(),
  addToCart: vi.fn(),
  onDone: vi.fn(),
  openExternal: vi.fn(),
  user: { firstName: "Ade", lastName: "Quasim" },
});

describe("running an action", () => {
  it("adds to the cart and goes to checkout", () => {
    const d = deps();
    expect(runAgentAction({ type: "buy", productKey: "planswift", months: 3 }, d)).toBe(true);
    expect(d.addToCart).toHaveBeenCalledWith("planswift", 3);
    expect(d.navigate).toHaveBeenCalledWith("/purchase");
    expect(d.onDone).toHaveBeenCalled();
  });

  it("defaults a buy to one month", () => {
    const d = deps();
    runAgentAction({ type: "buy", productKey: "revit" }, d);
    expect(d.addToCart).toHaveBeenCalledWith("revit", 1);
  });

  it("sends a guest to signup", () => {
    const d = deps();
    runAgentAction({ type: "signup" }, d);
    expect(d.navigate).toHaveBeenCalledWith("/signup");
  });

  it("navigates in-app", () => {
    const d = deps();
    runAgentAction({ type: "nav", to: "/manage/billing" }, d);
    expect(d.navigate).toHaveBeenCalledWith("/manage/billing");
  });

  it("refuses a nav that is not an in-app path", () => {
    // The server already refuses these; re-checking means a crafted reply
    // cannot talk a surface into opening an external site.
    const d = deps();
    expect(runAgentAction({ type: "nav", to: "https://evil.example/x" }, d)).toBe(false);
    expect(runAgentAction({ type: "nav", to: "//evil.example" }, d)).toBe(false);
    expect(d.navigate).not.toHaveBeenCalled();
  });

  it("opens WhatsApp with the name when we know it", () => {
    const d = deps();
    runAgentAction({ type: "whatsapp", number: "234 810 650 3524" }, d);
    const url = d.openExternal.mock.calls[0][0];
    expect(url).toContain("https://wa.me/2348106503524");
    expect(decodeURIComponent(url)).toContain("Ade Quasim here");
  });

  it("falls back to the anonymous greeting with no name", () => {
    expect(waGreeting({})).toBe("Hi ADLM, I need help.");
    expect(waGreeting({ firstName: "Ade" })).toContain("Ade here");
  });

  it("ignores an unknown or missing action rather than throwing", () => {
    const d = deps();
    expect(runAgentAction(null, d)).toBe(false);
    expect(runAgentAction({ type: "delete_everything" }, d)).toBe(false);
    expect(runAgentAction({ type: "buy" }, d)).toBe(false);
    expect(d.navigate).not.toHaveBeenCalled();
  });

  it("strips non-digits from a phone number", () => {
    expect(waLink("+234 (810) 650-3524", "hi")).toContain("wa.me/2348106503524");
  });
});
