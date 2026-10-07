import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import ChatMarkdown from "./chatMarkdown.jsx";

const view = (text, props) => render(<ChatMarkdown text={text} {...props} />).container;

describe("Ada's replies (R17)", () => {
  it("renders bold and italics, and never shows a stray asterisk", () => {
    const c = view("HERON is **2D take-off** for *PlanSwift*. Priced per seat * month.");
    expect(c.querySelector("strong").textContent).toBe("2D take-off");
    expect(c.querySelector("em").textContent).toBe("PlanSwift");
    expect(c.textContent).not.toContain("*");
  });

  it("turns bullet and numbered lines into lists", () => {
    const c = view("Two options:\n- QUIV for Revit\n* HERON for PlanSwift\n\n1. Sign up\n2. Pick a plan");
    expect([...c.querySelectorAll("ul li")].map((l) => l.textContent)).toEqual(["QUIV for Revit", "HERON for PlanSwift"]);
    expect([...c.querySelectorAll("ol li")].map((l) => l.textContent)).toEqual(["Sign up", "Pick a plan"]);
    expect(c.querySelector("p").textContent).toBe("Two options:");
  });

  it("draws a table", () => {
    const c = view("| Product | Price |\n| --- | ---: |\n| QUIV | ₦45,000 |\n| HERON | ₦30,000 |");
    expect([...c.querySelectorAll("th")].map((t) => t.textContent)).toEqual(["Product", "Price"]);
    expect(c.querySelectorAll("tbody tr").length).toBe(2);
    expect(c.querySelector("tbody td").textContent).toBe("QUIV");
  });

  it("keeps line breaks inside a paragraph", () => {
    const c = view("First line\nSecond line");
    expect(c.querySelectorAll("p br").length).toBe(1);
  });

  it("links safely: new tab outside, in-app for site paths, words for anything else", () => {
    const go = vi.fn();
    const c = view("See [pricing](/pricing), [docs](https://www.adlmstudio.net/docs) or [this](javascript:alert(1)).", {
      onNavigate: go,
    });
    const links = c.querySelectorAll("a");
    expect(links.length).toBe(2);
    expect(links[1].getAttribute("target")).toBe("_blank");
    expect(links[1].getAttribute("rel")).toContain("noopener");
    fireEvent.click(links[0]);
    expect(go).toHaveBeenCalledWith("/pricing");
    expect(c.textContent).toContain("this");
    expect(c.innerHTML).not.toContain("javascript:");
  });

  it("never turns text into markup", () => {
    const c = view('<img src=x onerror="alert(1)"> **hi**');
    expect(c.querySelector("img")).toBeNull();
    expect(c.textContent).toContain("<img src=x");
  });
});
