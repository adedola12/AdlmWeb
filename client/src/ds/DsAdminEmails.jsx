// Emails — the messages the studio sends, readable and changeable here.
//
// His screen, his columns: the message and when it goes, how many went in
// thirty days, a flag when something is wrong with one, and Read it / Edit.
//
// WHERE OURS DIFFERS FROM HIS, AND WHY
//
// His lists nine messages and every one is editable. Ours lists what the code
// actually sends — fourteen — and three of them refuse to be edited: the
// sign-in code, the password reset and the break-glass code. Not because the
// mechanism could not carry them. Their wording is what a person reads before
// typing a code into a box, so an admin account able to rewrite it is an admin
// account able to write a convincing phishing mail from the studio's own
// domain. The row says so rather than showing a control that fails.
//
// Editing writes an override. The message in code keeps sending until one
// exists, and "Put the original back" deletes it — so trying a new wording is
// safe, and undoing it is one click rather than a deploy.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmChip } from "./adminUi.jsx";
import { useAdmToast } from "./adminKit.jsx";
import { AdmDrawer } from "./adminForm.jsx";

const num = (n) => new Intl.NumberFormat("en-NG").format(Number(n) || 0);

const when = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

export default function DsAdminEmails() {
  const { accessToken } = useAuth();
  const [say, toast] = useAdmToast();

  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [reload, setReload] = React.useState(0);
  const [open, setOpen] = React.useState(null); // { row, mode: "read"|"edit", body }
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    setD(null);
    apiAuthed("/admin/emails", { token: accessToken })
      .then((r) => alive && setD(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken, reload]);

  async function openOne(row, mode) {
    setOpen({ row, mode, body: null });
    try {
      const full = await apiAuthed(`/admin/emails/${row.key}`, { token: accessToken });
      setOpen({ row, mode, body: full, draft: { subject: full.subject, html: full.html } });
    } catch {
      setOpen(null);
      say("That message could not be read.");
    }
  }

  async function save() {
    const { subject, html } = open.draft || {};
    if (!subject?.trim() || !html?.trim()) {
      say("A message needs both a subject and a body.");
      return;
    }
    setBusy(true);
    try {
      await apiAuthed(`/admin/emails/${open.row.key}`, {
        token: accessToken,
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, html }),
      });
      setOpen(null);
      setReload((n) => n + 1);
      say(`${open.row.name} now sends your wording.`);
    } catch (err) {
      say(err?.message || "That could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function revert() {
    setBusy(true);
    try {
      await apiAuthed(`/admin/emails/${open.row.key}`, { token: accessToken, method: "DELETE" });
      setOpen(null);
      setReload((n) => n + 1);
      say(`${open.row.name} is back to the original wording.`);
    } catch (err) {
      say(err?.message || "That could not be undone.");
    } finally {
      setBusy(false);
    }
  }

  if (failed) {
    return <p className="adm-note">Emails could not be loaded just now. Please refresh.</p>;
  }

  const cols = [
    {
      h: "Message",
      w: "28%",
      cell: (e) => <AdmTwo top={e.name} under={e.when} />,
    },
    { h: "Sent, 30 days", num: true, cell: (e) => num(e.sent30) },
    {
      h: "",
      cell: (e) => (
        <>
          {e.flag ? <span className="adm-warn">{e.flag}</span> : null}
          {e.edited ? (
            <AdmChip tone="">
              edited{e.editedBy ? ` by ${e.editedBy.split("@")[0]}` : ""}
            </AdmChip>
          ) : null}
          {!e.editable ? <AdmDim>wording fixed in code</AdmDim> : null}
        </>
      ),
    },
    {
      h: "",
      cell: (e) => (
        <span className="adm-rowacts">
          <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => openOne(e, "read")}>
            Read it
          </button>
          {e.editable ? (
            <button
              type="button"
              className="ds-btn btn-o ds-btn-sm"
              onClick={() => openOne(e, "edit")}
            >
              Edit
            </button>
          ) : null}
        </span>
      ),
    },
  ];

  const body = open?.body;

  return (
    <>
      {toast}

      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Emails</h1>
          <p className="adm-lede">
            The messages the studio sends. They are live and sending today — this is where they
            become readable and changeable without a developer.
          </p>
        </div>
      </div>

      {!d ? (
        <p className="adm-note">Reading the messages…</p>
      ) : (
        <>
          <AdmTable
            cols={cols}
            rows={d.items}
            rowKey={(e) => e.key}
            empty={["No messages", "Nothing is declared as sendable."]}
          />

          <div className="adm-merge">
            <b>These go out today.</b>
            <span>
              Every one is live and sending. Editing writes an override — the version in code keeps
              sending until you save one, and putting the original back is a single button rather
              than a deploy.{" "}
              {d.countingSince
                ? `Send counts begin ${when(d.countingSince)}, when the log started.`
                : "Nothing has been sent since the log started, so every count reads zero."}
            </span>
          </div>
        </>
      )}

      {open ? (
        <AdmDrawer
          title={open.mode === "edit" ? `Edit ${open.row.name}` : open.row.name}
          intro={open.row.when}
          onClose={() => setOpen(null)}
          foot={
            open.mode === "edit" ? (
              <>
                {body?.edited ? (
                  <button
                    type="button"
                    className="ds-btn btn-o ds-btn-sm adm-danger"
                    disabled={busy}
                    onClick={revert}
                  >
                    Put the original back
                  </button>
                ) : null}
                <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => setOpen(null)}>
                  Cancel
                </button>
                <button type="button" className="ds-btn btn-p ds-btn-sm" disabled={busy} onClick={save}>
                  {busy ? "Saving…" : "Save the wording"}
                </button>
              </>
            ) : (
              <button type="button" className="ds-btn btn-p ds-btn-sm" onClick={() => setOpen(null)}>
                Close
              </button>
            )
          }
        >
          {!body ? (
            <p className="adm-note">Reading…</p>
          ) : open.mode === "read" ? (
            <>
              <p className="adm-drawer-note">
                {body.edited
                  ? "This is the wording somebody saved here."
                  : `This message has not been edited, so it sends as written in ${body.file}.`}
              </p>
              {body.edited ? (
                <>
                  <p className="adm-f-l">Subject</p>
                  <p>{body.subject}</p>
                  <p className="adm-f-l">Body</p>
                  {/* The saved HTML as text. Rendering it would run an admin's
                      own markup inside the admin, which is a needless door. */}
                  <pre className="adm-pre">{body.html}</pre>
                </>
              ) : (
                <p>
                  The wording lives in <b>{body.file}</b>. Press Edit to write a version that sends
                  instead of it — the original stays where it is and can be put back at any time.
                </p>
              )}
            </>
          ) : (
            <div className="adm-fs">
              <label className="adm-f wide">
                <span className="adm-f-l">Subject *</span>
                <input
                  value={open.draft?.subject ?? ""}
                  onChange={(e) =>
                    setOpen((o) => ({ ...o, draft: { ...o.draft, subject: e.target.value } }))
                  }
                />
                <span className="adm-f-h">
                  What shows in the inbox before anybody opens it.
                </span>
              </label>
              <label className="adm-f wide">
                <span className="adm-f-l">Body *</span>
                <textarea
                  rows={14}
                  value={open.draft?.html ?? ""}
                  onChange={(e) =>
                    setOpen((o) => ({ ...o, draft: { ...o.draft, html: e.target.value } }))
                  }
                  placeholder={body.edited ? "" : "Write the message. HTML is allowed."}
                />
                <span className="adm-f-h">
                  {body.edited
                    ? "This replaces the version in code."
                    : `Empty because nothing has been saved here yet — the message currently sends from ${body.file}. Anything you write replaces it.`}
                </span>
              </label>
            </div>
          )}
        </AdmDrawer>
      ) : null}
    </>
  );
}
