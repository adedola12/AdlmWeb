// Enrolments — his queue where approving something spends something.
//
// His complaint about the live row: "Damilola Kalu · payment_pending ·
// Training — · Payer: —" — the two facts that decide it, both blank. Which
// course, and who is paying. Both are on the row here.
//
// His three claims for the screen, and what became of each:
//
//   1. It names the course and the payer. Kept — a firm booking seats for its
//      staff and a person paying for themselves are different conversations
//      the moment a proof does not match the name on the enrolment.
//   2. It knows about capacity, and refuses to approve onto a full course.
//      NOT PORTED, and this is the one worth reading twice: nothing in this
//      database records a capacity. Training carries a title, a date, a city,
//      a venue and an `attendees` count — a tally of who came, not a limit on
//      who may. Guarding against `attendees` would refuse enrolments for a
//      reason that is not true, which is worse than not guarding.
//   3. It can be read by organisation. Deferred with the seat chart; the firm
//      is on every row, which is the half that pays for itself now.
//
// His other guard IS portable and is here: an enrolment with no proof of
// payment cannot be approved, and the proof — payment.raw.receiptUrl — is on
// the row where he put it, as a link.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { useAdmToast } from "./adminKit.jsx";

const money = (n) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const when = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

const TABS = [
  ["payment_pending", "Awaiting"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
  ["all", "All"],
];

const EMPTY = {
  payment_pending: ["Nothing awaiting", "No enrolment is waiting on a payment being checked."],
  approved: ["Nothing approved yet", "Approved enrolments collect here, with who approved them."],
  rejected: ["Nothing rejected", "A rejected enrolment stays here so the decision can be explained."],
  all: ["No enrolments", "When somebody books onto a training, it arrives here."],
};

export default function DsAdminEnrolments() {
  const { accessToken } = useAuth();
  const [view, setView] = React.useState("payment_pending");
  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [say, toast] = useAdmToast();

  const load = React.useCallback(
    (v) => {
      if (!accessToken) return Promise.resolve();
      return apiAuthed("/admin/queues/enrolments", { token: accessToken, params: { view: v } })
        .then(setD)
        .catch(() => setFailed(true));
    },
    [accessToken],
  );

  React.useEffect(() => {
    setD(null);
    load(view);
  }, [view, load]);

  async function decide(id, to) {
    if (busy) return;
    setBusy(true);
    try {
      await apiAuthed(`/admin/ptrainings/enrollments/${id}/${to}`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      await load(view);
      say(
        to === "approve"
          ? "Enrolment approved. The seat is theirs and the course access is granted."
          : "Enrolment rejected. It stays on the Rejected tab so the decision can be explained.",
      );
    } catch (e) {
      say(e?.message || "The server refused that. Nothing changed.");
    } finally {
      setBusy(false);
    }
  }

  if (failed) {
    return <p className="adm-note">Enrolments could not be loaded just now. Please refresh.</p>;
  }

  const items = d?.items || [];
  const counts = d?.counts || {};

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Enrolments</h1>
          <p className="adm-lede">
            Somebody has booked onto a training and paid by transfer, so a person has to check the
            proof. Each row names the course and who is paying, because a firm booking seats for
            its staff and somebody paying for themselves are different conversations the moment a
            proof does not match the name.
          </p>
        </div>
      </div>

      <div className="adm-tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            className={`adm-tab${view === key ? " on" : ""}`}
            onClick={() => setView(key)}
          >
            <span>{label}</span>
            <em className="adm-tab-n">{counts[key] ?? "—"}</em>
          </button>
        ))}
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
          {items.map((e) => (
            <article
              key={e.id}
              className={`adm-card enr${e.status !== "payment_pending" ? " done" : ""}${
                e.blocked ? " orphan" : ""
              }`}
            >
              <div className="adm-cust">
                <b>{e.who}</b>
                <span className="adm-org">
                  <span>{e.org || "No firm given"}</span>
                  <span className={`adm-payer${e.payer === "firm" ? " firm" : ""}`}>
                    {e.payer === "firm" ? "firm pays" : "self-funded"}
                  </span>
                </span>
                <span className="adm-mail">{e.email}</span>
              </div>

              <div className="adm-buy">
                <b>{e.course}</b>
                <span className="adm-meta">
                  {e.city ? <span>{e.city}</span> : null}
                  {e.starts ? <span>starts {when(e.starts)}</span> : null}
                  {e.mode ? <span>{e.mode}</span> : null}
                </span>
                {e.note ? <span className="adm-hintline">{e.note}</span> : null}
                {e.rejectReason ? (
                  <span className="adm-hintline">Rejected: {e.rejectReason}</span>
                ) : null}
              </div>

              <div className="adm-sum">
                <b>{money(e.amount)}</b>
                <span>
                  {e.paid ? "marked paid" : "not marked paid"}
                  {e.method ? ` · ${e.method}` : ""}
                </span>
              </div>

              <div className="adm-side-col">
                {/* His: you can see what you are approving. */}
                {e.proof ? (
                  <a
                    className="adm-proof"
                    href={e.proof}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View the proof
                  </a>
                ) : (
                  <span className="adm-proof none">No proof uploaded</span>
                )}
                <span className={`adm-age${e.age >= 3 ? " old" : ""}`}>
                  {e.age === 0 ? "today" : `${e.age} day${e.age === 1 ? "" : "s"} old`}
                </span>
                {e.payerName ? (
                  <span className="adm-hintline">
                    paid by {e.payerName}
                    {e.bankName ? ` · ${e.bankName}` : ""}
                  </span>
                ) : null}
              </div>

              <div className="adm-act">
                {e.status !== "payment_pending" ? (
                  <span className={`adm-stamp ${e.status === "approved" ? "approved" : "rejected"}`}>
                    {e.status === "approved" ? "Approved" : "Rejected"}
                    {e.decidedBy ? ` · ${e.decidedBy}` : ""}
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      className="ds-btn btn-o ds-btn-sm"
                      disabled={busy}
                      onClick={() => decide(e.id, "reject")}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className="ds-btn btn-p ds-btn-sm"
                      disabled={busy || !!e.blocked}
                      title={e.blocked || undefined}
                      onClick={() => decide(e.id, "approve")}
                    >
                      Approve
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="adm-foot-note">
        An enrolment with no proof of payment cannot be approved — there is nothing to check it
        against. There is no seat guard: nothing records how many places a training has, so this
        screen cannot tell you a course is full and does not pretend to.
      </p>

      {toast}
    </>
  );
}
