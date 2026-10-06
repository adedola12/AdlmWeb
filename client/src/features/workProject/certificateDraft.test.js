import { describe, it, expect } from "vitest";
import {
  blankCertDraft,
  certBodyFrom,
  certDraftProblem,
  retentionHeld,
  withIssuedCertificate,
} from "./certificateDraft.js";

// Issuing a certificate is the highest-cadence money act a QS performs and it
// could not be done in the new build at all. These pin the two things the form
// has to get right, both of which were got wrong once already on the classic
// panel: ask for the period, and send only what was actually filled in.

describe("what gets sent", () => {
  it("sends nothing at all from an untouched form", () => {
    // The server then dates it today, leaves the period unset and computes every
    // figure from the project. That is a valid certificate, just a silent one.
    expect(certBodyFrom(blankCertDraft())).toEqual({});
  });

  it("never sends a figure the server works out for itself", () => {
    // No number, no cumulativeValue, no percentages. The number is max + 1 on the
    // server and must stay there: two people issuing at once would otherwise both
    // believe they issued IPC 4.
    const body = certBodyFrom({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      retentionReleased: "500000",
      notes: "Practical completion of Block A",
    });
    expect(Object.keys(body).sort()).toEqual([
      "notes",
      "periodEnd",
      "periodStart",
      "retentionReleased",
    ]);
  });

  it("sends the period as typed", () => {
    const body = certBodyFrom({ periodStart: "2026-09-01", periodEnd: "2026-09-30" });
    expect(body.periodStart).toBe("2026-09-01");
    expect(body.periodEnd).toBe("2026-09-30");
  });

  it("LEAVES OUT an empty date rather than sending an empty string", () => {
    // "" is stored as an invalid date rather than left unset, which is how every
    // certificate the classic panel issued came to carry periodStart: null and
    // print "Period – to <issue date>".
    const body = certBodyFrom({ periodStart: "", periodEnd: "2026-09-30" });
    expect("periodStart" in body).toBe(false);
    expect(body.periodEnd).toBe("2026-09-30");
  });

  it("leaves out a release of nothing, which is not a release of 0", () => {
    expect("retentionReleased" in certBodyFrom({ retentionReleased: "" })).toBe(false);
    expect("retentionReleased" in certBodyFrom({ retentionReleased: "0" })).toBe(false);
    expect(certBodyFrom({ retentionReleased: "500000" }).retentionReleased).toBe(500_000);
  });

  it("leaves out notes that are only whitespace", () => {
    expect("notes" in certBodyFrom({ notes: "   " })).toBe(false);
    expect(certBodyFrom({ notes: "  seen on site  " }).notes).toBe("seen on site");
  });

  it("trims notes to the length the server stores", () => {
    expect(certBodyFrom({ notes: "x".repeat(3000) }).notes.length).toBe(2000);
  });

  it("does not throw on a draft that is not there", () => {
    expect(certBodyFrom(null)).toEqual({});
    expect(certBodyFrom(undefined)).toEqual({});
  });
});

describe("why it cannot be issued yet", () => {
  const ok = blankCertDraft();

  it("lets a blank form through", () => {
    expect(certDraftProblem(ok)).toBe("");
  });

  it("refuses a period that ends before it starts", () => {
    expect(
      certDraftProblem({ ...ok, periodStart: "2026-09-30", periodEnd: "2026-09-01" }),
    ).toMatch(/cannot end before it starts/);
  });

  it("accepts a period of one day", () => {
    expect(
      certDraftProblem({ ...ok, periodStart: "2026-09-01", periodEnd: "2026-09-01" }),
    ).toBe("");
  });

  it("refuses a negative release", () => {
    expect(certDraftProblem({ ...ok, retentionReleased: "-1" })).toMatch(/cannot be negative/);
  });

  it("refuses releasing more than has been retained", () => {
    // It would pay out money that was never withheld.
    expect(
      certDraftProblem({ ...ok, retentionReleased: "3000000" }, { totalRetained: 2_000_000 }),
    ).toMatch(/more than has been retained/);
  });

  it("allows releasing exactly what is held", () => {
    // Practical completion: half the retention comes back, and at final account
    // the rest does. Refusing the exact figure would make the last release
    // impossible.
    expect(
      certDraftProblem({ ...ok, retentionReleased: "2000000" }, { totalRetained: 2_000_000 }),
    ).toBe("");
  });

  it("REFUSES a release when nothing has been retained, and says that", () => {
    // This test used to assert the opposite, on two premises that were both wrong:
    // that 0 might mean "we have not been told" (the form only renders off a
    // loaded project, whose certificates is an array from the server), and that
    // "the server is the backstop either way" (issueCertificate reads
    // safeNum(req.body.retentionReleased) at projects.js:5064 with no ceiling
    // anywhere, and adds it back before tax). So the check was switched off in the
    // one case it was written for — a first certificate, where a mis-key does the
    // most damage — and nothing behind it would have caught the result.
    expect(certDraftProblem({ ...ok, retentionReleased: "500000" }, { totalRetained: 0 })).toMatch(
      /Nothing has been retained/,
    );
  });

  it("says which of the two it is, because the fix differs", () => {
    // "more than has been retained" tells a QS to lower the figure. "nothing has
    // been retained yet" tells them this is not the certificate for it.
    expect(
      certDraftProblem({ ...ok, retentionReleased: "3000000" }, { totalRetained: 2_000_000 }),
    ).toMatch(/more than has been retained/);
    expect(certDraftProblem({ ...ok, retentionReleased: "1" }, { totalRetained: 0 })).toMatch(
      /Nothing has been retained/,
    );
  });

  it("complains about one thing at a time, most basic first", () => {
    const both = { periodStart: "2026-09-30", periodEnd: "2026-09-01", retentionReleased: "-1" };
    expect(certDraftProblem(both)).toMatch(/cannot end before it starts/);
  });
});

describe("what is still held back", () => {
  it("sums retained less released across every certificate", () => {
    expect(
      retentionHeld([
        { retentionAmount: 1_000_000 },
        { retentionAmount: 1_000_000, retentionReleased: 400_000 },
      ]),
    ).toBe(1_600_000);
  });

  it("never goes below zero", () => {
    // A release that over-ran in the past is not a debt the next certificate owes.
    expect(retentionHeld([{ retentionAmount: 100, retentionReleased: 500 }])).toBe(0);
  });

  it("reads a missing or odd figure as nothing rather than NaN", () => {
    expect(retentionHeld([{}, { retentionAmount: "x" }, null])).toBe(0);
    expect(retentionHeld(null)).toBe(0);
    expect(retentionHeld([])).toBe(0);
  });
});

describe("folding a newly issued certificate into the project", () => {
  // POST .../certificates answers with { ok, certificate, version } and NOT the
  // project. Both of these were wrong the first time this was wired: the tab kept
  // saying "No valuations yet", and the version went stale.
  const project = (over = {}) => ({ _id: "p1", version: 7, certificates: [], items: [], ...over });
  const answer = { ok: true, certificate: { number: 1, netPayable: 1_000_000 }, version: 8 };

  it("appends the certificate the server returned", () => {
    const out = withIssuedCertificate(project(), answer);
    expect(out.certificates).toHaveLength(1);
    expect(out.certificates[0].number).toBe(1);
  });

  it("keeps the ones already there, in order", () => {
    const out = withIssuedCertificate(project({ certificates: [{ number: 1 }, { number: 2 }] }), {
      ...answer,
      certificate: { number: 3 },
    });
    expect(out.certificates.map((c) => c.number)).toEqual([1, 2, 3]);
  });

  it("MOVES THE VERSION ON, because the next save is checked against it", () => {
    // saveProjectPatch sends project.version as baseVersion. Left at 7, the next
    // edit to the bill is a write against a version the server has moved past.
    expect(withIssuedCertificate(project(), answer).version).toBe(8);
  });

  it("keeps the version it had when the server did not say", () => {
    expect(withIssuedCertificate(project(), { certificate: { number: 1 } }).version).toBe(7);
    expect(
      withIssuedCertificate(project(), { certificate: { number: 1 }, version: "x" }).version,
    ).toBe(7);
  });

  it("takes the certificate as returned, masked figures and all", () => {
    // A reader who may edit but not see rates gets a masked copy back, and that
    // masked copy is what this client should hold — rebuilding it from the form
    // would invent figures the reader is not allowed.
    const masked = { number: 1, netPayable: 0, _ratesMasked: true };
    expect(withIssuedCertificate(project(), { certificate: masked, version: 8 }).certificates[0])
      .toEqual(masked);
  });

  it("changes nothing else about the project", () => {
    const p = project({ name: "Ikoyi", items: [{ code: "BQ-1" }] });
    const out = withIssuedCertificate(p, answer);
    expect(out.name).toBe("Ikoyi");
    expect(out.items).toBe(p.items);
    expect(out._id).toBe("p1");
  });

  it("hands back the project untouched when there is nothing to fold in", () => {
    // So a caller can pass it straight to a state setter.
    const p = project();
    expect(withIssuedCertificate(p, { ok: true })).toBe(p);
    expect(withIssuedCertificate(p, null)).toBe(p);
    expect(withIssuedCertificate(null, answer)).toBe(null);
  });
});
