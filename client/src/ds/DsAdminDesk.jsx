// Your desk — one queue for everything waiting on the approver.
//
// Why this exists
// ---------------
// /admin/work and /admin/releases both work. Neither was being used. Richard
// opened them, found too many words and too many sections to decode, and went
// back to approving things on GitHub — the process those pages were built to
// replace. In his words: "it's like cognitive overload and too many words or
// descriptions, so I can hardly tell or understand what is what."
//
// Reading both pages, the fault is the same on each: they are written as
// documentation of the release policy rather than as work waiting for
// somebody. /admin/releases opens with an approver card, a paragraph on the
// 22 September rule, a paragraph on rollout, and the whole work board embedded
// in the middle, before anything you can act on. He wrote that policy. He does
// not need it explained back; he needs to be asked a question.
//
// Nothing about the gate changes here. Same models, same routes, same rules,
// same audit trail. What changes is how it asks.
//
// Three rules this screen keeps to:
//
//   1. One place. From where he sits there is one question — what needs me —
//      so there is one queue, and ideas, website batches, plugin builds,
//      gated settings and emergency reviews are all rows in it.
//   2. A table, and a verb. Every row says what it is and what he has to do in
//      his words: "Waiting for you", never "awaiting-signoff"; "Approve or
//      decline", never "pending".
//   3. Nothing on the first screen he cannot act on. History, rollouts and
//      what is in flight are real and needed, and they are behind a tab.
//
// It adds no endpoint. It merges three GETs the server already serves and
// posts to the routes that already exist.
import React from "react";
import { apiAuthed } from "../api.js";
import { AdmChip, AdmTable, AdmTwo, AdmDim, AdmFilters } from "./adminUi.jsx";
import { useAdmToast } from "./adminKit.jsx";
import { AdmDrawer } from "./adminForm.jsx";
import "../styles/ds-desk.css";

/* ------------------------------------------------------------ his words */

const PRODUCT_FALLBACK = {
  quiv: "QUIV",
  heron: "HERON",
  rategen: "RateGen",
  mep: "SERVIQ Suite",
  civiq: "CIVIQ",
  timepro: "Time Pro",
  "qs-app": "QS Takeoff app",
  "installer-hub": "Installer Hub",
  website: "Website / ADLM Cloud",
  platform: "All products",
};

// Where a release goes when it is let out, in the server's own two words.
const ROLLOUT = {
  organizations: ["Our firms first", "The firms we work with get it now. Everyone else waits out the three months."],
  everyone: ["Everyone, now", "Every customer on the next check. Use this when the thing it fixes is worse than the risk."],
};

const CASE = [
  ["problem", "The problem"],
  ["whoBenefits", "Who it helps"],
  ["value", "What it is worth"],
  ["cost", "What it costs"],
  ["successMetric", "How we will know it worked"],
  ["risks", "What could go wrong"],
  ["alternatives", "What else we considered"],
];

const VERDICTS = [
  ["works", "Works", "ok"],
  ["needs-change", "Needs a change", "due"],
  ["could-not-test", "Could not test", ""],
];
// A thing that was built but was not in his design: it is not pass or fail,
// it is whether it stays.
const KEEP = [
  ["keep", "Keep it", "ok"],
  ["change", "Change it", "due"],
  ["remove", "Take it out", "bad"],
];

// Every answer he can give, in one place: how Done labels it, and how the
// queue says it in a sentence.
const SAID = {
  approved: ["Approved", "approved it"],
  changes: ["Asked for changes", "asked for changes"],
  declined: ["Declined", "declined it"],
  upheld: ["Upheld", "said it was justified"],
  objected: ["Objected", "objected to it"],
};

// A deadline outranks a release that is holding customers up, which outranks
// an idea nobody is waiting on.
const URGENCY = { emergency: 0, release: 1, candidate: 2, idea: 3 };

// AdmFilters takes [value, label, count]; the count is the badge.
const TABS = [
  ["you", "Needs you"],
  ["flight", "In flight"],
  ["done", "Done"],
];

/* ---------------------------------------------------------- small helpers */

function productName(key, labels) {
  return labels?.[key] || PRODUCT_FALLBACK[key] || key || "—";
}

function productsOf(row, labels) {
  const keys = row.products?.length ? row.products : [row.productKey].filter(Boolean);
  if (!keys.length) return "—";
  return keys.map((k) => productName(k, labels)).join(", ");
}

function daysSince(when, now) {
  if (!when) return "";
  const n = Math.round((now - new Date(when)) / 86400000);
  if (n <= 0) return "today";
  if (n === 1) return "yesterday";
  return `${n} days`;
}

function hoursUntil(when, now) {
  if (!when) return null;
  return Math.round((new Date(when) - now) / 3600000);
}

function notesOf(row) {
  let n = row.notifyBody?.releaseNotes || [];
  if (typeof n === "string") n = n.split("\n").filter((l) => l.trim());
  return Array.isArray(n) ? n : [];
}

function fullDate(when) {
  if (!when) return "—";
  return new Date(when).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/* ------------------------------------------------------- the three sources
   One queue means merging what the server already returns, rather than asking
   for a new endpoint to do it on the way out. */

function toRows({ work, batch, releases }) {
  const rows = [];

  for (const it of work?.items || []) {
    if (it.decision?.status !== "pending") continue;
    rows.push({ ...it, _kind: "idea", _id: String(it._id), _when: it.submittedAt });
  }

  const b = batch?.batch;
  if (b && b.status === "testing") {
    rows.push({ ...b, _kind: "release", _id: String(b._id), _when: b.createdAt || b.submittedAt });
  }

  for (const c of releases?.pending || []) {
    rows.push({ ...c, _kind: "candidate", _id: String(c._id), _when: c.submittedAt });
  }

  for (const c of releases?.awaitingReview || []) {
    rows.push({ ...c, _kind: "emergency", _id: String(c._id), _when: c.decidedAt || c.submittedAt });
  }

  return rows.sort((a, z) => {
    const d = URGENCY[a._kind] - URGENCY[z._kind];
    return d || new Date(a._when || 0) - new Date(z._when || 0);
  });
}

function labelOf(row) {
  if (row._kind === "candidate") return row.kind === "setting" ? "Setting" : "Build";
  return { idea: "Idea", release: "Release", emergency: "Emergency" }[row._kind];
}

function titleOf(row) {
  if (row._kind === "idea" || row._kind === "release") return row.title;
  if (row.kind === "setting") return row.displayName || row.settingField;
  return `${row.displayName || row.productKey} ${row.toVersion || ""}`.trim();
}

// What he has to do, as a verb, and roughly how long it will take. Never a
// status: a status tells him where a thing is, a verb tells him what it wants.
function job(row, now) {
  if (row._kind === "idea") return { verb: "Approve or decline", mins: "2 min · read the case" };

  if (row._kind === "emergency") {
    const h = hoursUntil(row.reviewDueAt, now);
    return {
      verb: "Say whether it should have gone out",
      mins: h === null ? "" : h <= 0 ? "overdue" : `due in ${h} hour${h === 1 ? "" : "s"}`,
      urgent: true,
    };
  }

  if (row._kind === "candidate") {
    return row.kind === "setting"
      ? { verb: "Check the new link, then approve it", mins: "1 min" }
      : { verb: "Read the notes, then choose who gets it", mins: "3 min" };
  }

  const flows = (row.items || []).filter((i) => i.kind !== "behind-the-scenes");
  const done = flows.filter((i) => i.verdict).length;
  return {
    verb: `Test ${flows.length} thing${flows.length === 1 ? "" : "s"}, then sign off`,
    mins: done ? `${done} of ${flows.length} done` : `about ${flows.length * 3} min`,
  };
}

/* ================================================================= screen */

export default function DsAdminDesk() {
  const [say, toast] = useAdmToast();
  const [tab, setTab] = React.useState("you");
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState("");
  const [open, setOpen] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [note, setNote] = React.useState("");
  const [rollout, setRollout] = React.useState("");

  const [now, setNow] = React.useState(() => new Date());

  const load = React.useCallback(async () => {
    setError("");
    try {
      // Three calls, because that is what already exists. Each is allowed to
      // fail on its own: a broken batch endpoint should not empty the queue of
      // ideas he could still be getting through.
      const [work, batch, releases] = await Promise.all([
        apiAuthed("/admin/work").catch((e) => ({ _error: e })),
        apiAuthed("/admin/releases/batch").catch((e) => ({ _error: e })),
        apiAuthed("/admin/releases").catch((e) => ({ _error: e })),
      ]);
      const broke = [work, batch, releases].filter((r) => r?._error);
      if (broke.length === 3) throw broke[0]._error;
      if (broke.length) setError("Part of the desk could not be loaded. What is here is still current.");
      // one clock per load, so every "due in" on the screen agrees
      setNow(new Date());
      setData({ work, batch, releases });
    } catch (e) {
      setError(e?.data?.error || e?.message || "The desk could not be loaded.");
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const rows = React.useMemo(() => (data ? toRows(data) : []), [data]);
  const labels = data?.work?.options?.productLabels;
  const current = React.useMemo(() => rows.find((r) => r._id === open) || null, [rows, open]);

  // Opening a row is also where its own draft state starts, so a note typed
  // against one thing can never be posted against another.
  function openRow(row) {
    setOpen(row._id);
    setNote("");
    setRollout(row.rollout || "organizations");
  }
  function close() {
    setOpen(null);
    setNote("");
  }

  async function send(path, body, { needNote, after } = {}) {
    if (needNote && note.trim().length < 5) {
      say(needNote, "bad");
      return;
    }
    setBusy(path);
    try {
      await apiAuthed(path, { method: "POST", body });
      say(after || "Saved.", "ok");
      close();
      await load();
    } catch (e) {
      say(e?.data?.error || e?.message || "That did not go through.", "bad");
    } finally {
      setBusy("");
    }
  }

  /* --------------------------------------------------------------- queue */

  const queueCols = [
    {
      h: "What it is",
      cell: (r) => (
        <span className="dk-what-cell">
          <AdmChip tone={r._kind === "emergency" ? "bad" : r._kind === "idea" ? "calm" : "due"}>{labelOf(r)}</AdmChip>
          <AdmTwo top={titleOf(r)} under={productsOf(r, labels)} />
        </span>
      ),
    },
    { h: "What you do", cell: (r) => <b>{job(r, now).verb}</b> },
    {
      h: "How long",
      cell: (r) => {
        const j = job(r, now);
        return j.urgent ? <span className="dk-urgent">{j.mins}</span> : <AdmDim>{j.mins}</AdmDim>;
      },
    },
    { h: "Waiting", num: true, cell: (r) => <AdmDim>{daysSince(r._when, now)}</AdmDim> },
  ];

  function Queue() {
    if (!rows.length) {
      return (
        <div className="adm-sec">
          <p>
            <b>Nothing is waiting for you.</b>
          </p>
          <AdmDim>When somebody proposes something or puts up a release, it lands here.</AdmDim>
        </div>
      );
    }
    return (
      <>
        <p className="adm-lede">
          {rows.length} thing{rows.length === 1 ? "" : "s"} waiting. Open one, do what it says, and it leaves this
          list.
        </p>
        <AdmTable cols={queueCols} rows={rows} rowKey={(r) => r._id} onRow={openRow} empty={["Nothing is waiting for you", "When somebody proposes something or puts up a release, it lands here."]} />
      </>
    );
  }

  /* -------------------------------------------------------------- in flight
     Rollouts that went to our firms and are waiting out the three months.
     Nothing is owed on these, which is why they are not in the queue — but he
     is the one who opens the gate, so he has to be able to see the clock. */

  const rollouts = data?.releases?.rollouts || [];

  const flightCols = [
    { h: "What went out", cell: (r) => <AdmTwo top={r.displayName} under={`${r.firstVersion || "—"} → ${r.earlyVersion || "—"}`} /> },
    { h: "With our firms since", cell: (r) => <AdmDim>{fullDate(r.startedAt)}</AdmDim> },
    {
      h: "Everyone",
      num: true,
      cell: (r) =>
        r.canReleaseToEveryone ? (
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            disabled={busy === `/admin/releases/rollouts/${r.productKey}/everyone`}
            onClick={() => setOpen(`rollout:${r.productKey}`)}
          >
            Open it to everyone
          </button>
        ) : (
          <AdmDim>{r.unlocksAt ? `opens ${fullDate(r.unlocksAt)}` : "with our firms"}</AdmDim>
        ),
    },
  ];

  function Flight() {
    return (
      <>
        <p className="adm-lede">Everything part-way out. Nothing here is owed by you today.</p>
        {rollouts.length ? (
          <AdmTable cols={flightCols} rows={rollouts} rowKey={(r) => r.productKey} empty={["Nothing is with our firms", "A release that goes to firms first will show here with its clock."]} />
        ) : (
          <AdmDim>Nothing is with our firms right now.</AdmDim>
        )}
        {data?.releases?.rolloutError ? (
          <p className="adm-lede">
            <AdmDim>Rollouts could not be read: {data.releases.rolloutError}</AdmDim>
          </p>
        ) : null}
      </>
    );
  }

  /* ------------------------------------------------------------------ done */

  const settled = data?.releases?.recent || [];

  const doneCols = [
    { h: "What it was", cell: (r) => <AdmTwo top={r.displayName || r.productKey} under={`${r.fromVersion || "—"} → ${r.toVersion || "—"}`} /> },
    {
      h: "You said",
      cell: (r) => {
        const word = r.reviewVerdict || r.status;
        const pair = SAID[word];
        return <AdmChip tone={word === "approved" || word === "upheld" ? "ok" : "bad"}>{pair ? pair[0] : word}</AdmChip>;
      },
    },
    { h: "When", num: true, cell: (r) => <AdmDim>{fullDate(r.decidedAt || r.reviewedAt)}</AdmDim> },
    { h: "Note", cell: (r) => (r.decisionNote ? r.decisionNote : <AdmDim>—</AdmDim>) },
  ];

  function Done() {
    if (!settled.length) return <AdmDim>Nothing decided yet.</AdmDim>;
    return (
      <>
        <p className="adm-lede">What you have decided. Every one is recorded and cannot be altered later.</p>
        <AdmTable cols={doneCols} rows={settled} rowKey={(r) => String(r._id)} empty={["Nothing decided yet", "What you approve or send back is recorded here."]} />
      </>
    );
  }

  /* --------------------------------------------------------------- panels */

  function NoteBox({ placeholder }) {
    return (
      <label className="adm-f wide">
        <span className="adm-f-l">Your note</span>
        <textarea rows={2} value={note} placeholder={placeholder} onChange={(e) => setNote(e.target.value)} />
      </label>
    );
  }

  function Idea({ row }) {
    const filled = CASE.filter((c) => row.businessCase?.[c[0]]);
    const path = `/admin/work/${row._id}/decide`;
    return (
      <>
        <p>{row.summary}</p>
        <h3 className="dk-h">Why they want to build it</h3>
        <dl className="dk-case">
          {filled.map((c) => (
            <div key={c[0]}>
              <dt>{c[1]}</dt>
              <dd>{row.businessCase[c[0]]}</dd>
            </div>
          ))}
        </dl>
        {row.design?.surfaces ? (
          <>
            <h3 className="dk-h">Screens it touches</h3>
            <p>
              {row.design.surfaces}
              {row.design.link ? (
                <>
                  {" — "}
                  <a href={row.design.link} target="_blank" rel="noreferrer">
                    your design
                  </a>
                </>
              ) : null}
            </p>
          </>
        ) : null}
        <h3 className="dk-h">Your answer</h3>
        <AdmDim>Nothing is designed or built until you approve it. If you send it back, say what to change.</AdmDim>
        <NoteBox placeholder="A note — needed if you send it back or decline it" />
        <div className="adm-acts">
          <button
            type="button"
            className="ds-btn btn-p ds-btn-sm"
            disabled={busy === path}
            onClick={() => send(path, { verdict: "approved", note: note.trim() }, { after: "Approved. Whoever proposed it is told." })}
          >
            Approve it
          </button>
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            disabled={busy === path}
            onClick={() =>
              send(path, { verdict: "changes", note: note.trim() }, {
                needNote: "Say what to change, so whoever picks it up knows.",
                after: "Sent back with your note.",
              })
            }
          >
            Send it back
          </button>
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm adm-danger"
            disabled={busy === path}
            onClick={() =>
              send(path, { verdict: "declined", note: note.trim() }, {
                needNote: "Say why, so it is on the record.",
                after: "Declined.",
              })
            }
          >
            Decline it
          </button>
        </div>
      </>
    );
  }

  function Release({ row }) {
    const flows = (row.items || []).filter((i) => i.kind !== "behind-the-scenes");
    const behind = (row.items || []).filter((i) => i.kind === "behind-the-scenes");
    const done = flows.filter((f) => f.verdict).length;
    const left = flows.length - done;

    const verdict = async (key, word) => {
      const path = `/admin/releases/batch/${row._id}/verdict`;
      setBusy(`${path}:${key}`);
      try {
        await apiAuthed(path, { method: "POST", body: { key, verdict: word } });
        await load();
      } catch (e) {
        say(e?.data?.error || e?.message || "That did not save.", "bad");
      } finally {
        setBusy("");
      }
    };

    return (
      <>
        <p>
          Try each one on the preview, then say what you found. Your answer is pinned to this exact build — if
          anything changes after you sign off, it comes back to you.
        </p>
        <p className="dk-prog">
          <b>
            {done} of {flows.length} checked
          </b>
        </p>
        {flows.map((f, i) => {
          const set = f.kind === "not-in-design" ? KEEP : VERDICTS;
          return (
            <section key={f.key} className={`dk-flow${f.verdict ? " is-done" : ""}`}>
              <h4>
                <span className="dk-no">{i + 1}</span>
                {f.title}
              </h4>
              {f.kind === "not-in-design" ? (
                <AdmDim>This was not in your design. Say whether it stays.</AdmDim>
              ) : null}
              {f.where ? <p className="dk-where">{f.where}</p> : null}
              {f.steps?.length ? (
                <ol className="dk-steps">
                  {f.steps.map((s, n) => (
                    <li key={n}>{s}</li>
                  ))}
                </ol>
              ) : null}
              <div className="dk-flow-a">
                {f.where && /^https?:/i.test(f.where) ? (
                  <a href={f.where} target="_blank" rel="noreferrer">
                    Open it →
                  </a>
                ) : null}
                {f.designUrl ? (
                  <a href={f.designUrl} target="_blank" rel="noreferrer">
                    Compare with your design
                  </a>
                ) : null}
              </div>
              <div className="dk-vs">
                {set.map((v) => (
                  <button
                    key={v[0]}
                    type="button"
                    className={`ds-btn btn-o ds-btn-sm${f.verdict === v[0] ? " on" : ""}`}
                    disabled={busy.startsWith(`/admin/releases/batch/${row._id}/verdict`)}
                    onClick={() => verdict(f.key, v[0])}
                  >
                    {v[1]}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
        {behind.length ? (
          <section className="dk-behind">
            <h4>Fixed behind the scenes</h4>
            <AdmDim>Nothing to try. Listed so you know it changed.</AdmDim>
            <ul>
              {behind.map((b) => (
                <li key={b.key}>{b.title}</li>
              ))}
            </ul>
          </section>
        ) : null}
        <h3 className="dk-h">Your answer</h3>
        {left ? (
          <p className="dk-warn">
            {left} still unchecked. You can sign off anyway, but anything you did not try goes to customers untested.
          </p>
        ) : (
          <AdmDim>Everything checked.</AdmDim>
        )}
        <NoteBox placeholder="A note — needed if you send it back" />
        <div className="adm-acts">
          <button
            type="button"
            className="ds-btn btn-p ds-btn-sm"
            disabled={busy.startsWith(`/admin/releases/batch/${row._id}`)}
            onClick={() =>
              send(`/admin/releases/batch/${row._id}/approve`, { note: note.trim() }, {
                after: "Signed off. It goes to customers now.",
              })
            }
          >
            Sign off — send to customers
          </button>
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            disabled={busy.startsWith(`/admin/releases/batch/${row._id}`)}
            onClick={() =>
              send(`/admin/releases/batch/${row._id}/reject`, { note: note.trim() }, {
                needNote: "Say what to change, so whoever picks it up knows.",
                after: "Sent back with your note.",
              })
            }
          >
            Send it back
          </button>
        </div>
      </>
    );
  }

  // A signed build. Nothing to try on a preview — it is already made. What he
  // is deciding is whether the notes describe something he wants customers to
  // have, and who gets it.
  function Build({ row }) {
    const ns = notesOf(row);
    const path = `/admin/releases/${row._id}/approve`;
    return (
      <>
        <p>
          A build is ready. It is already made and signed — there is nothing to try on a preview. Read what changed,
          choose who gets it, and let it out.
        </p>
        <p className="dk-ver">
          <span>{row.fromVersion || "—"}</span> <i>→</i> <b>{row.toVersion || "—"}</b>
        </p>
        <h3 className="dk-h">What changed</h3>
        {ns.length ? (
          <ul className="dk-notes">
            {ns.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        ) : (
          <p className="dk-warn">
            No notes were written. Send it back and ask for them — these are what customers are emailed.
          </p>
        )}
        <AdmDim>
          {row.notifyBody?.notifySubscribers
            ? "Letting it out emails everyone who gets it, with those notes."
            : "Nobody is emailed about this one."}
        </AdmDim>
        <h3 className="dk-h">Who gets it</h3>
        <div className="dk-roll">
          {Object.keys(ROLLOUT).map((k) => (
            <button
              key={k}
              type="button"
              className={`dk-r${rollout === k ? " on" : ""}`}
              onClick={() => setRollout(k)}
            >
              <b>{ROLLOUT[k][0]}</b>
              <span>{ROLLOUT[k][1]}</span>
            </button>
          ))}
        </div>
        <h3 className="dk-h">Your answer</h3>
        <AdmDim>
          Once it is out it installs on the next check, and it cannot be called back — the only way out is another
          build.
        </AdmDim>
        <NoteBox placeholder="A note — needed if you send it back" />
        <div className="adm-acts">
          <button
            type="button"
            className="ds-btn btn-p ds-btn-sm"
            disabled={busy.startsWith(`/admin/releases/${row._id}`)}
            onClick={() =>
              send(path, { note: note.trim(), rollout }, {
                after: `Out to ${ROLLOUT[rollout][0].toLowerCase()}.`,
              })
            }
          >
            Let it out
          </button>
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            disabled={busy.startsWith(`/admin/releases/${row._id}`)}
            onClick={() =>
              send(`/admin/releases/${row._id}/reject`, { note: note.trim() }, {
                needNote: "Say what to change, so whoever picks it up knows.",
                after: "Sent back. Nothing has been installed.",
              })
            }
          >
            Send it back
          </button>
        </div>
      </>
    );
  }

  // One link swapped for another. He cannot judge a URL by reading it, so the
  // only honest thing this panel can do is get him to click it.
  function Setting({ row }) {
    const next = row.payload?.[row.settingField] || "";
    return (
      <>
        <p>
          This is the link the website hands out when somebody downloads it. It is being changed. Download it before
          you approve it — a wrong link here means nobody can install anything at all.
        </p>
        <h3 className="dk-h">The link now</h3>
        <p className="dk-url was">{row.settingPrevious || "— nothing set —"}</p>
        <h3 className="dk-h">The link they want</h3>
        <p className="dk-url">
          <a href={next} target="_blank" rel="noreferrer">
            {next}
          </a>
        </p>
        <AdmDim>Open it. You should get an installer, of about the size you expect.</AdmDim>
        <h3 className="dk-h">Your answer</h3>
        <NoteBox placeholder="A note — needed if you send it back" />
        <div className="adm-acts">
          <button
            type="button"
            className="ds-btn btn-p ds-btn-sm"
            disabled={busy.startsWith(`/admin/releases/${row._id}`)}
            onClick={() =>
              send(`/admin/releases/${row._id}/approve`, { note: note.trim() }, {
                after: "Changed. The website hands out the new link from now on.",
              })
            }
          >
            Approve the change
          </button>
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            disabled={busy.startsWith(`/admin/releases/${row._id}`)}
            onClick={() =>
              send(`/admin/releases/${row._id}/reject`, { note: note.trim() }, {
                needNote: "Say what is wrong with it.",
                after: "Sent back. The link stays as it is.",
              })
            }
          >
            Send it back
          </button>
        </div>
      </>
    );
  }

  // This one runs backwards: it has already gone to customers. He is not
  // deciding whether it ships, he is putting on the record whether forcing it
  // was right — and neither answer is the primary button, because the screen
  // must not nudge him toward either. Objecting does not roll anything back,
  // and saying so is the panel's job.
  function Emergency({ row }) {
    const h = hoursUntil(row.reviewDueAt, now);
    const ns = notesOf(row);
    const path = `/admin/releases/${row._id}/review`;
    return (
      <>
        <div className="dk-alarm">
          <b>This has already gone out.</b>
          <span>
            {(row.decidedBy || "Somebody").split("@")[0]} released it without waiting for you, to{" "}
            {row.appliedTo === "everyone" ? "every customer" : "our firms"}. It is on their machines now. You are
            saying whether that was the right call.
          </span>
        </div>
        {h === null ? null : (
          <div className={`dk-due${h <= 6 ? " hot" : ""}`}>
            <b>{h <= 0 ? "Your review was due already." : `Your review is due in ${h} hour${h === 1 ? "" : "s"}.`}</b>
            <span>Set at {data?.releases?.emergencyReviewHours || 24} hours, so a forced release cannot sit unexamined.</span>
          </div>
        )}
        <h3 className="dk-h">Why they forced it</h3>
        <blockquote className="dk-why">{row.emergencyReason || "No reason was recorded."}</blockquote>
        <p className="dk-ver">
          <span>{row.fromVersion || "—"}</span> <i>→</i> <b>{row.toVersion || "—"}</b>
        </p>
        {ns.length ? (
          <>
            <h3 className="dk-h">What it changed</h3>
            <ul className="dk-notes">
              {ns.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </>
        ) : null}
        <h3 className="dk-h">Your verdict</h3>
        <AdmDim>
          Neither answer takes it back — it is out. Upholding it says the reason was good enough. Objecting puts on the
          record that it was not, which is what you would point at if it happened again for a thinner reason.
        </AdmDim>
        <NoteBox placeholder="A note — needed if you object" />
        <div className="adm-acts">
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            disabled={busy === path}
            onClick={() => send(path, { verdict: "upheld", note: note.trim() }, { after: "Upheld, and on the record." })}
          >
            It was justified
          </button>
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm adm-danger"
            disabled={busy === path}
            onClick={() =>
              send(path, { verdict: "objected", note: note.trim() }, {
                needNote: "An objection that gives no reason is not a record of anything.",
                after: "Objected, and on the record.",
              })
            }
          >
            It should not have gone out
          </button>
        </div>
      </>
    );
  }

  // Widening a rollout puts it on every customer's machine, so it is asked as
  // a question on a panel rather than taken on one click.
  function WidenPanel({ productKey }) {
    const r = rollouts.find((x) => x.productKey === productKey);
    if (!r) return null;
    const path = `/admin/releases/rollouts/${productKey}/everyone`;
    return (
      <AdmDrawer title={`Open ${r.displayName} to everyone?`} onClose={close}>
        <p>
          It has been with our firms since {fullDate(r.startedAt)}. Opening it means every customer gets{" "}
          {r.earlyVersion || "it"} on their next check, and there is no way to put it back except another build.
        </p>
        <div className="adm-acts">
          <button
            type="button"
            className="ds-btn btn-p ds-btn-sm"
            disabled={busy === path}
            onClick={() => send(path, {}, { after: `${r.displayName} is out to everyone.` })}
          >
            Open it to everyone
          </button>
          <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={close}>
            Not yet
          </button>
        </div>
      </AdmDrawer>
    );
  }

  function Panel() {
    if (typeof open === "string" && open.startsWith("rollout:")) {
      return <WidenPanel productKey={open.slice("rollout:".length)} />;
    }
    if (!current) return null;
    const body =
      current._kind === "idea" ? (
        <Idea row={current} />
      ) : current._kind === "release" ? (
        <Release row={current} />
      ) : current._kind === "emergency" ? (
        <Emergency row={current} />
      ) : current.kind === "setting" ? (
        <Setting row={current} />
      ) : (
        <Build row={current} />
      );

    const stamp =
      current._kind === "release"
        ? `commit ${current.headSha || "—"}`
        : current._kind === "idea"
          ? current.kind
          : current.kind === "setting"
            ? "a setting, not a build"
            : `${current.fromVersion || "—"} → ${current.toVersion || "—"}`;

    return (
      <AdmDrawer
        wide
        title={titleOf(current)}
        intro={`${productsOf(current, labels)} · ${stamp} · from ${(current.preparedBy || current.submittedBy || "").split("@")[0] || "—"}`}
        onClose={close}
      >
        {body}
      </AdmDrawer>
    );
  }

  /* ---------------------------------------------------------------- render */

  if (!data && !error) return <AdmDim>Loading your desk…</AdmDim>;

  const isApprover = data?.releases?.you?.isApprover ?? data?.work?.you?.isApprover;

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Your desk</h1>
          <p className="adm-lede">Everything waiting on you, in one list. Open a row, do what it says, and it leaves.</p>
        </div>
      </div>

      {error ? <p className="dk-warn">{error}</p> : null}

      {isApprover === false ? (
        <p className="dk-warn">
          You are signed in as someone who cannot decide these. You can read the queue; the answers will be refused.
        </p>
      ) : null}

      <AdmFilters
        options={TABS.map(([value, label]) => [value, label, value === "you" && rows.length ? rows.length : null])}
        current={tab}
        onPick={setTab}
      />

      <div className="adm-sec">{tab === "you" ? <Queue /> : tab === "flight" ? <Flight /> : <Done />}</div>

      <Panel />
      {toast}
    </>
  );
}
