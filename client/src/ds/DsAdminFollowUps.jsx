// Follow-ups — the calls behind lapsed licences and unpaid orders.
//
// Richard drew no screen for this: his rail has no Follow-ups, because his
// prototype had no such list. So there is no design to be faithful to, and
// this is built in his grammar rather than invented in a new one — the same
// register table, the same filter row, the same tone vocabulary the rest of
// the admin uses. A screen that behaves like the four beside it is not a
// fifth thing to learn.
//
// A register rather than a queue of cards, because the question here is "who
// do I ring next" — a list you read down, sorted by how overdue somebody is.
// Cards would give six rows a screenful each and hide the ordering that
// matters.
//
// The list is DERIVED. A rebuild recomputes who belongs on it from expired
// entitlements and unpaid orders, and must never clobber the call history
// attached to a row.
//
// Logging a call IS here, because the screen it restyles could already do it
// and a port that quietly drops a capability is a regression wearing a better
// coat. The outcomes come from the server rather than a copy in this file:
// an outcome the screen offers that the endpoint rejects is a button that
// fails, and two lists drifting apart is exactly how that happens.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmFilters, AdmChip } from "./adminUi.jsx";
import { useAdmToast } from "./adminKit.jsx";

const when = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

const REASON = {
  expired: "Licence lapsed",
  pending: "Order unpaid",
};

export default function DsAdminFollowUps() {
  const { accessToken } = useAuth();
  const [view, setView] = React.useState("to_call");
  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [logging, setLogging] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [say, toast] = useAdmToast();
  const [reload, setReload] = React.useState(0);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    setD(null);
    apiAuthed("/admin/queues/followups", { token: accessToken, params: { view } })
      .then((r) => alive && setD(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken, view, reload]);

  if (failed) {
    return <p className="adm-note">Follow-ups could not be loaded just now. Please refresh.</p>;
  }

  const items = d?.items || [];
  const counts = d?.counts || {};
  const outcomes = d?.outcomes || [];

  async function logCall(id, outcome) {
    if (busy) return;
    setBusy(true);
    try {
      await apiAuthed(`/admin/followups/${id}/calls`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome, channel: "phone" }),
      });
      setLogging(null);
      setReload((n) => n + 1);
      say(`Call logged as “${outcome.replace(/_/g, " ")}”.`);
    } catch (e) {
      say(e?.message || "The server refused that. Nothing was logged.");
    } finally {
      setBusy(false);
    }
  }

  const cols = [
    {
      h: "Who to ring",
      w: "26%",
      cell: (f) => <AdmTwo top={f.who} under={f.phone || f.email} />,
    },
    {
      h: "Firm",
      w: "18%",
      cell: (f) =>
        f.org ? (
          <AdmTwo top={f.org} under={f.location || "No location recorded"} />
        ) : (
          <AdmDim>Personal licence</AdmDim>
        ),
    },
    {
      h: "Why",
      cell: (f) => (
        <span className="adm-two">
          <b>{(f.reasons || []).map((r) => REASON[r] || r).join(" · ") || "—"}</b>
          <span>
            {(f.products || []).join(" · ") || "no product recorded"}
            {/* Somebody who let one licence lapse but still holds another is
                a different call from somebody who has left entirely. */}
            {f.hasOther ? " · still holds another" : ""}
          </span>
        </span>
      ),
    },
    {
      h: "Overdue",
      num: true,
      cell: (f) =>
        f.overdue ? (
          <AdmChip tone={f.overdue >= 30 ? "bad" : f.overdue >= 7 ? "due" : ""}>
            {f.overdue}d
          </AdmChip>
        ) : (
          <AdmDim>—</AdmDim>
        ),
    },
    {
      h: "Calls",
      num: true,
      cell: (f) => (f.calls ? f.calls : <AdmDim>none</AdmDim>),
    },
    {
      h: "Last outcome",
      cell: (f) =>
        f.lastCalledAt ? (
          <AdmTwo top={f.lastOutcome || "logged"} under={when(f.lastCalledAt)} />
        ) : (
          <AdmDim>never called</AdmDim>
        ),
    },
    {
      h: "Log a call",
      cell: (f) =>
        logging === f.id ? (
          <span className="adm-log">
            {outcomes.map((o) => (
              <button
                key={o}
                type="button"
                className="adm-b"
                disabled={busy}
                onClick={() => logCall(f.id, o)}
              >
                {o.replace(/_/g, " ")}
              </button>
            ))}
            <button type="button" className="adm-b" onClick={() => setLogging(null)}>
              cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            onClick={() => setLogging(f.id)}
          >
            Log
          </button>
        ),
    },
  ];

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Follow-ups</h1>
          <p className="adm-lede">
            People whose licence has lapsed or whose order was never paid, sorted by how long they
            have been overdue. The list is rebuilt from those two facts, so somebody leaves it by
            renewing or paying rather than by being ticked off.
          </p>
        </div>
      </div>

      <AdmFilters
        current={view}
        onPick={setView}
        options={[
          ["to_call", "To call", counts.to_call],
          ["in_progress", "In progress", counts.in_progress],
          ["done", "Done", counts.done],
          ["all", "Everyone", counts.all],
        ]}
      />

      {!d ? (
        <p className="adm-note">Reading the list…</p>
      ) : (
        <AdmTable
          cols={cols}
          rows={items}
          empty={[
            "Nobody to ring",
            "No licence has lapsed and no order is sitting unpaid. That is the list being empty, not missing.",
          ]}
        />
      )}

      <p className="adm-foot-note">
        The list is rebuilt from expired licences and unpaid orders, and a rebuild never touches
        the call history — somebody leaves this list by renewing or paying, not by being ticked
        off. Logging a call records who made it and when, against your name.
      </p>

      {toast}
    </>
  );
}
