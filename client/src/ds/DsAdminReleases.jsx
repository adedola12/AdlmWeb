// Releases — the approver's desk, in his design.
//
// His page (admin-releases.html) is a frame: the shell, the page head, and an
// empty #adm-rel for the content. The lede is his own wording and is kept word
// for word, because it is the whole brief for this screen:
//
//   "Built, and waiting on your pass as the designer before it goes out.
//    Approve it or send it back with a note — either way the answer goes
//    straight back to whoever owns it."
//
// WHAT THIS REPLACES
//
// pages/AdminReleases.jsx, which carried five separate jobs in Tailwind cards.
// All five are here, and nothing may be dropped quietly — losing one of them
// strands him (docs/RELEASE_GATE.md):
//
//   1. the website release batch: per-flow verdicts, approve, send back
//   2. plugin release sign-off: approve to firms, approve to everyone, send back
//   3. the super-admin emergency release, and the flag it raises afterwards
//   4. "Release to everyone", and taking a build back from firms
//   5. what is in flight across ADLM, so a release arrives with its context
//
// Plus the two reference strands that came with it: open pull requests waiting
// on him on GitHub, and the decision history.
//
// WHY THE BATCH IS FETCHED HERE AND NOT INSIDE ITS OWN CARD
//
// The old page mounted components/ReleaseBatchCard.jsx, which fetched
// /admin/releases/batch itself. That card is written in Tailwind — the badges
// are bg-amber-100 and bg-green-100 — so it cannot be mounted inside his
// design without dragging a second visual system onto the screen. The batch is
// rebuilt here in his vocabulary instead, against the same two endpoints and
// with the same three verbs, and the desk fetches both payloads in one pass so
// the count at the top of the page can never disagree with the panel below it.
//
// HIS MARKUP
//
// .adm-pagehead/.adm-h/.adm-lede, .adm-banner, .adm-kpis/.adm-kpi,
// .adm-sec for a section and its explanation, .adm-panel/.adm-panel-h/
// .adm-panel-b for every block, .adm-rule between items inside one panel,
// .adm-jobs/.adm-job for a numbered or linked row, .adm-fs/.adm-f for the
// fields, .adm-acts for the verbs, .adm-chip through toneFor, .adm-none,
// .adm-foot-note, .adm-toast. The table and the chips are the shared kit.
//
// NO BROWSER DIALOGS
//
// His predecessor used window.prompt for the emergency reason and
// window.confirm for the rollout. Both are replaced by an inline panel in his
// grammar: the reason is a textarea that will not submit under the twenty
// characters the server demands, and the rollout asks in place and says what
// it will do before it does it. Nothing reads window during render.

import React from "react";
import { Link } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { seedNotes } from "./releaseNotes.js";
import { AdmChip, AdmTable, AdmTwo, AdmDim } from "./adminUi.jsx";
import { toneFor, useAdmToast } from "./adminKit.jsx";
import { useWorkBoard } from "../features/work/WorkBoard.jsx";

const Icon = ({ id }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <use href={`#${id}`} />
  </svg>
);

const day = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "–";

const stamp = (d) =>
  d
    ? new Date(d).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "–";

// toneFor already knows pending, approved and rejected, and knowing them in
// one place is the point of it. Two release words are not in his table because
// no other screen has them, so they are added here rather than by editing his:
// a superseded build is simply out of date, a forced one is not.
const EXTRA_TONE = { superseded: "calm", emergency: "bad" };
const tone = (word) => toneFor(word) || EXTRA_TONE[String(word || "").toLowerCase()] || "";

// The verdicts the batch offers. The keys and the wording are the server's and
// his test sheet's (docs/RELEASE_GATE.md); only the colour is ours.
const VERDICTS = [
  { key: "works", label: "Works as designed", tone: "ok" },
  { key: "needs-change", label: "Needs change", tone: "due" },
  { key: "could-not-test", label: "Couldn't test", tone: "calm" },
];
const KEEP = [
  { key: "keep", label: "Keep", tone: "ok" },
  { key: "change", label: "Change", tone: "due" },
  { key: "remove", label: "Remove", tone: "bad" },
];
const optionsFor = (item) => (item.kind === "not-in-design" ? KEEP : VERDICTS);

// The work board's own labels. They live in features/work/WorkBoard.jsx beside
// a Tailwind colour map and are not exported, so the words are mirrored here
// and the colours are not — the chips go through toneFor like every other chip
// in the section. If a stage is ever added there and not here, the raw key
// shows rather than nothing.
const STAGE_LABEL = {
  proposed: "Proposed",
  approved: "Approved",
  "in-design": "In design",
  building: "Building",
  testing: "Testing",
  "awaiting-signoff": "Awaiting sign-off",
  shipped: "Shipped",
  "on-hold": "On hold",
  declined: "Declined",
};
const STAGE_TONE = {
  proposed: "due",
  approved: "ok",
  "in-design": "",
  building: "",
  testing: "",
  "awaiting-signoff": "due",
  shipped: "ok",
  "on-hold": "calm",
  declined: "bad",
};
// Mirrors server/util/workBoard.js DESIGN_STATUSES. "not-needed" was missing,
// so an item explicitly marked as needing no design rendered as a dash — the
// same as one nobody had looked at.
const DESIGN_LABEL = {
  "not-needed": "No design needed",
  needed: "Design needed",
  "in-progress": "Being designed",
  ready: "Design ready",
  adopted: "Design adopted",
};

/** The version a candidate moves the product from and to. */
function version(c) {
  return (
    <>
      {c.displayName || c.productKey}{" "}
      <span className="adm-dim">
        {c.fromVersion ? `v${c.fromVersion}` : "new"} → v{c.toVersion || "?"}
      </span>
    </>
  );
}

/** A numbered list of steps, in his row grammar. */
function Steps({ steps }) {
  if (!steps?.length) return null;
  return (
    <ul className="adm-jobs">
      {steps.map((s, i) => (
        <li key={`${i}-${s}`}>
          <div className="adm-job">
            <span className="adm-job-n">{i + 1}</span>
            <span className="adm-job-t">
              <b>{s}</b>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Release notes, as the lines they were written as.
 *
 * Folded away by default: on a quiet release they are one line, and on a big
 * one they are forty, and forty lines of notes between him and the Approve
 * button is the reason the old card was hard to work down.
 */
function Notes({ text }) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return null;
  return (
    <details className="adm-rules">
      <summary>
        Release notes ({lines.length} line{lines.length === 1 ? "" : "s"})
      </summary>
      <ul>
        {lines.map((l, i) => (
          <li key={`${i}-${l}`}>{l}</li>
        ))}
      </ul>
    </details>
  );
}

/** One field, his: a label over its input. */
function Field({ label, hint, value, onChange, placeholder, rows }) {
  return (
    <label className="adm-f wide">
      <span className="adm-f-l">{label}</span>
      {rows ? (
        <textarea rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint ? <span className="adm-f-h">{hint}</span> : null}
    </label>
  );
}

/* ───────────────────────────────────────────────────────── what is in flight */

/**
 * Everything being worked on, so a release arrives with its context.
 *
 * The compact strip on the old page (features/work/WorkBoard.jsx ->
 * WorkInFlight) in his table instead. Its hook is reused unchanged, so this
 * reads the same /admin/work payload and cannot drift from the board itself.
 */
function InFlight() {
  const { data, error } = useWorkBoard();

  const rows = React.useMemo(() => {
    const live = (data?.items || []).filter((i) => !["shipped", "declined"].includes(i.stage));
    const labels = data?.options?.productLabels || {};
    return live.map((i) => ({
      ...i,
      products: (i.products || []).map((p) => labels[p] || p).join(" · "),
    }));
  }, [data]);

  const waiting = rows.filter((i) => i.decision?.status === "pending").length;

  const cols = [
    {
      h: "Item",
      w: "44%",
      cell: (i) => (
        <AdmTwo
          top={i.title}
          under={i.blockedOn ? `Waiting on: ${i.blockedOn}` : i.pending ? `Next: ${i.pending}` : ""}
        />
      ),
    },
    { h: "Product", w: "20%", cell: (i) => i.products || <AdmDim>platform</AdmDim> },
    {
      h: "Stage",
      cell: (i) => <AdmChip tone={STAGE_TONE[i.stage] ?? ""}>{STAGE_LABEL[i.stage] || i.stage}</AdmChip>,
    },
    {
      h: "Design",
      cell: (i) =>
        i.design?.status ? (
          <AdmChip>{DESIGN_LABEL[i.design.status] || i.design.status}</AdmChip>
        ) : (
          <AdmDim>–</AdmDim>
        ),
    },
    {
      h: "Decision",
      cell: (i) =>
        i.decision?.status === "pending" ? <AdmChip tone="due">Needs you</AdmChip> : <AdmDim>–</AdmDim>,
    },
  ];

  return (
    <section className="adm-panel">
      <div className="adm-panel-h">
        <h2>What is being worked on across ADLM</h2>
        <span className="note">
          {error ? "the board could not be read" : `${waiting} waiting on a decision`}
        </span>
      </div>
      <div className="adm-panel-b">
        {error ? (
          <p className="adm-note adm-bad">{error}</p>
        ) : !data ? (
          <p className="adm-note">Reading the work board…</p>
        ) : (
          <>
            <AdmTable
              cols={cols}
              rows={rows}
              rowKey={(i) => i._id}
              href={(i) => `/admin/work#${i._id}`}
              empty={["Nothing in flight", "Every proposal is either shipped or declined."]}
            />
            <p className="adm-note">
              A new feature or button is proposed on the board with its business case first, and
              nothing is designed or built until it is approved there. A row opens it.
            </p>
            <div className="adm-acts">
              <Link className="ds-btn btn-o ds-btn-sm" to="/admin/work">
                Open the work board
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────── the screen */

export default function DsAdminReleases() {
  const { accessToken } = useAuth();
  const [d, setD] = React.useState(null);
  const [b, setB] = React.useState(null);
  const [deskError, setDeskError] = React.useState("");
  const [batchError, setBatchError] = React.useState("");
  // The last action that did not go through. Held rather than toasted: every
  // button here is irreversible and useAdmToast clears after 4.6 seconds.
  const [actionError, setActionError] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [notes, setNotes] = React.useState({});
  // Candidate id -> true when this build should go to everyone at once.
  const [hotfix, setHotfix] = React.useState({});
  // The one thing being asked about, so a second question cannot open behind
  // the first: { id, kind } where kind is "emergency" or "everyone".
  const [ask, setAsk] = React.useState(null);
  const [reason, setReason] = React.useState("");
  const [say, toast] = useAdmToast();

  const load = React.useCallback(async () => {
    if (!accessToken) return;
    // Settled, not all: the GitHub list and the batch are separate services,
    // and one of them being down must not blank the desk. Each failure is
    // reported where that strand would have been.
    const [desk, batch] = await Promise.allSettled([
      apiAuthed("/admin/releases", { token: accessToken }),
      apiAuthed("/admin/releases/batch", { token: accessToken }),
    ]);
    if (desk.status === "fulfilled") {
      setD(desk.value);
      setDeskError("");
    } else {
      setDeskError(desk.reason?.message || "The release desk could not be read.");
    }
    if (batch.status === "fulfilled") {
      setB(batch.value);
      setBatchError("");
      // His own notes, back in their boxes. See ds/releaseNotes.js: without
      // this a stored note is invisible AND the next verdict overwrites it.
      setNotes((n) => seedNotes(n, batch.value?.batch?.items));
    } else {
      setBatchError(batch.reason?.message || "This release could not be read.");
    }
  }, [accessToken]);

  React.useEffect(() => {
    load();
  }, [load]);

  /**
   * Every verb on this screen is one POST.
   *
   * MOST of them then reload, because they change what the whole desk says. A
   * VERDICT does not: it changes one row, and reloading for it is what made
   * this screen unpleasant to use. Richard, testing batch 2 on 30 September,
   * had to wait after every answer and watched the page refresh each time —
   * eleven flows, eleven refreshes. The fix for that was written against the
   * old card (PR #89) and never reached him, because this screen replaced the
   * card before it merged. So it is done here instead.
   *
   * `patch` is applied to local state the moment the server says yes, and no
   * reload follows. It is not optimistic — nothing moves until the POST
   * returns — so a refused verdict still shows the error and leaves the row
   * exactly as it was.
   */
  const act = React.useCallback(
    async (path, body, told, patch) => {
      if (busy) return;
      setActionError("");
      setBusy(path);
      try {
        const r = await apiAuthed(path, { token: accessToken, method: "POST", body });
        setAsk(null);
        setReason("");
        if (patch) {
          // One row, in place. The note box is deliberately left alone: what
          // he typed IS the stored note now, and emptying it would hide what
          // he just recorded and send "" with his next verdict on that row.
          setB((prev) =>
            prev?.batch
              ? {
                  ...prev,
                  batch: {
                    ...prev.batch,
                    items: (prev.batch.items || []).map((it) =>
                      it.key === patch.key ? { ...it, ...patch.set } : it,
                    ),
                  },
                }
              : prev,
          );
        } else {
          await load();
        }
        say(r?.message || told);
      } catch (e) {
        const msg = e?.message || "That did not go through. Nothing was changed.";
        setActionError(msg);
        say(msg);
      } finally {
        setBusy("");
      }
    },
    [accessToken, busy, load, say],
  );

  const you = d?.you || {};
  const approver = d?.approver || {};
  const rule = d?.rolloutRule || { seatsMoreThan: 5, months: 3 };
  const pending = d?.pending || [];
  const awaitingReview = d?.awaitingReview || [];
  const rollouts = d?.rollouts || [];
  const pulls = d?.code?.pulls || [];
  const recent = d?.recent || [];
  const note = (id) => notes[id] || "";
  const setNote = (id, v) => setNotes((n) => ({ ...n, [id]: v }));
  const isHotfix = (c) => hotfix[c._id] ?? c.rollout === "everyone";

  const batch = b?.batch;
  const flows = (batch?.items || []).filter((i) => i.kind !== "behind-the-scenes");
  const behind = (batch?.items || []).filter((i) => i.kind === "behind-the-scenes");
  const marked = flows.filter((i) => i.verdict).length;
  // Once approved there is nothing left for him to do on it: the verdicts are
  // recorded, the merge happens off the back of it, and leaving the flows and
  // the Approve button on screen invites a second press on a decision already
  // taken. It collapses to a line saying who approved it and when.
  const batchSettled = batch?.status === "approved" || batch?.status === "merged";
  const canDecideBatch = Boolean(b?.isApprover && batch && !batchSettled);
  const readyForEveryone = rollouts.filter((r) => r.canReleaseToEveryone).length;

  // Four counts, each one a length of something the server sent. A strand that
  // could not be read shows a dash rather than a nought, because none of these
  // is a measurement — "nothing is waiting" and "we could not ask" are
  // different answers and a zero would tell him the wrong one.
  const KPIS = [
    {
      k: "This release",
      ic: "hi-check",
      v: batchError ? "–" : String(flows.length),
      sub: batch
        ? `${marked} of ${flows.length} marked${batch.sheetUrl ? ", test sheet attached" : ""}`
        : batchError || "nothing is waiting to be tested",
      warn: Boolean(batch) && marked < flows.length,
    },
    {
      k: "Builds waiting",
      ic: "hi-downloads",
      v: deskError ? "–" : String(pending.length),
      sub: "plugin versions needing your pass",
      warn: pending.length > 0,
    },
    {
      k: "With firms only",
      ic: "hi-team",
      v: deskError ? "–" : String(rollouts.length),
      sub: deskError ? "could not be read" : `${readyForEveryone} ready for everyone`,
    },
    {
      k: "Forced without sign-off",
      ic: "hi-alert",
      v: deskError ? "–" : String(awaitingReview.length),
      sub: "emergency releases to review",
      warn: awaitingReview.length > 0,
    },
  ];

  const historyCols = [
    { h: "Release", w: "30%", cell: (c) => version(c) },
    {
      h: "Status",
      cell: (c) => (
        <>
          <AdmChip tone={tone(c.status)}>{c.status}</AdmChip>
          {c.appliedTo ? (
            <span className="adm-hintline">{c.appliedTo === "everyone" ? "to everyone" : "to firms first"}</span>
          ) : null}
          {c.reviewVerdict ? <span className="adm-hintline">review {c.reviewVerdict}</span> : null}
        </>
      ),
    },
    { h: "Decided by", cell: (c) => c.decidedBy || <AdmDim>–</AdmDim> },
    { h: "When", cell: (c) => stamp(c.decidedAt) },
    { h: "Note", w: "26%", cell: (c) => c.emergencyReason || c.decisionNote || <AdmDim>–</AdmDim> },
  ];

  return (
    <>
      {/* Held where he will see it: a verdict row can be scrolled well off
          screen by the time the server answers. */}
      {actionError ? (
        <div className="adm-banner adm-bad" role="alert">
          <p className="adm-note adm-bad">{actionError}</p>
          <button type="button" className="ds-btn ds-btn-sm btn-o" onClick={() => setActionError("")}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Releases</h1>
          <p className="adm-lede">
            Built, and waiting on your pass as the designer before it goes out. Approve it or send
            it back with a note — either way the answer goes straight back to whoever owns it.
          </p>
        </div>
        {/* His pagehead action slot. The desk reloads itself after every
            verdict, so this is only for the case the old page's Refresh
            button was really for: a build submitted while you sat here. */}
        <div id="adm-page-acts">
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            disabled={Boolean(busy)}
            onClick={() => load()}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="adm-banner">
        <span className="ic">
          <Icon id="hi-shield" />
        </span>
        <span>
          <b>
            {approver.email
              ? `Release approver: ${approver.name || approver.email} (${approver.email})`
              : "No release approver is named"}
          </b>
          <p>
            {!approver.email ? (
              <span className="adm-warn">
                Nothing can be signed off until one is named, so every release is blocked.
              </span>
            ) : you.isApprover ? (
              "You are the approver. A waiting build is offered to you in your own Installer Hub so you can install and try it before approving, and website changes can be tried at preview.adlmstudio.net."
            ) : (
              "Only the approver can approve, and nobody can approve a release they submitted themselves. You can read everything here."
            )}
          </p>
        </span>
      </div>

      {deskError ? <p className="adm-note adm-bad">{deskError}</p> : null}

      <div className="adm-kpis">
        {KPIS.map((s) => (
          <div key={s.k} className={`adm-kpi${s.warn ? " warn" : ""}`}>
            <span className="k">
              <Icon id={s.ic} />
              <span>{s.k}</span>
            </span>
            <b>{s.v}</b>
            <span className="ds-sub">{s.sub}</span>
          </div>
        ))}
      </div>

      {/* 1 ─ the batch: the whole of his release job, and the only thing on
             this screen he has to work down in order. */}
      <div className="adm-sec">
        <h2>This release</h2>
        <p>
          Try each thing on{" "}
          <a href="https://preview.adlmstudio.net" target="_blank" rel="noreferrer">
            preview.adlmstudio.net
          </a>{" "}
          and in your Installer Hub, say how each one went, then approve. Approving is what sends
          it to customers.
        </p>
      </div>

      {batchError ? (
        <p className="adm-note adm-bad">{batchError}</p>
      ) : !b ? (
        <p className="adm-note">Reading this release…</p>
      ) : !batch ? (
        <div className="adm-none">
          <b>Nothing is waiting to be tested</b>
          <span>You will be told when the next batch is ready, and it will appear here.</span>
        </div>
      ) : (
        <section className="adm-panel">
          <div className="adm-panel-h">
            <h2>{batch.title}</h2>
            <span className="note">
              {batch.status === "approved" ? (
                <AdmChip tone="ok">approved, going live</AdmChip>
              ) : batch.status === "changes-requested" ? (
                <AdmChip tone="due">sent back</AdmChip>
              ) : (
                <AdmChip tone={tone(batch.status)}>{batch.status}</AdmChip>
              )}
            </span>
          </div>
          <div className="adm-panel-b">
            {batch.sheetUrl ? (
              <div className="adm-acts">
                <a className="ds-btn btn-o ds-btn-sm" href={batch.sheetUrl} target="_blank" rel="noreferrer">
                  Open the test sheet
                </a>
              </div>
            ) : null}

            {/* Gone once he has approved. He asked for this: having pressed
                "Approve and send to customers" he does not want to scroll back
                through the flows he has just signed off, and the buttons
                beneath them invite a second press on a decision already
                taken. The confirmation line at the foot is the whole card
                from here on; the detail is still on the sheet he tested from. */}
            {!batchSettled && flows.map((item) => {
              const opts = optionsFor(item);
              const chosen = opts.find((o) => o.key === item.verdict);
              const key = `item:${item.key}`;
              return (
                <React.Fragment key={item.key}>
                  <div className="adm-rule" />
                  {/* .adm-job-t styles its own b and span, so it carries a
                      title over its one-line "where" outside a .adm-job row
                      too. A div, not his span: without the grid parent an
                      inline box with block children lays out wrongly. */}
                  <div className="adm-job-t">
                    <b>{item.title}</b>
                    {item.where ? <span>Where: {item.where}</span> : null}
                  </div>
                  <Steps steps={item.steps} />
                  {item.designUrl ? (
                    <p className="adm-note">
                      <a href={item.designUrl} target="_blank" rel="noreferrer">
                        Open your design to compare
                      </a>
                    </p>
                  ) : null}
                  {canDecideBatch ? (
                    <div className="adm-fs">
                      <Field
                        label="Note"
                        hint="What should change? Sent back with your verdict."
                        value={note(key)}
                        onChange={(v) => setNote(key, v)}
                        placeholder="Optional"
                      />
                      <div className="adm-acts">
                        {opts.map((o) => (
                          <button
                            key={o.key}
                            type="button"
                            className={`ds-btn ds-btn-sm ${item.verdict === o.key ? "btn-p" : "btn-o"}`}
                            disabled={Boolean(busy)}
                            onClick={() =>
                              act(
                                `/admin/releases/batch/${batch._id}/verdict`,
                                { key: item.key, verdict: o.key, note: note(key) },
                                `${item.title}: ${o.label.toLowerCase()}.`,
                                { key: item.key, set: { verdict: o.key, note: note(key) } },
                              )
                            }
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : chosen ? (
                    <p className="adm-note">
                      <AdmChip tone={chosen.tone}>{chosen.label}</AdmChip>
                      {item.note ? ` ${item.note}` : ""}
                    </p>
                  ) : (
                    <p className="adm-note">Not marked.</p>
                  )}
                </React.Fragment>
              );
            })}

            {behind.length > 0 && (
              <>
                <div className="adm-rule" />
                <details className="adm-rules">
                  <summary>Fixed behind the scenes — nothing to test ({behind.length})</summary>
                  <ul>
                    {behind.map((i) => (
                      <li key={i.key}>{i.title}</li>
                    ))}
                  </ul>
                </details>
              </>
            )}

            {canDecideBatch && (
              <>
                <div className="adm-rule" />
                <div className="adm-fs">
                  <Field
                    label="Anything to add"
                    hint="Required if you send it back. It goes straight to whoever owns the work."
                    value={note("batch")}
                    onChange={(v) => setNote("batch", v)}
                    placeholder="Optional when approving"
                  />
                  <div className="adm-acts">
                    <button
                      type="button"
                      className="ds-btn btn-p ds-btn-sm"
                      disabled={Boolean(busy)}
                      onClick={() =>
                        act(
                          `/admin/releases/batch/${batch._id}/approve`,
                          { note: note("batch") },
                          "Approved. It is on its way to customers.",
                          "batch",
                        )
                      }
                    >
                      Approve and send to customers
                    </button>
                    <button
                      type="button"
                      className="ds-btn btn-o ds-btn-sm adm-danger"
                      disabled={Boolean(busy)}
                      onClick={() =>
                        act(
                          `/admin/releases/batch/${batch._id}/reject`,
                          { note: note("batch") },
                          "Sent back with your note.",
                          "batch",
                        )
                      }
                    >
                      Send back for changes
                    </button>
                  </div>
                  {marked < flows.length ? (
                    <p className="adm-note">
                      {flows.length - marked} of {flows.length} not marked yet — you can still
                      approve.
                    </p>
                  ) : null}
                </div>
              </>
            )}

            {batchSettled ? (
              <p className="adm-note">
                {batch.status === "merged" ? "Live" : "Approved"} by {batch.approvedBy} on{" "}
                {stamp(batch.approvedAt)}. Nothing else to do.
              </p>
            ) : null}
          </div>
        </section>
      )}

      {/* 2 ─ an emergency release that went out without him, still flagged. */}
      {awaitingReview.length > 0 && (
        <>
          <div className="adm-sec">
            <h2>Shipped without sign-off</h2>
            <p>
              A super-admin forced these out. Each one is already with customers, is in the locked
              audit log, and stays flagged here until you have had your say.
            </p>
          </div>
          {awaitingReview.map((c) => {
            const overdue = c.reviewDueAt && new Date(c.reviewDueAt) < new Date();
            return (
              <section className="adm-panel" key={c._id}>
                <div className="adm-panel-h">
                  <h2>{version(c)}</h2>
                  <span className="note">
                    <AdmChip tone="bad">emergency</AdmChip>
                    {overdue ? <AdmChip tone="bad">review overdue</AdmChip> : null}
                  </span>
                </div>
                <div className="adm-panel-b">
                  <p className="adm-note">
                    Forced by {c.decidedBy} on {stamp(c.decidedAt)}. Their reason:{" "}
                    <em>{c.emergencyReason}</em>
                  </p>
                  {you.isApprover ? (
                    <div className="adm-fs">
                      <Field
                        label="Your note"
                        hint="Required to object. Recorded against the release for good."
                        value={note(c._id)}
                        onChange={(v) => setNote(c._id, v)}
                        placeholder="What you make of it"
                      />
                      <div className="adm-acts">
                        <button
                          type="button"
                          className="ds-btn btn-o ds-btn-sm"
                          disabled={Boolean(busy)}
                          onClick={() =>
                            act(
                              `/admin/releases/${c._id}/review`,
                              { verdict: "upheld", note: note(c._id) },
                              "Upheld. The flag is cleared.",
                              c._id,
                            )
                          }
                        >
                          Uphold it
                        </button>
                        <button
                          type="button"
                          className="ds-btn btn-o ds-btn-sm adm-danger"
                          disabled={Boolean(busy)}
                          onClick={() =>
                            act(
                              `/admin/releases/${c._id}/review`,
                              { verdict: "objected", note: note(c._id) },
                              "Objection recorded.",
                              c._id,
                            )
                          }
                        >
                          Object
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </>
      )}

      {/* 3 ─ plugin builds, one panel each. */}
      <div className="adm-sec">
        <h2>Plugin builds waiting for sign-off</h2>
        <p>
          No update reaches a customer's machine until this is signed off. Approved, it goes to
          firms with more than {rule.seatsMoreThan} seats first; everyone else can have it{" "}
          {rule.months} months later, or at once if you mark it a hotfix.
        </p>
      </div>

      {!d ? (
        <p className="adm-note">Reading the desk…</p>
      ) : !pending.length ? (
        <div className="adm-none">
          <b>Nothing is waiting</b>
          <span>A build appears here the moment it is submitted, and you are told about it.</span>
        </div>
      ) : (
        pending.map((c) => (
          <section className="adm-panel" key={c._id}>
            <div className="adm-panel-h">
              <h2>{version(c)}</h2>
              <span className="note">
                <AdmChip tone={tone("pending")}>pending</AdmChip>
              </span>
            </div>
            <div className="adm-panel-b">
              <span className="adm-meta">
                <span>Submitted by {c.submittedBy || "–"}</span>
                <span>{stamp(c.submittedAt)}</span>
                {c.payload?.sha256 ? <span>sha256 {c.payload.sha256}</span> : null}
              </span>
              <Notes text={c.notifyBody?.releaseNotes} />

              <div className="adm-fs">
                <label className="adm-f check">
                  <input
                    type="checkbox"
                    checked={isHotfix(c)}
                    disabled={!you.isApprover || Boolean(busy)}
                    onChange={(e) => setHotfix((h) => ({ ...h, [c._id]: e.target.checked }))}
                  />
                  <span className="adm-f-l">Hotfix: release to everyone at once</span>
                  <span className="adm-f-h">
                    {isHotfix(c)
                      ? "Every customer gets it as soon as you approve."
                      : `Left off, it goes to firms with more than ${rule.seatsMoreThan} seats; everyone else can have it ${rule.months} months later.`}
                  </span>
                </label>

                {you.isApprover ? (
                  <>
                    <Field
                      label="Note"
                      hint="Required to send it back. It reaches whoever submitted the build."
                      value={note(c._id)}
                      onChange={(v) => setNote(c._id, v)}
                      placeholder="Optional when approving"
                    />
                    <div className="adm-acts">
                      <button
                        type="button"
                        className="ds-btn btn-p ds-btn-sm"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          act(
                            `/admin/releases/${c._id}/approve`,
                            {
                              note: note(c._id),
                              rollout: isHotfix(c) ? "everyone" : "organizations",
                            },
                            isHotfix(c) ? "Approved, and out to everyone." : "Approved, and out to firms.",
                            c._id,
                          )
                        }
                      >
                        {isHotfix(c) ? "Approve and release to everyone" : "Approve and release to firms"}
                      </button>
                      <button
                        type="button"
                        className="ds-btn btn-o ds-btn-sm adm-danger"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          act(
                            `/admin/releases/${c._id}/reject`,
                            { note: note(c._id) },
                            "Sent back with your note.",
                            c._id,
                          )
                        }
                      >
                        Send back
                      </button>
                    </div>
                  </>
                ) : null}

                {/* The super-admin's break-glass. Deliberately the quiet
                    button on the panel, and deliberately two steps: it ships
                    to customers without his pass. */}
                {you.canEmergency ? (
                  ask?.kind === "emergency" && ask.id === c._id ? (
                    <>
                      <Field
                        label="Why this cannot wait"
                        rows={3}
                        hint={`At least 20 characters — ${reason.trim().length} so far. ${
                          approver.name || "The approver"
                        } is emailed with your name and this reason, it is written to the locked audit log, and the release stays flagged until they review it.`}
                        value={reason}
                        onChange={setReason}
                        placeholder="What is broken, and who it is breaking it for"
                      />
                      <div className="adm-acts">
                        <button
                          type="button"
                          className="ds-btn btn-o ds-btn-sm adm-danger"
                          disabled={Boolean(busy) || reason.trim().length < 20}
                          onClick={() =>
                            act(
                              `/admin/releases/${c._id}/emergency`,
                              { reason: reason.trim() },
                              "Forced out. The approver has been emailed.",
                            )
                          }
                        >
                          Ship {c.displayName || c.productKey} v{c.toVersion} without sign-off
                        </button>
                        <button
                          type="button"
                          className="ds-btn btn-o ds-btn-sm adm-quiet"
                          disabled={Boolean(busy)}
                          onClick={() => {
                            setAsk(null);
                            setReason("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="adm-acts">
                      <button
                        type="button"
                        className="ds-btn btn-o ds-btn-sm adm-quiet"
                        disabled={Boolean(busy)}
                        onClick={() => {
                          setAsk({ id: c._id, kind: "emergency" });
                          setReason("");
                        }}
                      >
                        Emergency release…
                      </button>
                    </div>
                  )
                ) : null}
              </div>
            </div>
          </section>
        ))
      )}

      {/* 4 ─ with firms, waiting for everyone. */}
      <div className="adm-sec">
        <h2>With firms, waiting for everyone</h2>
        <p>
          Firms with more than {rule.seatsMoreThan} seats, counted across all their products, get a
          build first. Everyone else stays on the previous one until you release it to them, which
          you can do {rule.months} months after it first went to firms.
          {d?.earlyFirms?.length ? ` Firms that go first today: ${d.earlyFirms.join(", ")}.` : ""}
        </p>
      </div>

      {d?.rolloutError ? <p className="adm-note adm-bad">{d.rolloutError}</p> : null}

      {!d ? null : !rollouts.length ? (
        <div className="adm-none">
          <b>Nothing is with firms only</b>
          <span>Every approved build has reached everyone, or none has gone out yet.</span>
        </div>
      ) : (
        rollouts.map((r) => {
          const id = `rollouts/${r.productKey}`;
          return (
            <section className="adm-panel" key={r.productKey}>
              <div className="adm-panel-h">
                <h2>
                  {r.displayName}{" "}
                  <span className="adm-dim">
                    firms v{r.earlyVersion} · everyone else v{r.generalVersion || "–"}
                  </span>
                </h2>
                <span className="note">
                  <AdmChip tone={r.canReleaseToEveryone ? "go" : ""}>
                    {r.canReleaseToEveryone ? "ready for everyone" : `everyone from ${day(r.unlocksAt)}`}
                  </AdmChip>
                </span>
              </div>
              <div className="adm-panel-b">
                <span className="adm-meta">
                  <span>With firms since {day(r.startedAt)}</span>
                  {r.firstVersion && r.firstVersion !== r.earlyVersion ? (
                    <span>from v{r.firstVersion}</span>
                  ) : null}
                  <span>approved by {r.approvedBy || "–"}</span>
                  <span>{stamp(r.approvedAt)}</span>
                </span>

                {you.isApprover ? (
                  <div className="adm-fs">
                    {ask?.kind === "everyone" && ask.id === id ? (
                      <>
                        <p className="adm-note">
                          Single users move from v{r.generalVersion || "–"} to v{r.earlyVersion} and
                          are emailed. This cannot be undone from here.
                        </p>
                        <div className="adm-acts">
                          <button
                            type="button"
                            className="ds-btn btn-p ds-btn-sm"
                            disabled={Boolean(busy)}
                            onClick={() =>
                              act(
                                `/admin/releases/${id}/everyone`,
                                {},
                                `${r.displayName} v${r.earlyVersion} is with everyone.`,
                              )
                            }
                          >
                            Yes, release v{r.earlyVersion} to everyone
                          </button>
                          <button
                            type="button"
                            className="ds-btn btn-o ds-btn-sm adm-quiet"
                            disabled={Boolean(busy)}
                            onClick={() => setAsk(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="adm-acts">
                        <button
                          type="button"
                          className="ds-btn btn-p ds-btn-sm"
                          disabled={Boolean(busy) || !r.canReleaseToEveryone}
                          title={r.canReleaseToEveryone ? undefined : `Unlocks on ${day(r.unlocksAt)}`}
                          onClick={() => setAsk({ id, kind: "everyone" })}
                        >
                          Release to everyone
                        </button>
                      </div>
                    )}

                    <Field
                      label="Why take it back?"
                      hint="Required. Firms drop to the previous build."
                      value={note(id)}
                      onChange={(v) => setNote(id, v)}
                      placeholder="What went wrong with it"
                    />
                    <div className="adm-acts">
                      <button
                        type="button"
                        className="ds-btn btn-o ds-btn-sm adm-danger"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          act(
                            `/admin/releases/${id}/withdraw`,
                            { note: note(id) },
                            `${r.displayName} taken back from firms.`,
                            id,
                          )
                        }
                      >
                        Take back from firms
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          );
        })
      )}

      {/* 5 ─ the code side, which he signs off on GitHub rather than here. */}
      <div className="adm-sec">
        <h2>Website, API and service changes</h2>
        <p>
          These cannot merge until {approver.name || "the approver"} approves the pull request on
          GitHub. Try a website change first at{" "}
          <a href="https://preview.adlmstudio.net" target="_blank" rel="noreferrer">
            preview.adlmstudio.net
          </a>
          .
        </p>
      </div>

      <section className="adm-panel">
        <div className="adm-panel-h">
          <h2>Open pull requests</h2>
          <span className="note">Signed off on GitHub</span>
        </div>
        <div className="adm-panel-b">
          {d?.code?.error ? <p className="adm-note adm-bad">{d.code.error}</p> : null}
          {!d ? (
            <p className="adm-note">Asking GitHub…</p>
          ) : !pulls.length ? (
            <p className="adm-note">No open pull requests.</p>
          ) : (
            <ul className="adm-jobs">
              {pulls.map((p) => (
                <li key={`${p.repo}#${p.number}`}>
                  <a
                    className="adm-job"
                    href={p.state === "waiting" ? `${p.url}/files` : p.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="adm-job-n">#{p.number}</span>
                    <span className="adm-job-t">
                      <b>{p.title}</b>
                      <span>
                        {p.label} · by {p.author}
                        {p.draft ? " · draft" : ""} · opened {stamp(p.createdAt)}
                        {you.isApprover && p.state === "waiting" ? " · opens the files to review" : ""}
                      </span>
                    </span>
                    <AdmChip
                      tone={tone(
                        p.state === "approved" ? "approved" : p.state === "changes_requested" ? "rejected" : "pending",
                      )}
                    >
                      {p.state === "approved"
                        ? "approved"
                        : p.state === "changes_requested"
                          ? "changes asked"
                          : "waiting"}
                    </AdmChip>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* 6 ─ context: everything in flight, so a release is not read alone. */}
      <div className="adm-sec">
        <h2>Around this release</h2>
        <p>Where every piece of work stands, so a build arrives with the reason it exists.</p>
      </div>
      <InFlight />

      {/* 7 ─ what was decided, and by whom. */}
      <div className="adm-sec">
        <h2>Decided</h2>
        <p>The last fifty decisions. Nothing here can be changed from this screen.</p>
      </div>
      <section className="adm-panel">
        <div className="adm-panel-h">
          <h2>History</h2>
          <span className="note">{recent.length ? `${recent.length} decisions` : "nothing yet"}</span>
        </div>
        <div className="adm-panel-b">
          <AdmTable
            cols={historyCols}
            rows={recent}
            rowKey={(c) => c._id}
            empty={["No decisions yet", "Every approval, rejection and forced release is kept here."]}
          />
        </div>
      </section>

      <p className="adm-foot-note">
        Approving is what sends a build to customers; there is no un-approve. A build that is out
        is pulled back with "take back from firms", or by shipping a newer one — not by undoing a
        decision on this page. Every verdict, note and forced release is written against your name
        and kept.
      </p>

      {toast}
    </>
  );
}
