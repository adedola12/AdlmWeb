import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import ProjectContractPanel from "./ProjectContractPanel.jsx";

// The panel's own state: which of his .pj-seg views is showing, and what the
// Variations view reads off the rows it is handed. Nothing here talks to the
// API — the handlers are stubs.

const baseProps = {
  certificates: [],
  onIssueCertificate: () => {},
  onFinalizeAccount: () => {},
  contractLocked: true,
  contractSum: 10_000_000,
  measured: 9_000_000,
  provisional: 0,
  preliminary: 0,
  variations: 0,
  hideModels: true,
};

// Rows as they come off a project: the first two were written before the
// status field existed, so they read as approved.
const rows = [
  { description: "Extra windows", qty: 1, unit: "item", rate: 500_000 },
  { description: "Omit render", qty: 1, unit: "item", rate: -120_000 },
  {
    description: "Stair balustrade",
    qty: 1,
    unit: "item",
    rate: 300_000,
    status: "pending",
    reference: "AI-012",
  },
];

function openFinalAccount() {
  fireEvent.click(screen.getByRole("button", { name: /Final account/ }));
}

function openVariations() {
  fireEvent.click(screen.getByRole("button", { name: /Variations/ }));
}

describe("contract administration panel (S18)", () => {
  afterEach(cleanup);

  it("opens on Certificates and switches to the view you press", () => {
    render(<ProjectContractPanel {...baseProps} variationRows={rows} />);
    const certs = screen.getByRole("button", { name: /Certificates/ });
    expect(certs.getAttribute("aria-pressed")).toBe("true");
    openVariations();
    expect(screen.getByRole("button", { name: /Variations/ }).getAttribute("aria-pressed")).toBe("true");
    expect(certs.getAttribute("aria-pressed")).toBe("false");
  });

  it("counts only the approved variations in the KPI row, and says what is waiting", () => {
    render(<ProjectContractPanel {...baseProps} variationRows={rows} />);
    openVariations();
    // 500,000 - 120,000 = 380,000 approved net. The pending 300,000 is not in it.
    expect(screen.getByText("₦380,000.00")).toBeTruthy();
    expect(screen.getByText("₦300,000.00 not counted yet")).toBeTruthy();
  });

  it("lists the variations newest first, with their status", () => {
    render(<ProjectContractPanel {...baseProps} variationRows={rows} />);
    openVariations();
    const numbers = Array.from(document.querySelectorAll(".pj-vars .no")).map(
      (n) => n.textContent,
    );
    expect(numbers).toEqual(["V3", "V2", "V1"]);
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(screen.getAllByText("Approved").length).toBe(2);
  });

  it("offers Add variation only to someone who may edit", () => {
    const { rerender } = render(
      <ProjectContractPanel {...baseProps} variationRows={rows} />,
    );
    openVariations();
    expect(screen.queryByRole("button", { name: /Add variation/ })).toBeNull();

    rerender(
      <ProjectContractPanel
        {...baseProps}
        variationRows={rows}
        canEditProject
        onRaiseVariation={vi.fn()}
      />,
    );
    openVariations();
    expect(screen.getByRole("button", { name: /Add variation/ })).toBeTruthy();
  });

  it("does not offer to raise a variation when rates are hidden", () => {
    // A variation is born with a value and there is no stored figure to
    // restore onto one, so the server answers RATES_MASKED for a collaborator
    // without RateGen. The button must not be a live button that can only
    // fail — it is disabled, and says why.
    render(
      <ProjectContractPanel
        {...baseProps}
        variationRows={rows}
        canEditProject
        canSeeRates={false}
        onRaiseVariation={vi.fn()}
      />,
    );
    openVariations();
    const add = screen.getByRole("button", { name: /Add variation/ });
    expect(add.disabled).toBe(true);
    expect(add.getAttribute("title")).toMatch(/Rates are hidden/i);
  });

  it("raises a variation as an addition or an omission, and refuses an empty one", async () => {
    const onRaise = vi.fn().mockResolvedValue({ index: 3 });
    render(
      <ProjectContractPanel
        {...baseProps}
        variationRows={rows}
        canEditProject
        onRaiseVariation={onRaise}
      />,
    );
    openVariations();
    fireEvent.click(screen.getByRole("button", { name: /Add variation/ }));

    // The modal's own submit button (the toolbar has one of the same name).
    const submit = () =>
      fireEvent.click(document.querySelector(".wk-modal-go"));

    // Nothing filled in: the form does not call the server.
    submit();
    expect(onRaise).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("What changed"), {
      target: { value: "Additional windows" },
    });
    fireEvent.change(screen.getByLabelText("Instruction reference"), {
      target: { value: "AI-013" },
    });
    fireEvent.change(screen.getByLabelText("Type"), {
      target: { value: "omission" },
    });
    fireEvent.change(screen.getByLabelText("Value (₦)"), {
      target: { value: "250000" },
    });
    submit();
    await Promise.resolve();
    expect(onRaise).toHaveBeenCalledWith({
      description: "Additional windows",
      reference: "AI-013",
      kind: "omission",
      amount: 250000,
    });
  });

  it("shows the empty state when there are no variations at all", () => {
    render(<ProjectContractPanel {...baseProps} variationRows={[]} />);
    openVariations();
    expect(screen.getByText("No variations yet")).toBeTruthy();
  });

  // Item 13. An empty screen has to answer three things: what it is for, why
  // it is empty, and the one action that fills it. The third is the one that
  // goes wrong — a first-run screen pointing at a control the reader has not
  // got is worse than saying nothing.
  it("names the action on the empty variations list, and only where it can be taken", () => {
    render(
      <ProjectContractPanel
        {...baseProps}
        variationRows={[]}
        canEditProject
        onRaiseVariation={vi.fn()}
      />,
    );
    openVariations();
    expect(screen.getByText("Add variation raises the first one.")).toBeTruthy();
  });

  it("tells a read-only viewer why the empty variations list has no action", () => {
    render(<ProjectContractPanel {...baseProps} variationRows={[]} />);
    openVariations();
    expect(screen.getByText(/reading this project rather than working on it/i)).toBeTruthy();
    expect(screen.queryByText("Add variation raises the first one.")).toBeNull();
  });

  it("does not point a closed final account at the issue button it has greyed out", () => {
    render(
      <ProjectContractPanel
        {...baseProps}
        certificates={[]}
        finalAccount={{ finalized: true, finalizedAt: "2026-09-01T00:00:00Z" }}
      />,
    );
    expect(screen.getByText("No certificates issued yet")).toBeTruthy();
    expect(screen.getByText(/The final account is closed, so no new certificate/i)).toBeTruthy();
  });

  it("names the issue action on an open project with no certificates", () => {
    render(<ProjectContractPanel {...baseProps} certificates={[]} />);
    expect(
      screen.getByText("Issue certificate makes IPC 01 against the current value to date."),
    ).toBeTruthy();
  });

  it("puts both readings on the final account, each labelled", () => {
    render(
      <ProjectContractPanel
        {...baseProps}
        variationRows={rows}
        measured={11_000_000}
        actualSpent={0}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Final account/ }));
    // 11,000,000 against a 10,000,000 contract sum → 1,000,000 over-run,
    // labelled as contract-value movement, beside the actual-vs-planned tile
    // (which reads "Over-run" too — hence both need their own sub-line).
    expect(screen.getAllByText("Over-run").length).toBe(2);
    expect(
      screen.getByText("Contract value movement, 10.0% of the contract"),
    ).toBeTruthy();
    expect(screen.getByText("₦1,000,000.00")).toBeTruthy();
    expect(screen.getByText("No spend recorded yet")).toBeTruthy();
    expect(screen.getByText("Close the final account")).toBeTruthy();
  });
});

// ── What actualSpent means ──────────────────────────────────────────────────
//
// ProjectsGeneric builds the earned figure as
//
//   fullValuedAmount = valuedAmount + provDoneAmount
//                    + prelimDoneAmountForOverview + variationsDoneAmount
//
// and passes it down. ProjectOpenView used to add the last three on again
// before handing it here as actualSpent, so every job with provisional sums,
// earned preliminaries or executed variations reported an over-run it had not
// had — the exact phantom over-run this panel's own comment says it removed.
//
// These pin the consumer end: actualSpent is the whole earned amount, and
// nothing here adds to it.
//
// The fixture is a real locked contract, percentages and all, because an
// inconsistent one (a contractSum that includes contingency and VAT beside
// contingency and tax props of 0) invents a saving all by itself.
const SUBTOTAL = 100_000_000;
const CONTINGENCY = 5_000_000; // 5% of the subtotal
const TAX = 7_875_000; // 7.5% of subtotal + contingency
const CONTRACT_SUM = SUBTOTAL + CONTINGENCY + TAX; // 112,875,000

const spendProps = {
  ...baseProps,
  contractSum: CONTRACT_SUM,
  measured: 85_000_000,
  provisional: 10_000_000,
  preliminary: 5_000_000,
  contingency: CONTINGENCY,
  tax: TAX,
  contingencyPercent: 5,
  taxPercent: 7.5,
  variations: 0,
  variationRows: [],
};

describe("actual spend against the planned budget", () => {
  afterEach(cleanup);

  it("does not report an over-run when spend is inside the planned budget", () => {
    render(<ProjectContractPanel {...spendProps} actualSpent={75_000_000} />);
    openFinalAccount();
    expect(screen.getByText("Forecast savings vs budget")).toBeTruthy();
    // Planned is the full cascade, 112,875,000, so 37,875,000 is still to spend.
    expect(screen.getByText("₦37,875,000.00")).toBeTruthy();
  });

  it("reports an over-run only once spend passes the planned budget", () => {
    render(<ProjectContractPanel {...spendProps} actualSpent={CONTRACT_SUM + 4_000_000} />);
    openFinalAccount();
    // The spend over-run and the contract movement are separate lines and can
    // both be labelled this, so assert the label is present rather than unique.
    expect(screen.getAllByText("Over-run").length).toBeGreaterThan(0);
    expect(screen.getByText("₦4,000,000.00")).toBeTruthy();
  });

  it("a live job measured exactly as contracted has not moved against it", () => {
    // The movement line asks a different question from the over-run: has the
    // contract VALUE shifted? With no variations and the quantities as
    // measured, it has not — and must not read as a saving.
    render(<ProjectContractPanel {...spendProps} actualSpent={50_000_000} />);
    openFinalAccount();
    expect(screen.getByText("On the contract sum")).toBeTruthy();
    expect(screen.queryByText("Saving")).toBe(null);
  });
});

// ── A finalized account measures against what a certificate can pay ────────
describe("the closed final account", () => {
  afterEach(cleanup);

  const finalized = (over = {}) => ({
    ...spendProps,
    finalAccount: {
      finalized: true,
      measuredWorkFinal: 85_000_000,
      provisionalFinal: 10_000_000,
      preliminaryFinal: 5_000_000,
      variationsFinal: 0,
      agreedContractSum: CONTRACT_SUM,
      agreedCertifiableSum: SUBTOTAL,
      contingencyAtLock: CONTINGENCY,
      taxAtLock: TAX,
      finalContractValue: SUBTOTAL,
      savings: 0,
      ...over,
    },
  });

  it("a job closed exactly as contracted shows no saving", () => {
    // THE BUG, on screen. finalContractValue carries neither contingency nor
    // VAT; contractSum carries both. Held against each other they reported
    // ₦12,875,000 saved on a job that came in exactly as measured.
    render(<ProjectContractPanel {...finalized()} />);
    openFinalAccount();
    expect(screen.getByText("On the contract sum")).toBeTruthy();
    expect(screen.queryByText("₦12,875,000.00")).toBe(null);
  });

  it("a real saving is still reported", () => {
    render(
      <ProjectContractPanel
        {...finalized({ finalContractValue: SUBTOTAL - 3_000_000, savings: 3_000_000 })}
      />,
    );
    openFinalAccount();
    expect(screen.getByText("Saving")).toBeTruthy();
    expect(screen.getAllByText("₦3,000,000.00").length).toBeGreaterThan(0);
  });

  it("a real over-run on the contract is still reported", () => {
    render(
      <ProjectContractPanel
        {...finalized({ finalContractValue: SUBTOTAL + 2_000_000, savings: -2_000_000 })}
      />,
    );
    openFinalAccount();
    expect(screen.getAllByText("Over-run").length).toBeGreaterThan(0);
    expect(screen.getAllByText("₦2,000,000.00").length).toBeGreaterThan(0);
  });

  it("an account closed before the baseline was stored derives it, not guesses", () => {
    // No agreedCertifiableSum and no at-lock amounts: the cascade is inverted
    // from the percentages, so an old closed account stops showing the phantom
    // saving the moment it is opened.
    const legacy = finalized();
    delete legacy.finalAccount.agreedCertifiableSum;
    delete legacy.finalAccount.contingencyAtLock;
    delete legacy.finalAccount.taxAtLock;
    render(<ProjectContractPanel {...legacy} />);
    openFinalAccount();
    expect(screen.getByText("On the contract sum")).toBeTruthy();
  });
});
