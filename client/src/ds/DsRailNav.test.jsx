import React from "react";
import { describe, it, expect } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DsRailNav from "./DsRailNav.jsx";

const d = { initials: "AS", orgName: "ADLM Studio", orgSub: "", projects: "2" };

function tools(owned) {
  const { container } = render(
    <MemoryRouter>
      <DsRailNav activeId={null} d={d} owned={owned} onSignOut={() => {}} />
    </MemoryRouter>,
  );
  const out = Object.fromEntries(
    [...container.querySelectorAll(".dsh-sub a")].map((a) => [
      a.textContent.replace(/Add$/, "").trim(),
      { href: a.getAttribute("href"), off: a.classList.contains("off"), add: !!a.querySelector(".add") },
    ]),
  );
  cleanup();
  return out;
}

describe("My tools follow the account's licences", () => {
  it("opens every tool the account owns", () => {
    const t = tools(new Set(["revit", "planswift", "mep", "civil3d"]));
    expect(t.QUIV).toEqual({ href: "/work/tool/quiv", off: false, add: false });
    expect(t.HERON).toEqual({ href: "/work/tool/heron", off: false, add: false });
    expect(t["Revit MEP"]).toEqual({ href: "/work/tool/mep", off: false, add: false });
    expect(t.CIVIQ).toEqual({ href: "/work/tool/civiq", off: false, add: false });
  });

  it("greys a tool the account does not own and offers to add it", () => {
    const t = tools(new Set(["revit"]));
    expect(t.QUIV.off).toBe(false);
    expect(t["Revit MEP"]).toEqual({ href: "/product/mep", off: true, add: true });
    expect(t.HERON).toEqual({ href: "/product/planswift", off: true, add: true });
  });

  it("shows plain links, never greyed, before the licences are known", () => {
    const t = tools(null);
    expect(Object.values(t).every((x) => !x.off)).toBe(true);
  });
});
