import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const calls = [];
vi.mock("../../api.js", () => ({
  apiAuthed: vi.fn(async (path, opts) => {
    calls.push([path, opts?.body ? JSON.parse(opts.body) : null]);
    return { ok: true };
  }),
}));

const { CertClaim } = await import("./CertDialogs.jsx");
const { default: CertTicket } = await import("../LxCertTicket.jsx");

const cert = { sku: "bim-qs", ref: "CERT-8E12F4", title: "BIM for QS", issuedAt: "2026-09-01T00:00:00Z", finish: "dark" };

beforeEach(() => {
  calls.length = 0;
  cleanup();
});

describe("claiming a certificate (R14)", () => {
  it("takes the name, makes the holder confirm it, locks it, then saves the finish", async () => {
    const done = vi.fn();
    const { container, getByText, getByLabelText } = render(
      <MemoryRouter>
        <CertClaim cert={cert} name="Ada" locked={false} token="t" onDone={done} onClose={() => {}} />
      </MemoryRouter>,
    );

    // Step 1: a first name alone is refused, a full name goes through.
    fireEvent.click(getByText("Continue"));
    expect(container.querySelector(".cx-f .msg.bad").textContent).toMatch(/full name/);
    fireEvent.change(getByLabelText("Name on the certificate"), { target: { value: "  Adaeze   Obi " } });
    fireEvent.click(getByText("Continue"));

    // Step 2: the tidied name, large; nothing is saved until the box is ticked.
    expect(container.querySelector(".cx-big").textContent).toBe("Adaeze Obi");
    const confirm = getByText("Confirm the name");
    expect(confirm.disabled).toBe(true);
    fireEvent.click(container.querySelector(".cx-check input"));
    fireEvent.click(confirm);
    await waitFor(() => expect(getByText("Light or dark?")).toBeTruthy());
    expect(calls[0]).toEqual(["/me/certificate-name", { firstName: "Adaeze", lastName: "Obi" }]);

    // Step 3: the finish is a preference, saved against the enrolment.
    fireEvent.click(getByText("Light"));
    fireEvent.click(getByText("Show my certificate"));
    await waitFor(() => expect(done).toHaveBeenCalledWith({ name: "Adaeze Obi", finish: "light" }));
    expect(calls[1]).toEqual(["/me/courses/bim-qs/certificate-finish", { finish: "light" }]);
  });

  it("skips straight to the finish when the account's name is already confirmed", () => {
    const { getByText, queryByText } = render(
      <MemoryRouter>
        <CertClaim cert={cert} name="Adaeze Obi" locked token="t" onDone={() => {}} onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(getByText("Light or dark?")).toBeTruthy();
    expect(queryByText("Name on the certificate")).toBeNull();
  });

  it("prints the stored reference and a QR code for the public check", () => {
    const { container } = render(
      <MemoryRouter>
        <CertClaim cert={cert} name="Adaeze Obi" locked token="t" onDone={() => {}} onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(container.querySelector(".cx-sheet .rf").textContent).toBe("CERT-8E12F4");
    expect(container.querySelector(".cx-sheet .qrbox svg")).not.toBeNull();
  });
});

describe("the certificate card (R14)", () => {
  const row = { ...cert, certificateRef: cert.ref, completed: true, done: 4, total: 4, pending: 0 };

  it("asks for a claim before anything can be viewed or downloaded", () => {
    const open = vi.fn();
    const { getByText, queryByText } = render(<CertTicket row={row} certName="Adaeze Obi" claimed={false} onOpen={open} />);
    expect(getByText("Ready to claim")).toBeTruthy();
    expect(queryByText("Download")).toBeNull();
    fireEvent.click(getByText("Claim your certificate"));
    expect(open).toHaveBeenCalledWith(row, "claim");
  });

  it("offers View and Download once claimed, with the confirmed name", () => {
    const open = vi.fn();
    const { getByText } = render(<CertTicket row={row} certName="Adaeze Obi" claimed onOpen={open} />);
    expect(getByText("Adaeze Obi")).toBeTruthy();
    fireEvent.click(getByText("Download"));
    expect(open).toHaveBeenCalledWith(row, "download");
  });

  it("shows what is left on a course not finished", () => {
    const { getByText } = render(
      <CertTicket row={{ ...row, completed: false, certificateRef: "", done: 1 }} certName="" claimed={false} onOpen={() => {}} />,
    );
    expect(getByText("Not yet issued")).toBeTruthy();
    expect(getByText(/3 lessons/)).toBeTruthy();
  });
});
