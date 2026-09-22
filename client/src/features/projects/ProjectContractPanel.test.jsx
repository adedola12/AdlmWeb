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
