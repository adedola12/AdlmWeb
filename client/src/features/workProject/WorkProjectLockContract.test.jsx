import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import WorkProjectLockContract from "./WorkProjectLockContract.jsx";

// Locking is once per job and irreversible without the PIN or the OTP, so the two
// things that matter are the gate and the authorisation. The PIN and the OTP are
// MUTUALLY EXCLUSIVE — requireStepUp passes through for anybody who never opted
// in, and the lock then wants a PIN; with step-up on the OTP is the authorisation
// and no PIN is asked for. Getting that branch wrong is silent in the worst
// direction: a PIN field shown to an OTP reader, and a lock refused for a PIN the
// server never wanted.

afterEach(cleanup);

const ready = (over = {}) => ({
  contract: {
    locked: false,
    tenderedAt: "2026-09-01T00:00:00.000Z",
    preliminaryPercent: 7.5,
    contingencyPercent: 5,
    taxPercent: 7.5,
  },
  items: [
    { code: "BQ-1", description: "Excavate", unit: "m3", qty: 100, rate: 5_000 },
    { code: "BQ-2", description: "Columns", unit: "m3", qty: 10, rate: 20_000 },
  ],
  provisionalSums: [],
  ...over,
});

const form = (project = ready(), props = {}) =>
  render(
    <WorkProjectLockContract project={project} onLock={vi.fn()} {...props} />,
  ).container;

describe("the gate", () => {
  it("shows the checklist, so the reader knows what is still wanted", () => {
    const c = form();
    expect(within(c).getByText("Every bill item is priced")).toBeTruthy();
    expect(within(c).getByText("The bill has gone to tender")).toBeTruthy();
  });

  it("will not lock while a check is failing, and says which", () => {
    const unpriced = ready({
      items: [{ code: "BQ-1", description: "Excavate", unit: "m3", qty: 100, rate: 0 }],
    });
    const c = form(unpriced, { stepUpEnabled: true });
    expect(within(c).getByText(/still needs a rate/)).toBeTruthy();
    expect(within(c).getByText("Lock the contract").disabled).toBe(true);
  });

  it("will not lock a bill that has not gone to tender", () => {
    const untendered = ready({ contract: { locked: false } });
    const c = form(untendered, { stepUpEnabled: true });
    expect(within(c).getByText("The bill has not gone to tender yet")).toBeTruthy();
    expect(within(c).getByText("Lock the contract").disabled).toBe(true);
  });
});

describe("what it says will be fixed", () => {
  it("quotes the measured work and the provisional sums, not a contract sum", () => {
    // The server takes the snapshot itself, against the resolved scope, and applies
    // the percentages. A figure computed here would be a second opinion about the
    // number a contract is signed for — and it WOULD differ, because totalsFor
    // includes approved variations and the lock snapshot does not.
    const c = form();
    expect(within(c).getByText("₦700,000")).toBeTruthy();
    expect(within(c).getByText(/is the base, not the sum/)).toBeTruthy();
  });

  it("names the percentages that go on top", () => {
    const c = form();
    expect(within(c).getByText(/7.5%/)).toBeTruthy();
    expect(within(c).getByText(/5%/)).toBeTruthy();
  });
});

describe("authorising it", () => {
  it("asks for a PIN when step-up is OFF", () => {
    const c = form(ready(), { stepUpEnabled: false });
    expect(within(c).getByLabelText("Four digits")).toBeTruthy();
    expect(within(c).queryByText(/code emailed to you/)).toBe(null);
  });

  it("asks for NO PIN when step-up is on, because the OTP is the authorisation", () => {
    const c = form(ready(), { stepUpEnabled: true });
    expect(within(c).queryByLabelText("Four digits")).toBe(null);
    expect(within(c).getByText(/code emailed to you/)).toBeTruthy();
    // And it can be locked straight away — there is nothing else to fill in.
    expect(within(c).getByText("Lock the contract").disabled).toBe(false);
  });

  it("holds the lock until the PIN is four digits", () => {
    const c = form(ready(), { stepUpEnabled: false });
    expect(within(c).getByText(/Set a four-digit PIN/)).toBeTruthy();
    expect(within(c).getByText("Lock the contract").disabled).toBe(true);

    fireEvent.change(within(c).getByLabelText("Four digits"), { target: { value: "12a" } });
    expect(within(c).getByText("The PIN is four digits, numbers only.")).toBeTruthy();
    expect(within(c).getByText("Lock the contract").disabled).toBe(true);

    fireEvent.change(within(c).getByLabelText("Four digits"), { target: { value: "1234" } });
    expect(within(c).getByText("Lock the contract").disabled).toBe(false);
  });

  it("sends the PIN when there is one", async () => {
    const onLock = vi.fn().mockResolvedValue({});
    const c = form(ready(), { stepUpEnabled: false, onLock });
    fireEvent.change(within(c).getByLabelText("Four digits"), { target: { value: "1234" } });
    fireEvent.click(within(c).getByText("Lock the contract"));
    await waitFor(() => expect(onLock).toHaveBeenCalledWith("1234"));
  });

  it("sends NO pin when the OTP is the authorisation", async () => {
    const onLock = vi.fn().mockResolvedValue({});
    const c = form(ready(), { stepUpEnabled: true, onLock });
    fireEvent.click(within(c).getByText("Lock the contract"));
    await waitFor(() => expect(onLock).toHaveBeenCalledWith(""));
  });

  it("does not keep the PIN box visible once it is typed in", () => {
    // type=password, because it is a credential that unlocks a contract.
    const c = form(ready(), { stepUpEnabled: false });
    expect(within(c).getByLabelText("Four digits").getAttribute("type")).toBe("password");
  });
});

describe("when it does not work", () => {
  it("keeps the server's refusal on screen and stays open", async () => {
    const onDone = vi.fn();
    const onLock = vi.fn().mockRejectedValue(new Error("A 4-digit PIN is required to lock."));
    const c = form(ready(), { stepUpEnabled: false, onLock, onDone });
    fireEvent.change(within(c).getByLabelText("Four digits"), { target: { value: "1234" } });
    fireEvent.click(within(c).getByText("Lock the contract"));
    await waitFor(() =>
      expect(within(c).getByText("A 4-digit PIN is required to lock.")).toBeTruthy(),
    );
    expect(onDone).not.toHaveBeenCalled();
  });

  it("says NOTHING when the reader cancelled the code prompt", async () => {
    // A dismissed OTP is a deliberate back-out. An error line for somebody who
    // pressed cancel is the product arguing with them.
    const onLock = vi.fn().mockRejectedValue(new Error("Verification cancelled"));
    const c = form(ready(), { stepUpEnabled: true, onLock });
    fireEvent.click(within(c).getByText("Lock the contract"));
    await waitFor(() => expect(onLock).toHaveBeenCalled());
    expect(within(c).queryByText("Verification cancelled")).toBe(null);
    expect(c.querySelector(".pn-bad")).toBe(null);
  });

  it("closes once the contract is locked", async () => {
    const onDone = vi.fn();
    const c = form(ready(), { stepUpEnabled: true, onLock: vi.fn().mockResolvedValue({}), onDone });
    fireEvent.click(within(c).getByText("Lock the contract"));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("does not throw before the project has loaded", () => {
    expect(() =>
      render(<WorkProjectLockContract project={null} onLock={vi.fn()} />),
    ).not.toThrow();
  });
});
