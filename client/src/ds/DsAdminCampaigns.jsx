// Campaigns — the only mail the studio sends on its own initiative.
//
// The screen is built around the one fact that makes this different from
// every other register in the admin: pressing the last button here reaches
// hundreds of people and cannot be undone. So the order of the row actions is
// the order of the work — read it, test it on yourself, then send — and Send
// stays out of reach until a test has actually gone.
//
// WHAT THE NUMBERS SAY AFTER A SEND
//
// A campaign that reached 40 of 300 is not a failure, it is a fact about
// consent, and hiding it would leave somebody hunting for a bug that is not
// there. So the skipped are shown beside the sent, with the reason.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmChip, AdmFilters } from "./adminUi.jsx";
import { useAdmToast, checkFields } from "./adminKit.jsx";
import { AdmDrawer, AdmFields } from "./adminForm.jsx";

const when = (d) =>
  d
    ? new Date(d).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const num = (n) => new Intl.NumberFormat("en-NG").format(Number(n) || 0);

const TONE = { draft: "calm", sending: "due", sent: "ok", failed: "bad" };

export default function DsAdminCampaigns() {
  const { accessToken } = useAuth();
  const [say, toast] = useAdmToast();

  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [view, setView] = React.useState("all");
  const [reload, setReload] = React.useState(0);
  const [busy, setBusy] = React.useState(false);

  // { mode: "edit" | "read", row, values, errors, preview }
  const [open, setOpen] = React.useState(null);
  const [confirming, setConfirming] = React.useState(null);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    setD(null);
    apiAuthed("/admin/campaigns", { token: accessToken })
      .then((r) => alive && setD(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken, reload]);

  // Derived with useMemo, not as bare `d?.audiences || []`. That expression
  // makes a new array on every render, so the FIELDS memo below would rebuild
  // every time and every select would lose its place mid-typing.
  const audiences = React.useMemo(() => d?.audiences || [], [d]);
  const products = React.useMemo(() => d?.products || [], [d]);

  const FIELDS = React.useMemo(
    () => [
      {
        k: "subject",
        label: "Subject",
        type: "text",
        wide: true,
        required: true,
        reqMsg: "It needs a subject — that is the only part most people will read.",
        hint: "What shows in the inbox. Name the thing: a subject that could be any company's is a wasted one.",
      },
      {
        k: "preheader",
        label: "Preview line",
        type: "text",
        wide: true,
        hint:
          "The grey line beside the subject in an inbox. Leave it empty and the client pulls in " +
          "whatever text comes first, which is rarely what you would have chosen.",
      },
      { k: "heading", label: "Heading", type: "text", wide: true, hint: "Optional, at the top of the message." },
      {
        k: "body",
        label: "What it says",
        type: "textarea",
        wide: true,
        rows: 9,
        required: true,
        reqMsg: "It needs something to say.",
        hint:
          "Plain text. A blank line starts a new paragraph. Markup is not allowed — one bad tag " +
          "would render as garbage in every inbox, and there is no way to take it back.",
      },
      { k: "ctaLabel", label: "Button", type: "text", placeholder: "Read it" },
      {
        k: "ctaHref",
        label: "Button link",
        type: "text",
        placeholder: "https://adlmstudio.net/learn",
        check: (v, all) => {
          if (v && !/^https?:\/\//i.test(v)) return "It needs to start with http:// or https://.";
          if (all.ctaLabel && !v) return "The button has a label but nowhere to go.";
          return null;
        },
      },
      {
        k: "audience",
        label: "Who gets it",
        type: "select",
        wide: true,
        options: audiences.map((a) => [
          a.key,
          a.size == null ? a.name : `${a.name} — ${num(a.size)}`,
        ]),
        hint: audiences.find((a) => a.key === "everyone")
          ? "Counted now. Opted-out and unconfirmed addresses are skipped at send time and reported."
          : "",
      },
      {
        k: "productKey",
        label: "Which product",
        type: "select",
        when: (v) => v.audience === "product",
        required: true,
        options: [["", "Choose one"], ...products.map((p) => [p.key, p.name])],
      },
    ],
    [audiences, products],
  );

  async function write(path, { method = "POST", body, ok } = {}) {
    setBusy(true);
    try {
      const r = await apiAuthed(path, {
        token: accessToken,
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      setReload((n) => n + 1);
      if (ok) say(typeof ok === "function" ? ok(r) : ok);
      return r || true;
    } catch (err) {
      say(
        err?.status === 401
          ? "Your admin session has expired. Sign in again."
          : err?.message || "That did not work.",
      );
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const errs = checkFields(FIELDS, open.values);
    if (Object.keys(errs).length) {
      setOpen((o) => ({ ...o, errors: errs }));
      return;
    }
    const v = open.values;
    const done = open.row
      ? await write(`/admin/campaigns/${open.row.id}`, {
          method: "PUT",
          body: v,
          ok: "Saved.",
        })
      : await write("/admin/campaigns", {
          body: v,
          ok: "Drafted. Send yourself a test before it goes anywhere.",
        });
    if (done) setOpen(null);
  }

  /** Read it as a customer would, and see how many that would be. */
  async function preview(row) {
    setOpen({ mode: "read", row, preview: null });
    try {
      const r = await apiAuthed(`/admin/campaigns/${row.id}/preview`, { token: accessToken });
      setOpen({ mode: "read", row, preview: r });
    } catch (err) {
      setOpen(null);
      say(
        err?.status === 401
          ? "Your admin session has expired. Sign in again."
          : "That could not be previewed.",
      );
    }
  }

  const sendTest = (row) =>
    write(`/admin/campaigns/${row.id}/test`, {
      ok: (r) => `Sent to ${r?.to || "you"}. Read it in a real inbox before sending it to anybody else.`,
    });

  const send = (row) =>
    write(`/admin/campaigns/${row.id}/send`, {
      ok: (r) => `Going out to ${num(r?.started || 0)} now. The figures fill in as it goes.`,
    }).then((r) => {
      if (r) setConfirming(null);
    });

  if (failed) {
    return <p className="adm-note">Campaigns could not be loaded just now. Please refresh.</p>;
  }

  const items = (d?.items || []).filter((c) => view === "all" || c.status === view);
  const counts = d?.counts || {};
  const audienceName = (k) => audiences.find((a) => a.key === k)?.name || k;

  const cols = [
    {
      h: "Message",
      w: "30%",
      cell: (c) => <AdmTwo top={c.subject} under={c.heading || c.preheader || ""} />,
    },
    {
      h: "Who",
      cell: (c) => (
        <AdmTwo
          top={audienceName(c.audience)}
          under={c.audience === "product" ? c.productKey : ""}
        />
      ),
    },
    {
      h: "Reached",
      num: true,
      cell: (c) => {
        if (c.status !== "sent") {
          return <AdmDim>{c.status === "sending" ? "going out" : "not sent"}</AdmDim>;
        }
        const s = c.stats || {};
        const skipped = (s.skippedOptedOut || 0) + (s.skippedUnverified || 0);
        return (
          <AdmTwo
            top={`${num(s.sent)} of ${num(s.audience)}`}
            under={
              skipped
                ? `${num(s.skippedOptedOut || 0)} opted out · ${num(s.skippedUnverified || 0)} unconfirmed`
                : s.failed
                  ? `${num(s.failed)} failed`
                  : "everybody in the audience"
            }
          />
        );
      },
    },
    {
      h: "Tested",
      cell: (c) =>
        c.testSentAt ? (
          <AdmTwo top={when(c.testSentAt)} under={c.testSentTo} />
        ) : (
          // The one thing standing between a draft and an irreversible send.
          <AdmChip tone="due">not yet</AdmChip>
        ),
    },
    { h: "State", cell: (c) => <AdmChip tone={TONE[c.status]}>{c.status}</AdmChip> },
    {
      h: "",
      cell: (c) => {
        if (confirming === c.id) {
          const a = audiences.find((x) => x.key === c.audience);
          return (
            <span className="adm-log">
              <b>Send to {a?.size != null ? num(a.size) : "everyone in"} {audienceName(c.audience)}?</b>
              <span>This cannot be undone.</span>
              <span className="adm-rowacts">
                <button
                  type="button"
                  className="ds-btn btn-p ds-btn-sm"
                  disabled={busy}
                  onClick={() => send(c)}
                >
                  {busy ? "Sending…" : "Yes, send it"}
                </button>
                <button
                  type="button"
                  className="ds-btn btn-o ds-btn-sm"
                  onClick={() => setConfirming(null)}
                >
                  Cancel
                </button>
              </span>
            </span>
          );
        }

        return (
          <span className="adm-rowacts">
            <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => preview(c)}>
              Read it
            </button>

            {c.status === "draft" ? (
              <>
                <button
                  type="button"
                  className="ds-btn btn-o ds-btn-sm"
                  onClick={() =>
                    setOpen({ mode: "edit", row: c, errors: {}, values: { ...c } })
                  }
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="ds-btn btn-o ds-btn-sm"
                  disabled={busy}
                  onClick={() => sendTest(c)}
                >
                  Send me a test
                </button>
                {/* Only reachable once a test has actually gone. The server
                    refuses otherwise; the button says so rather than letting
                    somebody press it and read an error. */}
                <button
                  type="button"
                  className="ds-btn btn-p ds-btn-sm"
                  disabled={!c.testSentAt || busy}
                  title={c.testSentAt ? "" : "Send yourself a test first"}
                  onClick={() => setConfirming(c.id)}
                >
                  Send
                </button>
              </>
            ) : null}
          </span>
        );
      },
    },
  ];

  return (
    <>
      {toast}

      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Campaigns</h1>
          <p className="adm-lede">
            The only mail the studio sends on its own. Everything else answers something a
            customer just did — this goes to hundreds at once and cannot be taken back, so it is
            drafted, read, and tested on you before it goes anywhere.
          </p>
        </div>
        <div className="adm-acts">
          <button
            type="button"
            className="ds-btn btn-p ds-btn-sm"
            onClick={() =>
              setOpen({
                mode: "edit",
                row: null,
                errors: {},
                values: {
                  subject: "",
                  preheader: "",
                  heading: "",
                  body: "",
                  ctaLabel: "",
                  ctaHref: "",
                  audience: "everyone",
                  productKey: "",
                },
              })
            }
          >
            + New campaign
          </button>
        </div>
      </div>

      <AdmFilters
        current={view}
        onPick={setView}
        options={[
          ["all", "Everything", counts.all],
          ["draft", "Drafts", counts.draft],
          ["sent", "Sent", counts.sent],
        ]}
      />

      {!d ? (
        <p className="adm-note">Reading…</p>
      ) : (
        <>
          <AdmTable
            cols={cols}
            rows={items}
            rowKey={(c) => c.id}
            empty={[
              "No campaigns",
              "Nothing has been drafted. A campaign is news or an offer sent to a chosen audience — not a receipt, and not a licence.",
            ]}
          />

          <div className="adm-merge">
            <b>Opting out stops marketing only.</b>
            <span>
              Receipts, licence activations, renewal warnings, password resets and support
              replies ignore it entirely — somebody who left the newsletter has not opted out of
              being told their card was declined. Unconfirmed addresses are skipped too: nobody
              has proved they exist, and mailing them costs sender reputation on a bounce.
            </span>
          </div>
        </>
      )}

      {open?.mode === "edit" ? (
        <AdmDrawer
          title={open.row ? "Edit the campaign" : "New campaign"}
          intro={
            open.row
              ? "Still a draft, so it can still be changed."
              : "Drafted only. Nothing is sent until you have read it in your own inbox and pressed Send."
          }
          onClose={() => setOpen(null)}
          foot={
            <>
              <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => setOpen(null)}>
                Cancel
              </button>
              <button type="button" className="ds-btn btn-p ds-btn-sm" disabled={busy} onClick={save}>
                {busy ? "Saving…" : open.row ? "Save the draft" : "Create the draft"}
              </button>
            </>
          }
        >
          <AdmFields
            fields={FIELDS}
            values={open.values}
            errors={open.errors}
            onChange={(values) => setOpen((o) => ({ ...o, values }))}
          />
        </AdmDrawer>
      ) : null}

      {open?.mode === "read" ? (
        <AdmDrawer
          title={open.row.subject}
          intro={
            open.preview
              ? `As a customer receives it. ${num(open.preview.audience)} would get this.`
              : "Rendering…"
          }
          onClose={() => setOpen(null)}
          foot={
            <button type="button" className="ds-btn btn-p ds-btn-sm" onClick={() => setOpen(null)}>
              Close
            </button>
          }
        >
          {!open.preview ? (
            <p className="adm-note">Rendering…</p>
          ) : (
            <>
              <p className="adm-f-l">Subject</p>
              <p className="adm-mail-subject">{open.preview.subject}</p>
              <p className="adm-f-l">What they read</p>
              {/* Sandboxed, like the Emails reader: it renders as a mail client
                  would show it while scripts and navigation stay dead. */}
              <iframe
                title="The campaign as it will arrive"
                className="adm-mail-frame"
                sandbox=""
                srcDoc={open.preview.html}
              />
            </>
          )}
        </AdmDrawer>
      ) : null}
    </>
  );
}
