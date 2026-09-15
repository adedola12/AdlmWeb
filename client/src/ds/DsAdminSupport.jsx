// Support — the ticket queue.
//
// His screen exists (admin-support.html) but ships no behaviour script, so
// there is no logic of his to be faithful to here — only his grammar, which
// this follows: the register table for reading the queue, his filter row, his
// tone vocabulary on the status.
//
// A ticket carries the thing that makes it actionable and the old list buried:
// the machine it came from, the product and version, and an AnyDesk address if
// the person offered one. A support call that starts by asking "which version
// are you on" is a call that has already wasted its first two minutes, so
// those are on the row.
//
// Changing a status is real and wired — PATCH /admin/support-tickets/:id —
// because moving a ticket to resolved is the whole job of the screen and the
// endpoint already does it, including the email it sends.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmChip } from "./adminUi.jsx";
import { toneFor, useAdmToast } from "./adminKit.jsx";

const STATUSES = ["open", "scheduled", "in-progress", "resolved", "closed"];

const when = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

export default function DsAdminSupport() {
  const { accessToken } = useAuth();
  const [view, setView] = React.useState("");
  const [q, setQ] = React.useState("");
  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [reload, setReload] = React.useState(0);
  const [say, toast] = useAdmToast();

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    setD(null);
    const t = setTimeout(() => {
      apiAuthed("/admin/support-tickets", {
        token: accessToken,
        params: { status: view, search: q },
      })
        .then((r) => alive && setD(r))
        .catch(() => alive && setFailed(true));
    }, q ? 220 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [accessToken, view, q, reload]);

  async function setStatus(id, status) {
    if (busy) return;
    setBusy(true);
    try {
      await apiAuthed(`/admin/support-tickets/${id}`, {
        token: accessToken,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setReload((n) => n + 1);
      say(`Ticket moved to ${status}.`);
    } catch (e) {
      say(e?.message || "The server refused that. Nothing changed.");
    } finally {
      setBusy(false);
    }
  }

  if (failed) {
    return <p className="adm-note">Support could not be loaded just now. Please refresh.</p>;
  }

  const tickets = d?.tickets || [];

  const cols = [
    {
      h: "Who and what",
      w: "30%",
      cell: (t) => <AdmTwo top={t.title || "No subject"} under={t.userFullName || t.userEmail} />,
    },
    {
      h: "Where from",
      cell: (t) => (
        <span className="adm-two">
          <b>{[t.productKey, t.appVersion].filter(Boolean).join(" ") || "Not stated"}</b>
          <span>{t.machine || t.source || "no machine recorded"}</span>
        </span>
      ),
    },
    {
      h: "AnyDesk",
      cell: (t) =>
        t.anyDeskAddress ? <b>{t.anyDeskAddress}</b> : <AdmDim>not offered</AdmDim>,
    },
    {
      h: "Raised",
      cell: (t) => <AdmTwo top={when(t.createdAt)} under={t.category || t.type || ""} />,
    },
    {
      h: "Status",
      cell: (t) => <AdmChip tone={toneFor(t.status)}>{t.status}</AdmChip>,
    },
    {
      h: "Move to",
      cell: (t) => (
        <select
          className="adm-sel"
          value={t.status}
          disabled={busy}
          onChange={(e) => setStatus(t._id, e.target.value)}
          aria-label={`Change the status of ${t.title || "this ticket"}`}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      ),
    },
  ];

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Support</h1>
          <p className="adm-lede">
            Tickets raised from the desktop products and the website. Each row carries the machine,
            the product and the version it came from, so a call does not start by asking.
          </p>
        </div>
      </div>

      <label className="adm-find adm-find-wide">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <use href="#hi-search" />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a subject, a person, or an AnyDesk address"
          aria-label="Search tickets"
        />
      </label>

      <div className="adm-tabs" role="tablist">
        {[["", "Everything"], ...STATUSES.map((s) => [s, s])].map(([key, label]) => (
          <button
            key={key || "all"}
            type="button"
            role="tab"
            aria-selected={view === key}
            className={`adm-tab${view === key ? " on" : ""}`}
            onClick={() => setView(key)}
          >
            <span>{label}</span>
          </button>
        ))}
      </div>

      {!d ? (
        <p className="adm-note">Reading the queue…</p>
      ) : (
        <AdmTable
          cols={cols}
          rows={tickets}
          rowKey={(t) => t._id}
          empty={[
            "No tickets",
            "Nobody is waiting on support. For this queue that is the good outcome.",
          ]}
        />
      )}

      <p className="adm-foot-note">
        Moving a ticket to scheduled or resolved emails the person who raised it — the endpoint
        sends it, so a status change here is a message they receive, not just a label.
      </p>

      {toast}
    </>
  );
}
