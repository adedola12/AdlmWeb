// Installations — his queue with two populations in it.
//
// His reason for the screen: the live admin holds nine rows that all read
// "Unknown email · Legacy record · Product(s) —" and offers "Mark complete"
// against every one. It cannot work — there is nothing to complete an orphan
// against — and the button has been there long enough for nine records to pile
// up behind it. So the ones that can be finished are listed and can be
// finished; the ones that cannot are marked, cannot be selected, and are
// offered the two things that are actually true.
//
// OUR SECOND POPULATION IS A DIFFERENT ORPHAN
//
// No installation row in this database has lost its account, so his
// missing-account orphan does not occur here. What does occur is an approved
// order whose approval wrote no entitlement grants: there is nothing to apply,
// so completing it would record a completion that granted nobody anything.
// Those are blocked for the same reason his are, and say which reason.
//
// WHAT THIS SCREEN DOES NOT OFFER
//
// His orphans get "Link to an account" — a form that gives a record the three
// things it is missing. Ours has no endpoint that can do that: adopting would
// mean writing an account, a product and a seat onto somebody's order, and
// there is no route for it and no audit trail if there were. Offering a button
// that cannot work is the exact failure he built this screen to correct, so it
// is absent, and the row says what would have to happen instead.
//
// Same grammar as Purchases — tabs, bulk bar, cards, toast — because a second
// queue that behaves differently from the first is a third thing to learn.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { useAdmToast } from "./adminKit.jsx";

const when = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

const TABS = [
  ["pending", "Pending"],
  ["complete", "Completed"],
  ["uninstalled", "Uninstalled"],
  ["all", "All"],
];

const EMPTY = {
  pending: [
    "Nothing pending",
    "Every approved order has had its software marked installed. This is the queue being empty, not missing.",
  ],
  complete: ["Nothing completed yet", "Completed installations collect here, with who marked them and when."],
  uninstalled: ["Nothing uninstalled", "An installation taken back off a machine is recorded here."],
  all: ["No installations", "An installation appears once an order is approved and asks for one."],
};

export default function DsAdminInstallations() {
  const { accessToken } = useAuth();
  const [view, setView] = React.useState("pending");
  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [picked, setPicked] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [say, toast] = useAdmToast();

  const load = React.useCallback(
    (v) => {
      if (!accessToken) return Promise.resolve();
      return apiAuthed("/admin/install-queue", { token: accessToken, params: { view: v } })
        .then(setD)
        .catch(() => setFailed(true));
    },
    [accessToken],
  );

  React.useEffect(() => {
    setD(null);
    setPicked({});
    load(view);
  }, [view, load]);

  async function act(ids, what) {
    if (!ids.length || busy) return;
    setBusy(true);
    const done = [];
    const bad = [];
    for (const id of ids) {
      try {
        await apiAuthed(`/admin/installations/${id}/${what}`, {
          token: accessToken,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        done.push(id);
      } catch {
        bad.push(id);
      }
    }
    setPicked({});
    await load(view);
    setBusy(false);

    const verb = what === "complete" ? "marked complete" : "marked uninstalled";
    let msg = `${done.length} installation${done.length === 1 ? "" : "s"} ${verb}.`;
    if (what === "complete" && done.length) {
      msg += " The entitlements on the order are applied to the account.";
    }
    if (bad.length) msg += ` ${bad.length} refused by the server.`;
    say(msg);
  }

  if (failed) {
    return <p className="adm-note">Installations could not be loaded just now. Please refresh.</p>;
  }

  const items = d?.items || [];
  const counts = d?.counts || {};
  const pickedIds = Object.keys(picked).filter((k) => picked[k]);

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Installations</h1>
          <p className="adm-lede">
            What happens after a purchase is approved: the Installer Hub puts the plugins on a
            machine and applies the entitlements the order carries. This is where the ones that
            did not finish sit.
            {d?.blocked ? (
              <>
                {" "}
                {d.blocked} of them cannot be completed as they stand, and are marked below.
              </>
            ) : null}
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

      <div className="adm-bulk" hidden={!pickedIds.length}>
        <span>
          {pickedIds.length} installation{pickedIds.length === 1 ? "" : "s"} selected
        </span>
        <div className="adm-bulk-acts">
          <button type="button" className="adm-b" onClick={() => setPicked({})} disabled={busy}>
            Clear
          </button>
          <button
            type="button"
            className="adm-b pri"
            onClick={() => act(pickedIds, "complete")}
            disabled={busy}
          >
            Mark complete
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
          {items.map((i) => (
            <article
              key={i.id}
              className={`adm-card ins${picked[i.id] ? " picked" : ""}${
                i.blocked ? " orphan" : ""
              }${i.status !== "pending" ? " done" : ""}`}
            >
              <label className="adm-pick">
                {/* An orphan can never be selected, because nothing the bulk
                    bar offers can be done to it. His rule. */}
                <input
                  type="checkbox"
                  checked={!!picked[i.id]}
                  disabled={!!i.blocked || i.status !== "pending" || busy}
                  aria-label={`Select ${i.ref}`}
                  onChange={(e) => setPicked((v) => ({ ...v, [i.id]: e.target.checked }))}
                />
              </label>

              <div className="adm-cust">
                <b>{i.who}</b>
                <span className="adm-org">{i.org}</span>
                <span className="adm-mail">{i.email}</span>
              </div>

              <div className="adm-buy">
                {i.products.length ? (
                  <>
                    <b>{i.products.join(" · ")}</b>
                    <span className="adm-meta">
                      <span>{i.ref}</span>
                      <span>
                        {i.seats} seat{i.seats === 1 ? "" : "s"}
                      </span>
                      {i.months ? <span>{i.months} months</span> : null}
                    </span>
                  </>
                ) : (
                  <>
                    <b className="muted">Nothing to install</b>
                    <span className="adm-meta">
                      <span>{i.ref}</span>
                      <span>The approval granted no entitlements</span>
                    </span>
                  </>
                )}
                {i.address ? <span className="adm-hintline">{i.address}</span> : null}
              </div>

              <div className="adm-side-col">
                <span className={`adm-chip ${i.ent.tone}`}>{i.ent.label}</span>
                <span className="adm-age">
                  {i.status === "pending"
                    ? i.approvedAt
                      ? `approved ${when(i.approvedAt)}`
                      : "no approval date"
                    : i.markedAt
                      ? when(i.markedAt)
                      : ""}
                </span>
              </div>

              <div className="adm-act">
                {i.status !== "pending" ? (
                  <span className={`adm-stamp ${i.status === "complete" ? "approved" : "rejected"}`}>
                    {i.status === "complete" ? "Completed" : "Uninstalled"}
                    {i.markedBy ? ` · ${i.markedBy}` : ""}
                  </span>
                ) : i.blocked ? (
                  // No adopt button: there is no endpoint that can give a
                  // record an account and a product, and a button that cannot
                  // work is what this screen exists to remove.
                  <span className="adm-chip due" title={i.blocked}>
                    {i.blocked}
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      className="ds-btn btn-o ds-btn-sm"
                      disabled={busy}
                      onClick={() => act([i.id], "uninstall")}
                    >
                      Uninstall
                    </button>
                    <button
                      type="button"
                      className="ds-btn btn-p ds-btn-sm"
                      disabled={busy}
                      onClick={() => act([i.id], "complete")}
                    >
                      Mark complete
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="adm-foot-note">
        Marking one complete applies the entitlements the order already carries — the seats and
        the term were decided when it was approved, so there is nothing to choose here. A record
        that cannot be completed says why on the row rather than offering a button that would do
        nothing.
      </p>

      {toast}
    </>
  );
}
