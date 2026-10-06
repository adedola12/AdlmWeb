import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import WorkProjectIssueCert from "./WorkProjectIssueCert.jsx";

// certificateDraft.test.js pins the rules. These pin what the form does with
// them — and the one state that matters most: when the server refuses, its own
// words have to stay on screen, because "Final account is finalized. Reopen it
// before issuing new certificates." is an instruction and nothing else says it.

afterEach(cleanup);

const job = (over = {}) => ({
  contract: { locked: true, contractSum: 80_000_000 },
  valuationSettings: { retentionPct: 5, vatPct: 7.5, withholdingPct: 2.5 },
  certificates: [],
  items: [],
  ...over,
});

const form = (project = job(), props = {}) =>
  render(<WorkProjectIssueCert project={project} onIssue={vi.fn()} {...props} />).container;

describe("the certificate form", () => {
  it("asks the four things only a person knows", () => {
    const c = form();
    expect(within(c).getByLabelText("Period from")).toBeTruthy();
    expect(within(c).getByLabelText("Period to")).toBeTruthy();
    expect(within(c).getByLabelText("Release")).toBeTruthy();
    expect(within(c).getByLabelText("Printed on the certificate")).toBeTruthy();
  });

  it("says which certificate this will be, from the ones already issued", () => {
    // max + 1 is the server's rule; the form only has to agree with it on screen.
    const c = form(job({ certificates: [{ number: 1 }, { number: 3 }] }));
    expect(within(c).getByText("Interim certificate 4")).toBeTruthy();
    expect(within(c).getByText("Issue certificate 4")).toBeTruthy();
  });

  it("starts at 1 on a contract with none", () => {
    expect(within(form()).getByText("Interim certificate 1")).toBeTruthy();
  });

  it("says how much retention is held, so a release has a ceiling in view", () => {
    const c = form(
      job({
        certificates: [
          { number: 1, retentionAmount: 1_000_000 },
          { number: 2, retentionAmount: 1_000_000, retentionReleased: 400_000 },
        ],
      }),
    );
    expect(within(c).getByText(/1,600,000 held/)).toBeTruthy();
  });

  it("posts only what was filled in", async () => {
    const onIssue = vi.fn().mockResolvedValue({});
    const c = form(job(), { onIssue });
    fireEvent.change(within(c).getByLabelText("Period from"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.change(within(c).getByLabelText("Period to"), { target: { value: "2026-09-30" } });
    fireEvent.click(within(c).getByText("Issue certificate 1"));
    await waitFor(() => expect(onIssue).toHaveBeenCalled());
    expect(onIssue.mock.calls[0][0]).toEqual({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
    });
  });

  it("closes itself once the certificate exists", async () => {
    const onDone = vi.fn();
    const c = form(job(), { onIssue: vi.fn().mockResolvedValue({}), onDone });
    fireEvent.click(within(c).getByText("Issue certificate 1"));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("does NOT close when the server refused — the message would go with it", async () => {
    const onDone = vi.fn();
    const onIssue = vi
      .fn()
      .mockRejectedValue(
        new Error("Final account is finalized. Reopen it before issuing new certificates."),
      );
    const c = form(job(), { onIssue, onDone });
    fireEvent.click(within(c).getByText("Issue certificate 1"));
    await waitFor(() =>
      expect(
        within(c).getByText(
          "Final account is finalized. Reopen it before issuing new certificates.",
        ),
      ).toBeTruthy(),
    );
    expect(onDone).not.toHaveBeenCalled();
  });

  it("refuses to issue while the form is wrong, and says why", () => {
    // The DISABLED STATE is what does the work here, so that is what is asserted.
    // Clicking a disabled button fires nothing, so a click-and-expect-not-called
    // test would pass whether the guard existed or not — which it did, until this
    // was sabotage-tested and sailed through.
    const onIssue = vi.fn();
    const c = form(job(), { onIssue });
    fireEvent.change(within(c).getByLabelText("Period from"), {
      target: { value: "2026-09-30" },
    });
    fireEvent.change(within(c).getByLabelText("Period to"), { target: { value: "2026-09-01" } });
    expect(within(c).getByText("The period cannot end before it starts.")).toBeTruthy();
    const button = within(c).getByText("Issue certificate 1");
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onIssue).not.toHaveBeenCalled();
  });

  it("enables the button again once the form is put right", () => {
    // The other half: a disabled button that never comes back is the same bug
    // from the other side.
    const c = form();
    const button = within(c).getByText("Issue certificate 1");
    expect(button.disabled).toBe(false);
    fireEvent.change(within(c).getByLabelText("Period from"), {
      target: { value: "2026-09-30" },
    });
    fireEvent.change(within(c).getByLabelText("Period to"), { target: { value: "2026-09-01" } });
    expect(within(c).getByText("Issue certificate 1").disabled).toBe(true);
    fireEvent.change(within(c).getByLabelText("Period to"), { target: { value: "2026-10-31" } });
    expect(within(c).getByText("Issue certificate 1").disabled).toBe(false);
    expect(within(c).queryByText("The period cannot end before it starts.")).toBe(null);
  });

  it("will not release more retention than is held", async () => {
    const onIssue = vi.fn();
    const c = form(job({ certificates: [{ number: 1, retentionAmount: 1_000_000 }] }), { onIssue });
    fireEvent.change(within(c).getByLabelText(/Release/), { target: { value: "2000000" } });
    expect(within(c).getByText(/more than has been retained/)).toBeTruthy();
    // IPC 1 is already issued, so this one is 2.
    expect(within(c).getByText("Issue certificate 2").disabled).toBe(true);
    fireEvent.click(within(c).getByText("Issue certificate 2"));
    expect(onIssue).not.toHaveBeenCalled();
  });

  it("says it is a draft, because it is", () => {
    // The server stores status "draft" unless the body asks for approved or paid,
    // and this form never asks. Approving is PUT .../certificates/:number.
    expect(within(form()).getByText(/issued as a draft/)).toBeTruthy();
  });

  it("does not throw before the project has loaded", () => {
    expect(() => render(<WorkProjectIssueCert project={null} onIssue={vi.fn()} />)).not.toThrow();
  });
});
