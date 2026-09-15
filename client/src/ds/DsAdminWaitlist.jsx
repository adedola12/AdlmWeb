// Waitlist — who asked to be told, and what became of them.
//
// Richard drew no waitlist screen; the forms it collects are his, but the
// admin side of them is ours. Built in his grammar: the register table, his
// filter row, his tone vocabulary.
//
// A waitlist entry is a person who wanted something that did not exist yet.
// The only thing worth doing to one is moving it along — contacted, converted,
// archived — so the status is editable inline rather than behind a record
// screen, and the row says which form they came through, because "waiting for
// CIVIQ" and "asked about training" are different follow-ups.
//
// Deleting asks first. An entry is somebody's email address given on the
// understanding they would be contacted; removing it is not undoable and there
// is no export of what was removed.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmFilters } from "./adminUi.jsx";
import { useAdmToast } from "./adminKit.jsx";

const STATUSES = ["new", "contacted", "converted", "archived"];

const when = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

export default function DsAdminWaitlist() {
  const { accessToken } = useAuth();
  const [view, setView] = React.useState("");
  const [q, setQ] = React.useState("");
  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [reload, setReload] = React.useState(0);
  const [confirming, setConfirming] = React.useState(null);
  const [say, toast] = useAdmToast();

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    setD(null);
    const t = setTimeout(() => {
      apiAuthed("/admin/waitlist", { token: accessToken, params: { status: view, q } })
        .then((r) => alive && setD(r))
        .catch(() => alive && setFailed(true));
    }, q ? 220 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [accessToken, view, q, reload]);

  async function change(id, patch, done) {
    if (busy) return;
    setBusy(true);
    try {
      await apiAuthed(`/admin/waitlist/${id}`, {
        token: accessToken,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      setReload((n) => n + 1);
      say(done);
    } catch (e) {
      say(e?.message || "The server refused that. Nothing changed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id, email) {
    if (busy) return;
    setBusy(true);
    try {
      await apiAuthed(`/admin/waitlist/${id}`, { token: accessToken, method: "DELETE" });
      setConfirming(null);
      setReload((n) => n + 1);
      say(`${email} removed from the waitlist. That cannot be undone.`);
    } catch (e) {
      say(e?.message || "The server refused that. Nothing was removed.");
    } finally {
      setBusy(false);
    }
  }

  if (failed) {
    return <p className="adm-note">The waitlist could not be loaded just now. Please refresh.</p>;
  }

  const rows = d?.items || d?.entries || [];
  const counts = d?.counts || {};

  const cols = [
    {
      h: "Who",
      w: "24%",
      cell: (e) => <AdmTwo top={e.name || e.email} under={e.email} />,
    },
    {
      h: "Firm",
      cell: (e) => (e.org ? e.org : <AdmDim>none given</AdmDim>),
    },
    {
      h: "Asked about",
      cell: (e) => <AdmTwo top={e.topic || "Not stated"} under={e.sourcePath || ""} />,
    },
    {
      h: "What they said",
      cell: (e) =>
        e.message ? (
          <span className="adm-two">
            <b>{String(e.message).slice(0, 60)}</b>
            {String(e.message).length > 60 ? <span>…</span> : null}
          </span>
        ) : (
          <AdmDim>nothing</AdmDim>
        ),
    },
    { h: "Asked", cell: (e) => when(e.createdAt) },
    {
      h: "Status",
      cell: (e) => (
        <select
          className="adm-sel"
          value={e.status || "new"}
          disabled={busy}
          onChange={(ev) =>
            change(e._id || e.id, { status: ev.target.value }, `${e.email} marked ${ev.target.value}.`)
          }
          aria-label={`Change the status of ${e.email}`}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      ),
    },
    {
      h: "",
      cell: (e) => {
        const id = e._id || e.id;
        // Removing an address given on the understanding of being contacted is
        // not undoable and is not exported first, so the row says whose before
        // it will do it.
        if (confirming === id) {
          return (
            <span className="adm-log">
              <button
                type="button"
                className="adm-b pri"
                disabled={busy}
                onClick={() => remove(id, e.email)}
              >
                delete {e.email} for good
              </button>
              <button type="button" className="adm-b" onClick={() => setConfirming(null)}>
                cancel
              </button>
            </span>
          );
        }
        return (
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            onClick={() => setConfirming(id)}
          >
            Delete
          </button>
        );
      },
    },
  ];

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Waitlist</h1>
          <p className="adm-lede">
            People who asked to be told when something was ready. Each row says which form they
            came through, because somebody waiting on CIVIQ and somebody asking about training are
            different follow-ups.
          </p>
        </div>
        <div className="adm-acts">
          <a
            className="ds-btn btn-o ds-btn-sm"
            href="/admin/waitlist/export.csv"
            target="_blank"
            rel="noopener noreferrer"
          >
            Export CSV
          </a>
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
          placeholder="Search an email, a name or a firm"
          aria-label="Search the waitlist"
        />
      </label>

      <AdmFilters
        current={view}
        onPick={setView}
        options={[
          ["", "Everyone", counts.all],
          ...STATUSES.map((s) => [s, s, counts[s]]),
        ]}
      />

      {!d ? (
        <p className="adm-note">Reading the waitlist…</p>
      ) : (
        <AdmTable
          cols={cols}
          rows={rows}
          rowKey={(e) => e._id || e.id}
          empty={["Nobody waiting", "No one has asked to be told about anything."]}
        />
      )}

      <p className="adm-foot-note">
        Moving somebody to contacted or converted records that it happened; it does not send them
        anything. Deleting removes the address for good and there is no export of what was
        removed, so take the CSV first if you might want it.
      </p>

      {toast}
    </>
  );
}
