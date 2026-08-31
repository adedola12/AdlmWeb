// Purchases — his queue, on our orders.
//
// The three things he built this screen to fix, all kept:
//
//   1. A row names its subject. The old hub reads "Personal · Requested ·
//      2026-08-24" thirty-three times over, which is not something a person
//      can act on — they can only guess. Every row here says who, which firm,
//      what they bought and what it came to.
//   2. The term is not a dropdown. The customer bought a year or a month and
//      the order carries it; a control that lets an administrator pick a
//      different one is a control that lets them get it wrong. So it is shown,
//      never offered.
//   3. You can see whether you are able to act. His version put the proof of
//      payment on the row and refused to approve without one.
//
// THE THIRD ONE, TRANSLATED
//
// We store no proof of payment anywhere — no such field, and no payment method
// on any pending row either. His rule cannot be ported literally, but the
// thing it protects can: never offer a decision the server will refuse. The
// endpoint computes `blocked` for the two cases approve genuinely fails on —
// the account is gone, or the order has no lines — and those rows show the
// reason and cannot be approved. They can still be REJECTED, which is how an
// ungrantable order should leave the queue.
//
// The absence of any proof at all is stated once, in the lede, rather than
// repeated on all thirty-three rows.
//
// NO UNDO, AND THAT IS DELIBERATE
//
// His has one, because his decisions live in a variable and a refresh puts
// them back. Ours reach a server that grants entitlements, writes an expiry
// and queues an invoice. There is no un-approve endpoint and there should not
// be a button implying one — a decision that has granted licences is undone by
// revoking them, not by a toggle on a list. Approved rows carry who decided
// and when instead.
//
// His markup: .adm-pagehead/.adm-h/.adm-lede, .adm-tabs/.adm-tab/.adm-tab-n,
// .adm-bulk, .adm-card with .adm-pick/.adm-cust/.adm-buy/.adm-sum/
// .adm-side-col/.adm-act, .adm-none, .adm-toast, .adm-foot-note.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";

const money = (n, currency = "NGN") =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: currency || "NGN",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

const when = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

const TABS = [
  ["pending", "Awaiting", "awaiting"],
  ["approved", "Approved", "approved"],
  ["rejected", "Rejected", "rejected"],
  ["all", "All", "all"],
];

const EMPTY = {
  pending: [
    "Nothing waiting",
    "No order needs a decision. Card purchases that clear through the gateway activate themselves.",
  ],
  approved: ["Nothing approved yet", "Approved orders collect here, with who approved them and when."],
  rejected: ["Nothing rejected", "A rejected order stays here so the decision can be explained later."],
  all: ["No orders", "When somebody buys, the order arrives here for a decision."],
};

export default function DsAdminPurchases() {
  const { accessToken } = useAuth();
  const [view, setView] = React.useState("pending");
  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [picked, setPicked] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState("");

  const timer = React.useRef(null);
  const say = React.useCallback((msg) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 5200);
  }, []);
  React.useEffect(() => () => clearTimeout(timer.current), []);

  const load = React.useCallback(
    (status) => {
      if (!accessToken) return Promise.resolve();
      return apiAuthed("/admin/purchase-queue", { token: accessToken, params: { status } })
        .then((r) => setD(r))
        .catch(() => setFailed(true));
    },
    [accessToken],
  );

  React.useEffect(() => {
    setD(null);
    setPicked({});
    load(view);
  }, [view, load]);

  /**
   * One decision, or many. Sent one at a time rather than as a batch: there is
   * no bulk endpoint, and inventing one that half-succeeds is worse than a
   * loop that can report exactly which rows went through.
   */
  async function decide(ids, to) {
    if (!ids.length || busy) return;
    setBusy(true);
    const done = [];
    const failedIds = [];
    for (const id of ids) {
      try {
        await apiAuthed(`/admin/purchases/${id}/${to === "approved" ? "approve" : "reject"}`, {
          token: accessToken,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        done.push(id);
      } catch {
        failedIds.push(id);
      }
    }
    setPicked({});
    await load(view);
    setBusy(false);

    let msg = `${done.length} order${done.length === 1 ? "" : "s"} ${to}.`;
    if (to === "approved" && done.length) {
      msg += " Licences granted for the term on the order, and the account can install.";
    }
    if (failedIds.length) {
      msg += ` ${failedIds.length} could not be — the server refused ${failedIds.length === 1 ? "it" : "them"}.`;
    }
    say(msg);
  }

  if (failed) {
    return <p className="adm-note">The queue could not be loaded just now. Please refresh.</p>;
  }

  const items = d?.items || [];
  const counts = d?.counts || {};
  const pickedIds = Object.keys(picked).filter((k) => picked[k]);
  const canApprove = (p) => p.status === "pending" && !p.blocked;

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Purchases</h1>
          <p className="adm-lede">
            Orders awaiting a decision. Somebody paid and is waiting to be let in, and approving
            one grants the licences it bought. No proof of payment is stored against any of
            these — nothing in the system records one — so the decision rests on the account and
            the order itself.
          </p>
        </div>
      </div>

      <div className="adm-tabs" role="tablist">
        {TABS.map(([key, label, countKey]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            className={`adm-tab${view === key ? " on" : ""}`}
            onClick={() => setView(key)}
          >
            <span>{label}</span>
            <em className="adm-tab-n">{counts[countKey] ?? "—"}</em>
          </button>
        ))}
      </div>

      <div className="adm-bulk" hidden={!pickedIds.length}>
        <span>
          {pickedIds.length} order{pickedIds.length === 1 ? "" : "s"} selected
        </span>
        <div className="adm-bulk-acts">
          <button type="button" className="adm-b" onClick={() => setPicked({})} disabled={busy}>
            Clear
          </button>
          <button
            type="button"
            className="adm-b"
            onClick={() => decide(pickedIds, "rejected")}
            disabled={busy}
          >
            Reject selected
          </button>
          <button
            type="button"
            className="adm-b pri"
            onClick={() => decide(pickedIds, "approved")}
            disabled={busy}
          >
            Approve selected
          </button>
        </div>
      </div>

      {!d ? (
        <p className="adm-note">Reading the queue…</p>
      ) : !items.length ? (
        <div className="adm-none">
          <b>{EMPTY[view][0]}</b>
          <span>{EMPTY[view][1]}</span>
        </div>
      ) : (
        <div>
          {items.map((p) => (
            <article
              key={p.id}
              className={`adm-card${picked[p.id] ? " picked" : ""}${
                p.status !== "pending" ? " done" : ""
              }`}
            >
              <label className="adm-pick">
                <input
                  type="checkbox"
                  checked={!!picked[p.id]}
                  disabled={p.status !== "pending" || busy}
                  aria-label={`Select ${p.ref}`}
                  onChange={(e) =>
                    setPicked((v) => ({ ...v, [p.id]: e.target.checked }))
                  }
                />
              </label>

              <div className="adm-cust">
                <b>{p.who}</b>
                <span className="adm-org">{p.org}</span>
                <span className="adm-mail">{p.email}</span>
              </div>

              <div className="adm-buy">
                <b>{p.what || "Nothing itemised on this order"}</b>
                <span className="adm-meta">
                  <span>{p.ref}</span>
                  <span>
                    {p.seats} seat{p.seats === 1 ? "" : "s"}
                  </span>
                  {p.term ? <span>{p.term}</span> : null}
                </span>
              </div>

              <div className="adm-sum">
                <b>{money(p.gross, p.currency)}</b>
                <span>
                  {p.tax
                    ? `${money(p.net, p.currency)} + ${money(p.tax, p.currency)} ${p.vatLabel}`
                    : "no VAT recorded"}
                </span>
              </div>

              <div className="adm-side-col">
                {p.blocked ? (
                  <span className="adm-proof none">{p.blocked}</span>
                ) : p.gatewayRef ? (
                  <span className="adm-proof">{p.gatewayRef}</span>
                ) : null}
                <span className={`adm-age${p.age >= 3 ? " old" : ""}`}>
                  {p.age === 0 ? "today" : `${p.age} day${p.age === 1 ? "" : "s"} old`}
                </span>
              </div>

              <div className="adm-act">
                {p.status === "pending" ? (
                  <>
                    <button
                      type="button"
                      className="ds-btn btn-o ds-btn-sm"
                      disabled={busy}
                      onClick={() => decide([p.id], "rejected")}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className="ds-btn btn-p ds-btn-sm"
                      disabled={busy || !canApprove(p)}
                      title={p.blocked || undefined}
                      onClick={() => decide([p.id], "approved")}
                    >
                      Approve
                    </button>
                  </>
                ) : (
                  <span className={`adm-stamp ${p.status}`}>
                    {p.status === "approved" ? "Approved" : "Rejected"}
                    {p.decidedAt ? ` · ${when(p.decidedAt)}` : ""}
                    {p.decidedBy ? ` · ${p.decidedBy}` : ""}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="adm-foot-note">
        Approving grants the licences for the term the customer actually bought. The order
        carries it, so there is nothing to choose here and nothing to get wrong. Every approval
        and rejection is written against your name, and neither can be undone from this screen —
        an approval that has granted licences is reversed by revoking them, not by a toggle on a
        list.
      </p>

      <div className="adm-toast" role="status" aria-live="polite" hidden={!toast}>
        {toast}
      </div>
    </>
  );
}
