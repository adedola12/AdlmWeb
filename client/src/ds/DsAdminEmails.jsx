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
  // Whether anything can actually send. Asked for only when somebody presses
  // the button: it opens connections to every mail host we know about, which
  // is not something a page should do on every visit.
  const [ways, setWays] = React.useState(null);
  const [checking, setChecking] = React.useState(false);
  // The addresses the studio has stopped mailing, and why. Loaded with the
  // page rather than on demand — unlike the send check above, this is two
  // indexed reads and no outbound connections, and a number nobody looks at
  // is a number that grows.
  const [bounces, setBounces] = React.useState(null);
  const [clearing, setClearing] = React.useState("");

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    setD(null);
    apiAuthed("/admin/emails", { token: accessToken })
      .then((r) => alive && setD(r))
      .catch(() => alive && setFailed(true));
    // Its own request, and its own failure. A bounce list that cannot be read
    // must not take the Emails screen down with it — the messages are the
    // reason people come here, and they are readable whether or not anything
    // has bounced.
    apiAuthed("/admin/emails/bounces", { token: accessToken })
      .then((r) => alive && setBounces(r))
      .catch(() => alive && setBounces({ failed: true }));
    return () => {
      alive = false;
    };
  }, [accessToken, reload]);

  /**
   * Start sending to one address again.
   *
   * Confirmed first, because the machine was probably right. A bounce means
   * the receiving server said the mailbox does not exist, and overruling that
   * on a hunch puts the studio back to mailing an address that will reject it
   * again — which is the exact behaviour that costs delivery for everybody
   * else. The diagnostic is in the row above the button so the decision is
   * made while looking at what their server actually said.
   */
  async function clearBounce(row) {
    if (
      !window.confirm(
        `Start sending to ${row.email} again?\n\n` +
          `Their mail server refused the last message:\n${row.detail || row.reason || "no reason given"}\n\n` +
          `Only do this if you know the address works now — usually because you have spoken to them.`,
      )
    ) {
      return;
    }

    setClearing(row.email);
    try {
      const r = await apiAuthed("/admin/emails/bounces/clear", {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: row.email }),
      });
      setReload((n) => n + 1);
      say(
        r?.alreadySending
          ? `${row.email} was already being sent to.`
          : `${row.email} will be included in mail again.`,
      );
    } catch (err) {
      say(err?.message || "That could not be changed.");
    } finally {
      setClearing("");
    }
  }

  async function openOne(row, mode) {
    setOpen({ row, mode, body: null });
    try {
      const full = await apiAuthed(`/admin/emails/${row.key}`, { token: accessToken });
      setOpen({ row, mode, body: full, draft: { subject: full.subject, html: full.html } });
    } catch (err) {
      setOpen(null);
      // "Could not be read" for an expired session sends somebody hunting for
      // a fault in the message. The status says which of the two it is, so the
      // toast can name the actual problem and the fix.
      say(
        err?.status === 401
          ? "Your admin session has expired. Sign in again and it will open."
          : "That message could not be read.",
      );
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

  async function check() {
    setChecking(true);
    setWays(null);
    try {
      setWays(await apiAuthed("/admin/emails/health", { token: accessToken }));
    } catch (err) {
      setWays({ ok: false, ways: [{ via: "the check itself", ok: false, said: err?.message || "failed" }] });
    } finally {
      setChecking(false);
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
        <div id="adm-page-acts">
          <button type="button" className="ds-btn btn-o ds-btn-sm" disabled={checking} onClick={check}>
            {checking ? "Checking…" : "Can we send?"}
          </button>
        </div>
      </div>

      {/* A fallback is only ever reached once the primary has failed, so a
          broken one stays invisible until it is the only thing left. This is
          how it gets looked at on an ordinary day. Nothing is sent. */}
      {ways ? (
        <div className="adm-merge" style={{ display: "block" }}>
          <b>
            {ways.ok
              ? "There is a way out that has been checked."
              : ways.reachable
                ? "Nothing could be confirmed — see below."
                : "Nothing can send."}
          </b>
          <table className="adm-table" style={{ marginTop: 10 }}>
            <tbody>
              {(ways.ways || []).map((w) => (
                <tr key={w.via}>
                  <td style={{ width: "30%" }}>{w.via}</td>
                  <td style={{ width: "14%" }}>
                    <AdmChip tone={w.unknown ? "calm" : w.ok ? "ok" : "bad"}>
                      {w.unknown ? "unproven" : w.ok ? "works" : "refused"}
                    </AdmChip>
                  </td>
                  <td>{w.said}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

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

          {/* What came back.
              Placed under the messages rather than on a screen of its own: a
              bounce list nobody visits is a bounce list that does nothing, and
              the people who come here to read the mail are the same people who
              should see which of it is failing. */}
          {bounces && !bounces.failed ? (
            <div style={{ marginTop: 26 }}>
              <h2 className="adm-h" style={{ fontSize: 20 }}>
                What came back
              </h2>
              <p className="adm-lede">
                {bounces.undeliverableAccounts === 0 ? (
                  <>
                    Nothing is being held back. Every address on file is still accepting mail.
                  </>
                ) : (
                  <>
                    {num(bounces.undeliverableAccounts)}{" "}
                    {bounces.undeliverableAccounts === 1 ? "address is" : "addresses are"} no longer
                    being mailed, because the receiving server refused the last message. They are
                    left out of campaigns, broadcasts and video announcements — receipts and licence
                    mail still try. Every send to a dead address costs a little of the delivery
                    everybody else gets.
                  </>
                )}
              </p>

              {bounces.stopped?.length ? (
                <AdmTable
                  cols={[
                    {
                      h: "Address",
                      w: "34%",
                      cell: (r) => <AdmTwo top={r.email} under={r.name || ""} />,
                    },
                    {
                      h: "Stopped",
                      w: "16%",
                      cell: (r) => <AdmDim>{when(r.at)}</AdmDim>,
                    },
                    {
                      h: "What their server said",
                      cell: (r) => (
                        <>
                          <AdmChip tone="bad">{r.reason || "bounce"}</AdmChip>{" "}
                          <AdmDim>{r.detail || "no reason given"}</AdmDim>
                        </>
                      ),
                    },
                    {
                      h: "",
                      cell: (r) => (
                        <span className="adm-rowacts">
                          <button
                            type="button"
                            className="ds-btn btn-o ds-btn-sm"
                            disabled={clearing === r.email}
                            onClick={() => clearBounce(r)}
                          >
                            {clearing === r.email ? "Changing…" : "Start sending again"}
                          </button>
                        </span>
                      ),
                    },
                  ]}
                  rows={bounces.stopped}
                  rowKey={(r) => r.email}
                  empty={["Nothing held back", "No address has been refused."]}
                />
              ) : null}

              <div className="adm-merge">
                <b>Only put an address back if you know it works.</b>
                <span>
                  A bounce is the receiving server saying the mailbox does not exist, and it is
                  usually right — the ordinary reason to overrule it is having spoken to the
                  customer. Nothing here changes what somebody has chosen to receive: an address
                  put back still honours an unsubscribe made before it broke.
                  {bounces.last90Days?.complaint ? (
                    <>
                      {" "}
                      {num(bounces.last90Days.complaint)} complaint
                      {bounces.last90Days.complaint === 1 ? " was" : "s were"} recorded in the last
                      90 days — those are people who pressed &ldquo;spam&rdquo;, and they are opted
                      out rather than held back, so they are not in this list.
                    </>
                  ) : null}
                </span>
              </div>
            </div>
          ) : null}

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
                  ? "This is the wording somebody saved here. It sends instead of the version in the code."
                  : `Not edited, so it sends as written in ${body.file}. This is what a customer receives.`}
              </p>

              <p className="adm-f-l">Subject</p>
              <p className="adm-mail-subject">{body.live?.subject || <AdmDim>none</AdmDim>}</p>

              <p className="adm-f-l">What they read</p>
              {/* The mail itself, in an iframe.
                  srcDoc and sandbox with nothing enabled: the markup renders
                  exactly as a mail client would show it, while scripts, forms
                  and navigation stay dead. Injecting it into the admin's own
                  document would run somebody's saved markup inside the admin
                  session, which is a door with no reason to exist. */}
              {body.live?.html ? (
                <iframe
                  title="What the message looks like"
                  className="adm-mail-frame"
                  sandbox=""
                  srcDoc={body.live.html}
                />
              ) : (
                <p className="adm-note">
                  This message has no preview yet, so there is nothing to show.
                </p>
              )}

              {/* Both versions exist, so both are readable — otherwise there is
                  no way to see what an edit changed, or what reverting returns
                  you to. */}
              {body.edited && body.original?.html ? (
                <details className="adm-mail-orig">
                  <summary>Show the original, before it was edited</summary>
                  <p className="adm-f-l">Subject</p>
                  <p className="adm-mail-subject">{body.original.subject}</p>
                  <iframe
                    title="The original message"
                    className="adm-mail-frame"
                    sandbox=""
                    srcDoc={body.original.html}
                  />
                </details>
              ) : null}
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
