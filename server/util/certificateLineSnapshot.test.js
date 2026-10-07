// server/util/certificateLineSnapshot.test.js
//
// The per-line snapshot a certificate now carries, which is the answer to the
// owner's question: on the 4 June certificate the line shows 60%, and on the
// 5 July one it shows the balance — for ever, whatever the line does afterwards.
//
// Two things made that impossible before. A certificate stored two integers about
// its lines and nothing else; and percentComplete is one current value, so a line
// certified at 60% in June reads 100% in July and June's certificate could never
// be reprinted as June saw it.
//
// THE RULE THESE TESTS PROTECT: a line's previous position comes from the PREVIOUS
// CERTIFICATE'S OWN ROWS, never from the project. Asking the project what last
// month looked like gets this month's answer, which is the whole mistake the
// snapshot exists to end.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  certificateLineSnapshot,
  earnedLineValue,
  previousSnapshotLines,
} from "./certificateMaths.js";

/** The caller's valuationFactor, copied verbatim from routes/projects.js. */
const factorFor = (it) => {
  if (Boolean(it?.completed)) return 1;
  const pct = Number(it?.percentComplete);
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, pct)) / 100;
};

/** The caller's itemIdentity, reduced to the parts these fixtures use. */
const identityFor = (it, i) =>
  [Number(it?.sn) || i + 1, String(it?.code || "").toLowerCase(), String(it?.description || "").toLowerCase()].join("::");

const line = (over = {}) => ({
  sn: 1,
  code: "BQ-1",
  description: "Mass concrete",
  unit: "m3",
  qty: 100,
  rate: 1000,
  percentComplete: 0,
  completed: false,
  ...over,
});

const snap = (items, previousLines = []) =>
  certificateLineSnapshot({ items, factorFor, previousLines, identityFor });

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, `${msg}: ${a} vs ${b}`);

/* ── the owner's scenario ───────────────────────────────────────────────── */

test("4 June certifies 60% of the line, and says so", () => {
  const june = snap([line({ percentComplete: 60 })]);
  assert.equal(june.lines.length, 1);
  const l = june.lines[0];
  assert.equal(l.percentComplete, 60);
  near(l.earned, 60_000, "cumulative on the line");
  near(l.earnedThisPeriod, 60_000, "and all of it is this period's, being the first");
});

test("5 July certifies the BALANCE, not the whole line again", () => {
  const june = snap([line({ percentComplete: 60 })]);
  const july = snap([line({ percentComplete: 100, completed: true })], june.lines);
  const l = july.lines[0];
  assert.equal(l.percentComplete, 100);
  near(l.earned, 100_000, "cumulative is the whole line");
  near(l.earnedThisPeriod, 40_000, "but this period earned only the 40% balance");
});

test("the two periods sum to the line, which is the point of the breakdown", () => {
  const june = snap([line({ percentComplete: 60 })]);
  const july = snap([line({ percentComplete: 100, completed: true })], june.lines);
  near(
    june.lines[0].earnedThisPeriod + july.lines[0].earnedThisPeriod,
    100_000,
    "the parts add to the whole",
  );
});

test("JUNE'S ROW IS UNTOUCHED BY WHAT JULY DOES, which is the whole purpose", () => {
  // The snapshot is a value, not a view. Nothing recomputes it.
  const june = snap([line({ percentComplete: 60 })]);
  const frozen = JSON.parse(JSON.stringify(june.lines));
  snap([line({ percentComplete: 100, completed: true })], june.lines);
  assert.deepEqual(june.lines, frozen, "issuing July changed nothing about June");
});

/* ── the previous position must come from the certificate, not the project ─ */

test("the previous position is read from the previous certificate's rows", () => {
  // Hand it a previous row that disagrees with anything the project could say, and
  // it must still be what gets subtracted.
  const previous = [{ itemKey: identityFor(line(), 0), earned: 25_000 }];
  const now = snap([line({ percentComplete: 100, completed: true })], previous);
  near(now.lines[0].earnedThisPeriod, 75_000, "100,000 less the 25,000 the record holds");
});

test("it says when there is no previous snapshot to subtract", () => {
  // Certificates issued before snapshots existed carry no rows. The figures are
  // then cumulative, not per-period, and a reader must not be left assuming they
  // reconcile.
  const fresh = snap([line({ percentComplete: 60 })]);
  assert.equal(fresh.basis, "no-previous-snapshot");
  const second = snap([line({ percentComplete: 100 })], fresh.lines);
  assert.equal(second.basis, "previous-certificate");
});

test("a legacy certificate's successor reads cumulative, and admits it", () => {
  const legacy = []; // what an old certificate carries
  const now = snap([line({ percentComplete: 100, completed: true })], legacy);
  assert.equal(now.basis, "no-previous-snapshot");
  near(now.lines[0].earnedThisPeriod, 100_000, "nothing to subtract, so it is the full figure");
});

/* ── actuals: the money's real terms ───────────────────────────────────── */

test("the snapshot records the figures the MONEY was worked out at", () => {
  // earnedLineValue takes qty and rate from the actuals when they exist, so storing
  // the contract figures would leave the same hole one level down.
  const s = snap([line({ percentComplete: 100, completed: true, actualQty: 110, actualRate: 1200 })]);
  const l = s.lines[0];
  assert.equal(l.qty, 110, "the measured quantity");
  assert.equal(l.rate, 1200, "the rate paid");
  assert.equal(l.fromActuals, true, "and it is marked as measured rather than contract");
  near(l.earned, 110 * 1200, "the money follows those two");
});

test("a line certified at its contract figures is not marked as measured", () => {
  const s = snap([line({ percentComplete: 60 })]);
  assert.equal(s.lines[0].fromActuals, false);
  assert.equal(s.lines[0].rate, 1000);
});

test("A JULY RE-MEASURE CANNOT RESTATE WHAT JUNE EARNED", () => {
  // The question behind "is the actual value captured at their individual
  // valuation". June's row holds June's rate; July's holds July's.
  const june = snap([line({ percentComplete: 60 })]);
  const july = snap([line({ percentComplete: 100, completed: true, actualRate: 1200 })], june.lines);
  assert.equal(june.lines[0].rate, 1000, "June still says 1,000");
  assert.equal(july.lines[0].rate, 1200, "July says 1,200");
  near(june.lines[0].earned, 60_000, "and June's money is still June's");
  // July's period picks up the balance AND the re-rate of the June portion, which
  // is what the certificate total does too.
  near(july.lines[0].earnedThisPeriod, 60_000, "48,000 of new work plus 12,000 of re-rate");
});

/* ── edges ─────────────────────────────────────────────────────────────── */

test("a line that has earned nothing is not on the certificate", () => {
  const s = snap([line({ percentComplete: 0 }), line({ sn: 2, code: "BQ-2", percentComplete: 40 })]);
  assert.equal(s.lines.length, 1);
  assert.equal(s.lines[0].sn, 2);
});

test("a line that has gone BACKWARDS is on it, because that is what is being recovered", () => {
  const june = snap([line({ percentComplete: 60 })]);
  const july = snap([line({ percentComplete: 40 })], june.lines);
  assert.equal(july.lines.length, 1, "the line is still on the certificate");
  near(july.lines[0].earnedThisPeriod, -20_000, "as a negative movement");
});

test("a line reverted to nothing still appears, so the recovery is explained", () => {
  const june = snap([line({ percentComplete: 60 })]);
  const july = snap([line({ percentComplete: 0 })], june.lines);
  assert.equal(july.lines.length, 1, "earned 0 now, but 60,000 before, so it is on the certificate");
  near(july.lines[0].earnedThisPeriod, -60_000, "recovering the whole of it");
});

test("a ratified line is read at 100% whatever its percentage says", () => {
  // valuationFactor returns 1 for a ratified line, and the snapshot takes the
  // factor rather than the raw field, so the two cannot disagree.
  const s = snap([line({ percentComplete: 0, completed: true })]);
  assert.equal(s.lines[0].percentComplete, 100);
  near(s.lines[0].earned, 100_000, "the whole line");
});

test("every line's earned figure equals earnedLineValue, by construction", () => {
  // If these ever diverge, the certificate's own total and its breakdown are
  // computed two different ways and will disagree.
  const items = [
    line({ percentComplete: 35 }),
    line({ sn: 2, code: "BQ-2", description: "Columns", qty: 10, rate: 20_000, percentComplete: 100, completed: true }),
    line({ sn: 3, code: "BQ-3", description: "Rebar", qty: 500, rate: 900, percentComplete: 80, actualRate: 950 }),
  ];
  for (const l of snap(items).lines) {
    const src = items.find((i) => (Number(i.sn) || 0) === l.sn);
    near(l.earned, earnedLineValue(src, factorFor(src) * 100), `line ${l.sn}`);
  }
});

test("it does not throw on nothing at all", () => {
  assert.deepEqual(certificateLineSnapshot().lines, []);
  assert.deepEqual(snap([]).lines, []);
  assert.deepEqual(snap(null).lines, []);
});

test("a bill with no identities still produces rows", () => {
  // itemIdentity falls back to the index, so a code-less bill is not silently
  // dropped from its own certificate.
  const s = certificateLineSnapshot({
    items: [{ description: "No code", qty: 5, rate: 100, percentComplete: 100 }],
    factorFor,
    identityFor,
  });
  assert.equal(s.lines.length, 1);
  near(s.lines[0].earned, 500, "and is valued normally");
});

/* ── which previous certificate the period is measured against ─────────── */

test("the previous rows come from the HIGHEST-NUMBERED certificate, not the last stored", () => {
  // A recovery certificate can be inserted, so array order is not certificate
  // order. Taking the last element would subtract from the wrong period and put
  // every line's "this period" figure out by one certificate.
  const certs = [
    { number: 1, lines: [{ itemKey: "k", earned: 20_000 }] },
    { number: 3, lines: [{ itemKey: "k", earned: 90_000 }] },
    { number: 2, lines: [{ itemKey: "k", earned: 60_000 }] },
  ];
  assert.equal(previousSnapshotLines(certs)[0].earned, 90_000);
});

test("certificates with no snapshot are skipped, not treated as zero", () => {
  // The last certificate issued may predate snapshots while an earlier one does
  // not. Reaching past it finds a real position instead of subtracting nothing.
  const certs = [
    { number: 1, lines: [{ itemKey: "k", earned: 60_000 }] },
    { number: 2 },
    { number: 3, lines: [] },
  ];
  assert.equal(previousSnapshotLines(certs)[0].earned, 60_000);
});

test("no previous snapshot at all gives an empty list", () => {
  assert.deepEqual(previousSnapshotLines([{ number: 1 }, { number: 2, lines: [] }]), []);
  assert.deepEqual(previousSnapshotLines([]), []);
  assert.deepEqual(previousSnapshotLines(), []);
  assert.deepEqual(previousSnapshotLines(null), []);
});

test("an unnumbered certificate does not outrank a numbered one", () => {
  const certs = [
    { number: 2, lines: [{ itemKey: "k", earned: 60_000 }] },
    { lines: [{ itemKey: "k", earned: 1 }] },
  ];
  assert.equal(previousSnapshotLines(certs)[0].earned, 60_000);
});

test("THE 4 JUNE / 5 JULY CHAIN, end to end through the selection", () => {
  // What issueCertificate does, twice, with the real helper picking the previous
  // rows both times.
  const certs = [];
  const item = (pct) => [line({ percentComplete: pct, completed: pct >= 100 })];

  const june = snap(item(60), previousSnapshotLines(certs));
  certs.push({ number: 1, lines: june.lines });

  const july = snap(item(100), previousSnapshotLines(certs));
  certs.push({ number: 2, lines: july.lines });

  near(certs[0].lines[0].earnedThisPeriod, 60_000, "4 June paid 60% of the line");
  near(certs[1].lines[0].earnedThisPeriod, 40_000, "5 July paid the balance");
  assert.equal(certs[0].lines[0].percentComplete, 60, "and June still reads 60%");
  assert.equal(certs[1].lines[0].percentComplete, 100);
  near(
    certs[0].lines[0].earnedThisPeriod + certs[1].lines[0].earnedThisPeriod,
    100_000,
    "the two certificates account for the whole line and nothing more",
  );
});

/* ── only movement is stored, and positions merge across certificates ──── */

test("A LINE THAT DID NOT MOVE IS NOT ON THE CERTIFICATE", () => {
  // A certificate is a claim for a period. A line standing at the same 60% it
  // stood at last month is not part of this claim.
  const june = snap([line({ percentComplete: 60 })]);
  const july = snap([line({ percentComplete: 60 })], june.lines);
  assert.equal(july.lines.length, 0);
});

test("the snapshot's size follows WORK DONE, not bill size", () => {
  // The reason the above matters beyond tidiness. A row is ~284 bytes; a row per
  // bill line per certificate puts a 2,000-line bill with three years of monthly
  // certificates past MongoDB's 16MB document limit and the project stops saving.
  const bill = Array.from({ length: 2000 }, (_, i) =>
    line({ sn: i + 1, code: `BQ-${i + 1}`, percentComplete: 50 }),
  );
  const first = snap(bill);
  assert.equal(first.lines.length, 2000, "the first certificate does cover every line");

  const moved = bill.map((l, i) => (i === 7 ? { ...l, percentComplete: 75 } : l));
  const second = snap(moved, first.lines);
  assert.equal(second.lines.length, 1, "the second covers the one line that moved");
  assert.equal(second.lines[0].sn, 8);
});

test("AN UNTOUCHED LINE KEEPS ITS POSITION ACROSS A GAP, or it is paid for twice", () => {
  // June certifies line A. July certifies only line B, so A is absent from July's
  // snapshot. August moves A again — and must subtract June's 60,000, not zero.
  const a = (pct) => line({ sn: 1, code: "BQ-1", percentComplete: pct });
  const b = (pct) => line({ sn: 2, code: "BQ-2", description: "Blockwork", percentComplete: pct });
  const certs = [];

  const june = snap([a(60), b(0)], previousSnapshotLines(certs));
  certs.push({ number: 1, lines: june.lines });
  assert.deepEqual(june.lines.map((l) => l.sn), [1], "only A moved in June");

  const july = snap([a(60), b(30)], previousSnapshotLines(certs));
  certs.push({ number: 2, lines: july.lines });
  assert.deepEqual(july.lines.map((l) => l.sn), [2], "only B moved in July");

  const august = snap([a(100), b(30)], previousSnapshotLines(certs));
  const rowA = august.lines.find((l) => l.sn === 1);
  assert.ok(rowA, "A is back on the certificate");
  near(rowA.earnedThisPeriod, 40_000, "the balance, NOT the whole 100,000 again");
});

test("the merged position is each line's most recent, per line", () => {
  const certs = [
    { number: 1, lines: [{ itemKey: "a", earned: 10 }, { itemKey: "b", earned: 20 }] },
    { number: 3, lines: [{ itemKey: "a", earned: 70 }] },
    { number: 2, lines: [{ itemKey: "b", earned: 50 }] },
  ];
  const merged = previousSnapshotLines(certs);
  const by = new Map(merged.map((r) => [r.itemKey, r.earned]));
  assert.equal(by.get("a"), 70, "A's newest is certificate 3");
  assert.equal(by.get("b"), 50, "B's newest is certificate 2");
  assert.equal(merged.length, 2, "and each line appears once");
});

test("three certificates still account for the line exactly once", () => {
  const certs = [];
  for (const pct of [30, 30, 60, 100]) {
    const s = snap([line({ percentComplete: pct, completed: pct >= 100 })], previousSnapshotLines(certs));
    certs.push({ number: certs.length + 1, lines: s.lines });
  }
  const total = certs.flatMap((c) => c.lines).reduce((a, l) => a + l.earnedThisPeriod, 0);
  near(total, 100_000, "the periods sum to the line and no more");
  assert.equal(certs[1].lines.length, 0, "and the certificate where nothing moved is empty");
});

test("a small but REAL movement is still movement", () => {
  // The guard against rounding noise must stay a guard against rounding noise. A
  // line worth ten naira more than last month earned ten naira, and a certificate
  // that leaves it out is short by ten naira.
  const first = snap([line({ qty: 1, rate: 100, percentComplete: 10 })]);
  const again = snap([line({ qty: 1, rate: 100, percentComplete: 20 })], first.lines);
  assert.equal(again.lines.length, 1, "10 naira of movement is on the certificate");
  near(again.lines[0].earnedThisPeriod, 10, "and is stated as 10");
});

test("rounding noise is not movement", () => {
  // Floating-point arithmetic on a percentage can leave a fraction of a kobo, and
  // a certificate must not list a line because of it.
  const first = snap([line({ qty: 3, rate: 1000, percentComplete: 33.333333 })]);
  const again = snap([line({ qty: 3, rate: 1000, percentComplete: 33.333333 })], first.lines);
  assert.equal(again.lines.length, 0);
});
