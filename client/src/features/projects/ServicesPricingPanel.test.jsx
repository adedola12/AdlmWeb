import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ServicesPricingPanel from "./ServicesPricingPanel.jsx";

// Pricing re-derives every rate on the bill from the CALLER's RateGen library.
// The server refuses that outright for a collaborator who may not see the
// prices (403 RATES_MASKED), so the panel must not offer a live button that
// can only come back as an error.

function panel(access) {
  return render(
    <MemoryRouter>
      <ServicesPricingPanel
        productKey="mep"
        projectId="p1"
        accessToken="t"
        access={access}
      />
    </MemoryRouter>,
  );
}

describe("services pricing panel", () => {
  afterEach(cleanup);

  it("prices for someone who can see the rates", () => {
    panel({ canEdit: true, canSeeRates: true });
    const btn = screen.getByRole("button", { name: /Price services/ });
    expect(btn.disabled).toBe(false);
  });

  it("disables pricing, with the reason, when rates are hidden", () => {
    panel({ canEdit: true, canSeeRates: false });
    const btn = screen.getByRole("button", { name: /Price services/ });
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("title")).toMatch(/Rates are hidden/i);
  });

  it("shows nothing to price to a view-only collaborator", () => {
    panel({ canEdit: false, canSeeRates: false });
    expect(screen.queryByRole("button", { name: /Price services/ })).toBeNull();
  });
});
