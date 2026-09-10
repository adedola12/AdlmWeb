// Documents — what the studio produces, what it spends, and what it is set to.
//
// His group is Composer, Templates, Issued, AI usage and System. Two of those
// are absent here rather than present and empty: there is no template store
// (document templates are code, not records), and no register of what has been
// issued — a PDF is generated and sent, and nothing writes down that it
// happened. Both are on the MISSING list in adminNav.js.
//
// AI USAGE IS GROUPED BY FEATURE, NOT BY DAY
//
// The existing screen draws a chart of the last thirty days, which answers
// "are we spending more?" but not "on what?". The thing an administrator can
// actually act on is the feature — Ada, the quiz drafter, the programme
// estimator — because a feature is a thing that can be turned down. So the
// register leads with that, and the people who spent it come second.

import React from "react";
import { Link } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmChip } from "./adminUi.jsx";
import { toneFor } from "./adminKit.jsx";

const money = (n, cur = "NGN") =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: cur || "NGN", maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const usd = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    .format(Number(n) || 0);

const num = (n) => new Intl.NumberFormat("en-NG").format(Number(n) || 0);

const when = (d) =>
  d ? new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

/** A feature key as written in the code, said in words. */
const FEATURE = {
  "programme-outputs": "Programme — gang outputs",
  "course-quiz-draft": "Quiz drafting",
  agent: "Ada",
  "agent-chat": "Ada",
  "ada-chat": "Ada",
  helpbot: "HelpBot (retired)",
  "boq-check": "BoQ check",
};
const featureName = (k) => FEATURE[k] || k || "Unattributed";

const SCREENS = {
  ai: {
    title: "AI usage",
    lede:
      "What the studio spends on AI, by the feature spending it. A feature is something that can " +
      "be turned down; a day on a chart is not.",
    path: "/admin/docs/ai-usage",
    empty: ["Nothing spent", "No AI call has been made in this period."],
    cols: () => [
      { h: "Feature", w: "32%", cell: (f) => featureName(f.name) },
      { h: "Calls", num: true, cell: (f) => num(f.calls) },
      { h: "Tokens in", num: true, cell: (f) => num(f.inTokens) },
      { h: "Tokens out", num: true, cell: (f) => num(f.outTokens) },
      { h: "Cost", num: true, cell: (f) => (f.cost ? usd(f.cost) : <AdmDim>—</AdmDim>) },
    ],
  },

  audit: {
    title: "Audit log",
    lede:
      "What was done in the admin, by whom. A break-glass action taken on the support account is " +
      "marked, because it is not an ordinary one — it can reach any machine with any product.",
    path: "/admin/docs/audit",
    empty: ["Nothing logged", "No admin action has been recorded."],
    cols: () => [
      { h: "Action", w: "24%", cell: (a) => <AdmTwo top={a.action} under={a.path} /> },
      { h: "Who", cell: (a) => <AdmTwo top={a.who} under={a.ip} /> },
      { h: "Against", cell: (a) => a.target || <AdmDim>—</AdmDim> },
      { h: "When", cell: (a) => when(a.at) },
      {
        h: "Result",
        cell: (a) => (
          <>
            <AdmChip tone={a.status >= 400 ? "bad" : "ok"}>{a.status || "—"}</AdmChip>
            {a.god ? <AdmChip tone="due">break-glass</AdmChip> : null}
          </>
        ),
      },
    ],
  },

  produced: {
    // "Saved documents" in his rail, and the same words here — the composer is
    // its own entry now, so two screens called Documents would be two things
    // with one name.
    title: "Saved documents",
    lede:
      "What the composer has made and kept. Quotations are the only document this system stores " +
      "as a record — invoices have their own register, and certificates and receipts are generated " +
      "on demand with nothing written down about it.",
    path: "/admin/docs/produced",
    editHref: "/admin/documents/compose",
    editLabel: "Open the composer",
    empty: ["Nothing produced", "No quotation has been built."],
    cols: () => [
      { h: "Reference", cell: (p) => <AdmTwo top={p.ref} under={p.kind} /> },
      { h: "For", w: "24%", cell: (p) => <AdmTwo top={p.who} under={p.org} /> },
      { h: "Prepared by", cell: (p) => p.by || <AdmDim>—</AdmDim> },
      { h: "Value", num: true, cell: (p) => money(p.total, p.currency) },
      { h: "Built", cell: (p) => when(p.at) },
      { h: "State", cell: (p) => <AdmChip tone={toneFor(p.state)}>{p.state}</AdmChip> },
    ],
  },


  saved: {
    title: "Saved documents",
    lede:
      "What the composer has made and kept. Each one opens back into the composer exactly as it " +
      "was — still editable, block by block — because what is stored is the source, not a picture " +
      "of the finished page.",
    path: "/admin/docs/saved",
    editHref: "/admin/documents/compose",
    editLabel: "Open the composer",
    empty: [
      "Nothing saved yet",
      "Documents written in the composer used to live in one browser. They are kept on the server now, so anything saved from here on appears in this list.",
    ],
    cols: () => [
      { h: "Document", w: "30%", cell: (r) => <AdmTwo top={r.title} under={r.number || r.templateName} /> },
      { h: "To", cell: (r) => r.to || <AdmDim>nobody yet</AdmDim> },
      { h: "On", cell: (r) => r.templateName },
      { h: "Blocks", num: true, cell: (r) => num(r.blocks) },
      { h: "Kept", cell: (r) => <AdmTwo top={when(r.at)} under={r.by} /> },
      {
        h: "",
        cell: (r) =>
          r.sentAt ? (
            <AdmChip tone="ok">sent {when(r.sentAt)}</AdmChip>
          ) : (
            <AdmChip tone="calm">not sent</AdmChip>
          ),
      },
    ],
  },

  issued: {
    title: "Issued",
    lede:
      "Every document that has left the studio, newest first. It answers the question that " +
      "actually gets asked — \"you never sent it\" — and it is assembled from the records that " +
      "already know, rather than a second list somebody has to remember to write.",
    path: "/admin/docs/issued",
    search: "Search by reference, name, firm or address",
    empty: ["Nothing issued", "No invoice, receipt or quotation has been raised."],
    cols: () => [
      { h: "Document", w: "24%", cell: (r) => <AdmTwo top={r.ref || r.kind} under={r.kind} /> },
      { h: "To", w: "26%", cell: (r) => <AdmTwo top={r.to} under={r.org || r.email} /> },
      { h: "Sent", cell: (r) => when(r.on) },
      { h: "For", num: true, cell: (r) => r.worth || <AdmDim>—</AdmDim> },
    ],
  },

  system: {
    title: "System",
    lede:
      "What the site is set to. Each row says what the setting does, because a number with no " +
      "explanation beside it is a number nobody dares change.",
    path: "/admin/docs/system",
    editHref: "/admin/settings",
    editLabel: "Open the settings editor",
    empty: ["No settings", "Nothing is configured."],
    cols: () => [
      { h: "Setting", w: "24%", cell: (s) => s.name },
      { h: "Set to", w: "26%", cell: (s) => <b>{s.value}</b> },
      { h: "What it does", cell: (s) => s.note },
      { h: "", cell: (s) => <AdmChip tone={toneFor(s.state)}>{s.state}</AdmChip> },
    ],
  },
};

export default function DsAdminDocuments({ screen }) {
  const S = SCREENS[screen];
  const { accessToken } = useAuth();
  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    if (!accessToken || !S) return undefined;
    let alive = true;
    setD(null);
    // Debounced only when there is something to debounce. Issued searches the
    // server because it spans three collections — filtering the page in the
    // browser would only search whatever had already been fetched, which is
    // exactly the document somebody is looking for and cannot find.
    const t = setTimeout(
      () => {
        apiAuthed(S.path, { token: accessToken, params: S.search && q ? { q } : {} })
          .then((r) => alive && setD(r))
          .catch(() => alive && setFailed(true));
      },
      S.search && q ? 220 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [accessToken, S, q]);

  // A screen change has to drop the term with it, or Issued's search silently
  // filters a screen that has no search box to clear it from.
  React.useEffect(() => {
    setQ("");
  }, [screen]);

  if (!S) return <p className="adm-note">No such screen.</p>;
  if (failed) {
    return <p className="adm-note">{S.title} could not be loaded just now. Please refresh.</p>;
  }

  const items = d?.items || [];
  const t = d?.totals;

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">{S.title}</h1>
          <p className="adm-lede">{S.lede}</p>
        </div>
        {S.editHref ? (
          <div className="adm-acts">
            <Link className="ds-btn btn-p ds-btn-sm" to={S.editHref}>
              {S.editLabel}
            </Link>
          </div>
        ) : null}
      </div>

      {screen === "ai" && t ? (
        <div className="adm-kpis">
          <div className="adm-kpi">
            <span className="k">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <use href="#ai-ada" />
              </svg>
              <span>Spent, last {d.days} days</span>
            </span>
            <b>{usd(t.cost)}</b>
            <span className="sub">across {num(t.calls)} calls</span>
          </div>
          <div className="adm-kpi">
            <span className="k">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <use href="#hi-doc" />
              </svg>
              <span>Tokens read</span>
            </span>
            <b>{num(t.inTokens)}</b>
            <span className="sub">what was sent to the model</span>
          </div>
          <div className="adm-kpi">
            <span className="k">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <use href="#hi-doc" />
              </svg>
              <span>Tokens written</span>
            </span>
            <b>{num(t.outTokens)}</b>
            <span className="sub">what it wrote back — the expensive half</span>
          </div>
        </div>
      ) : null}

      {S.search ? (
        <label className="adm-find">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={S.search}
            aria-label={S.search}
          />
          {d?.total > (d?.items || []).length ? (
            <span className="adm-f-h">
              Showing {num((d.items || []).length)} of {num(d.total)} — narrow it with a search.
            </span>
          ) : null}
        </label>
      ) : null}

      {!d ? (
        <p className="adm-note">Reading…</p>
      ) : (
        <AdmTable cols={S.cols()} rows={items} rowKey={(r) => r.id} empty={S.empty} />
      )}

      {screen === "ai" && d?.people?.length ? (
        <>
          <div className="adm-pagehead" style={{ marginTop: 28 }}>
            <div>
              <h2 className="adm-h" style={{ fontSize: 20 }}>
                Who spent it
              </h2>
              <p className="adm-lede">
                The same period, by account. Ada answers signed-out visitors too, and those land
                under a single unattributed row rather than being dropped.
              </p>
            </div>
          </div>
          <AdmTable
            cols={[
              { h: "Who", w: "30%", cell: (p) => <AdmTwo top={p.who} under={p.email} /> },
              { h: "Calls", num: true, cell: (p) => num(p.calls) },
              { h: "On what", cell: (p) => p.features.map(featureName).join(" · ") },
              { h: "Cost", num: true, cell: (p) => (p.cost ? usd(p.cost) : <AdmDim>—</AdmDim>) },
            ]}
            rows={d.people}
            rowKey={(p) => p.id}
            empty={["Nobody", "No account has used an AI feature."]}
          />
        </>
      ) : null}
    </>
  );
}
