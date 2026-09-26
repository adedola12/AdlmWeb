// client/src/features/work/WorkBoard.jsx
//
// The work board (docs/WORK_BOARD.md), in two sizes:
//   <WorkInFlight />  compact: what is in flight, by product, and what needs the
//                     approver. Sits on the release desk and the /preview index.
//   <WorkBoard />     the whole board: propose, decide, run the design track.
//
// The rule it carries: a new feature or button is proposed with its business
// case, and it is not designed, built or shipped until the approver approves it.
import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../store.jsx";
import { apiAuthed } from "../../http.js";

export function useWorkBoard() {
  const { accessToken } = useAuth();
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    try {
      setData(await apiAuthed("/admin/work", { token: accessToken }));
      setError("");
    } catch (e) {
      setError(e?.message || "Could not load the work board");
    }
  }, [accessToken]);

  React.useEffect(() => {
    load();
  }, [load]);

  const call = React.useCallback(
    async (path, method, body) => {
      const r = await apiAuthed(`/admin/work${path}`, { token: accessToken, method, body });
      await load();
      return r;
    },
    [accessToken, load],
  );

  return { data, error, load, call };
}

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
const STAGE_STYLE = {
  proposed: "bg-amber-100 text-amber-800",
  approved: "bg-sky-100 text-sky-800",
  "in-design": "bg-fuchsia-100 text-fuchsia-800",
  building: "bg-blue-100 text-blue-800",
  testing: "bg-indigo-100 text-indigo-800",
  "awaiting-signoff": "bg-orange-100 text-orange-800",
  shipped: "bg-green-100 text-green-700",
  "on-hold": "bg-slate-200 text-slate-600",
  declined: "bg-red-100 text-red-700",
};
const DECISION_LABEL = {
  pending: "Needs your decision",
  approved: "Approved",
  changes: "Changes asked",
  declined: "Declined",
  grandfathered: "Started before the rule",
  "not-required": "No approval needed",
};
const DESIGN_LABEL = {
  "not-needed": "No design needed",
  needed: "Design needed",
  "in-progress": "Being designed",
  ready: "Design ready",
  adopted: "Design adopted",
};
const ORDER = ["proposed", "in-design", "approved", "building", "testing", "awaiting-signoff", "on-hold", "shipped", "declined"];

function Pill({ className = "", children }) {
  return <span className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${className}`}>{children}</span>;
}

export function StagePill({ stage }) {
  return <Pill className={STAGE_STYLE[stage] || "bg-slate-200"}>{STAGE_LABEL[stage] || stage}</Pill>;
}

function productNames(item, labels = {}) {
  return (item.products || []).map((p) => labels[p] || p).join(" · ");
}

function SummaryTiles({ summary }) {
  if (!summary) return null;
  const tiles = [
    ["Waiting for your decision", summary.awaitingDecision, "text-amber-700"],
    ["Design needed", summary.designNeeded, "text-fuchsia-700"],
    ["Building or testing", summary.building, "text-blue-700"],
    ["At the release desk", summary.awaitingSignoff, "text-orange-700"],
    ["Shipped", summary.shipped, "text-green-700"],
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {tiles.map(([label, n, tone]) => (
        <div key={label} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
          <div className={`text-2xl font-semibold ${tone}`}>{n}</div>
          <div className="text-xs text-slate-500">{label}</div>
        </div>
      ))}
    </div>
  );
}

// ── compact ──────────────────────────────────────────────────────────────────

export function WorkInFlight({ title = "What is being worked on across ADLM", fullLink = true }) {
  const { data, error } = useWorkBoard();
  if (error) {
    return (
      <div className="card text-sm text-slate-500">
        {title}: {error}
      </div>
    );
  }
  if (!data) return <div className="card text-sm text-slate-500">Loading the work board…</div>;

  const labels = data.options?.productLabels || {};
  const live = data.items.filter((i) => !["shipped", "declined"].includes(i.stage));
  const needsYou = live.filter((i) => i.decision?.status === "pending");
  const byProduct = {};
  for (const i of live) {
    const p = i.products?.[0] || "platform";
    (byProduct[p] ||= []).push(i);
  }

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold mr-auto">{title}</h2>
        {fullLink && (
          <Link to="/admin/work" className="btn btn-sm">
            Open the work board
          </Link>
        )}
      </div>
      <p className="text-sm text-slate-500">
        From 22 September 2026 a new feature or button is proposed here with its business case first, and nothing is
        designed or built until {data.approver?.name || "the approver"} approves it. The design track runs beside the
        code, so design and build move together.
      </p>
      <SummaryTiles summary={data.summary} />

      {needsYou.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-1">
          <div className="text-sm font-semibold text-amber-800">Waiting for a decision</div>
          {needsYou.map((i) => (
            <div key={i._id} className="text-sm">
              <Link to={`/admin/work#${i._id}`} className="hover:underline font-medium">
                {i.title}
              </Link>{" "}
              <span className="text-slate-500">{productNames(i, labels)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {Object.entries(byProduct)
          .sort(([a], [b]) => (labels[a] || a).localeCompare(labels[b] || b))
          .map(([p, list]) => (
            <div key={p}>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">{labels[p] || p}</div>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {list
                  .sort((a, b) => ORDER.indexOf(a.stage) - ORDER.indexOf(b.stage))
                  .map((i) => (
                    <li key={i._id} className="py-2 flex flex-wrap items-start gap-2">
                      <StagePill stage={i.stage} />
                      <div className="flex-1 min-w-[12rem]">
                        <Link to={`/admin/work#${i._id}`} className="text-sm font-medium hover:underline">
                          {i.title}
                        </Link>
                        {i.pending && <div className="text-xs text-slate-500 line-clamp-2">Next: {i.pending}</div>}
                        {i.blockedOn && <div className="text-xs text-red-600">Waiting on: {i.blockedOn}</div>}
                      </div>
                      {i.design?.status && i.design.status !== "not-needed" && (
                        <Pill className="bg-fuchsia-50 text-fuchsia-700">{DESIGN_LABEL[i.design.status]}</Pill>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
      </div>
    </div>
  );
}

// ── full board ───────────────────────────────────────────────────────────────

const EMPTY = { title: "", summary: "", kind: "feature", products: [], businessCase: {}, design: { surfaces: "" } };

function ProposalForm({ options, onSubmit, onCancel }) {
  const [f, setF] = React.useState(EMPTY);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const needsCase = ["feature", "button", "improvement"].includes(f.kind);

  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const setCase = (k, v) => setF((x) => ({ ...x, businessCase: { ...x.businessCase, [k]: v } }));
  const toggle = (p) => set({ products: f.products.includes(p) ? f.products.filter((x) => x !== p) : [...f.products, p] });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await onSubmit(f);
      setF(EMPTY);
    } catch (e2) {
      setErr(e2?.message || "Could not file it");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-3 border border-sky-200">
      <h2 className="font-semibold">Propose a new feature or button</h2>
      <p className="text-sm text-slate-500">
        Write the business case the way you would pitch it. The approver reads this before anything is designed or built.
      </p>
      <input className="input w-full" placeholder="Title" value={f.title} onChange={(e) => set({ title: e.target.value })} />
      <div className="flex flex-wrap gap-2 items-center">
        <select className="input" value={f.kind} onChange={(e) => set({ kind: e.target.value })}>
          {options.kinds.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        {options.products.map((p) => (
          <label key={p} className="text-xs flex items-center gap-1">
            <input type="checkbox" checked={f.products.includes(p)} onChange={() => toggle(p)} />
            {options.productLabels[p] || p}
          </label>
        ))}
      </div>
      <textarea className="input w-full" rows={2} placeholder="In one or two lines, what it is" value={f.summary} onChange={(e) => set({ summary: e.target.value })} />
      {needsCase &&
        options.caseFields.map((c) => (
          <label key={c.key} className="block text-sm">
            <span className="text-slate-600">
              {c.label}
              {c.required ? " *" : ""}
            </span>
            <textarea className="input w-full mt-1" rows={2} value={f.businessCase[c.key] || ""} onChange={(e) => setCase(c.key, e.target.value)} />
          </label>
        ))}
      <label className="block text-sm">
        <span className="text-slate-600">Screens, buttons and dialogs it touches (for the design track)</span>
        <textarea className="input w-full mt-1" rows={2} value={f.design.surfaces} onChange={(e) => set({ design: { surfaces: e.target.value } })} />
      </label>
      {err && <div className="text-sm text-red-600">{err}</div>}
      <div className="flex gap-2">
        <button className="btn btn-sm bg-sky-600 hover:bg-sky-700 text-white" disabled={busy}>
          {needsCase ? "Send for approval" : "Add to the board"}
        </button>
        <button type="button" className="btn btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ItemCard({ item, data, call, setMsg }) {
  const { you, approver, options } = data;
  const [note, setNote] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [design, setDesign] = React.useState({ link: item.design?.link || "", notes: item.design?.notes || "" });
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (window.location.hash === `#${item._id}`) setOpen(true);
  }, [item._id]);

  const mine = item.submittedBy && item.submittedBy === you.email;
  const byApprover = item.submittedBy && item.submittedBy === approver.email;
  const canDecide =
    item.decision?.status !== "not-required" && !mine && (you.isApprover || (you.isSuperAdmin && byApprover)) &&
    ["pending", "changes", "declined"].includes(item.decision?.status);
  const canDesign = you.isApprover || you.isSuperAdmin;
  const canEdit = you.isSuperAdmin || mine;

  async function run(path, method, body) {
    setBusy(true);
    setMsg("");
    try {
      await call(path, method, body);
      setNote("");
      setComment("");
    } catch (e) {
      setMsg(e?.message || "That did not work");
    } finally {
      setBusy(false);
    }
  }

  const bc = item.businessCase || {};
  const hasCase = options.caseFields.some((c) => bc[c.key]);

  return (
    <div id={item._id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
      <button type="button" className="w-full text-left flex flex-wrap items-center gap-2" onClick={() => setOpen((o) => !o)}>
        <StagePill stage={item.stage} />
        <span className="font-medium flex-1 min-w-[12rem]">{item.title}</span>
        <Pill className={item.decision?.status === "pending" ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600"}>
          {DECISION_LABEL[item.decision?.status] || item.decision?.status}
        </Pill>
        {item.design?.status !== "not-needed" && <Pill className="bg-fuchsia-50 text-fuchsia-700">{DESIGN_LABEL[item.design?.status]}</Pill>}
      </button>
      <div className="text-xs text-slate-500">
        {productNames(item, options.productLabels)} · {item.kind}
        {item.comments?.length ? ` · ${item.comments.length} comment${item.comments.length > 1 ? "s" : ""}` : ""}
      </div>

      {open && (
        <div className="space-y-3 text-sm">
          {item.summary && <p>{item.summary}</p>}
          <dl className="grid sm:grid-cols-[10rem_1fr] gap-x-3 gap-y-1">
            {item.progress && (<><dt className="text-slate-500">Done</dt><dd>{item.progress}</dd></>)}
            {item.pending && (<><dt className="text-slate-500">Left to do</dt><dd>{item.pending}</dd></>)}
            {item.blockedOn && (<><dt className="text-slate-500">Waiting on</dt><dd className="text-red-600">{item.blockedOn}</dd></>)}
            {item.refs && (<><dt className="text-slate-500">Where</dt><dd className="text-slate-600 break-words">{item.refs}</dd></>)}
          </dl>

          {hasCase && (
            <div className="rounded bg-slate-50 dark:bg-slate-800/50 p-3 space-y-1">
              <div className="font-semibold">Business case</div>
              {options.caseFields.map((c) =>
                bc[c.key] ? (
                  <div key={c.key}>
                    <span className="text-slate-500">{c.label}: </span>
                    {bc[c.key]}
                  </div>
                ) : null,
              )}
            </div>
          )}

          {item.decision?.note && (
            <div className="text-slate-600">
              Decision note{item.decision.by ? ` from ${item.decision.by}` : ""}: <em>{item.decision.note}</em>
            </div>
          )}

          {canDecide && (
            <div className="flex flex-wrap items-center gap-2">
              <input className="input w-full sm:w-96" placeholder="Note (required to ask for changes or decline)" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn btn-sm bg-green-600 hover:bg-green-700 text-white" disabled={busy} onClick={() => run(`/${item._id}/decide`, "POST", { verdict: "approved", note })}>
                Approve
              </button>
              <button className="btn btn-sm" disabled={busy} onClick={() => run(`/${item._id}/decide`, "POST", { verdict: "changes", note })}>
                Ask for changes
              </button>
              <button className="btn btn-sm bg-red-600 hover:bg-red-700 text-white" disabled={busy} onClick={() => run(`/${item._id}/decide`, "POST", { verdict: "declined", note })}>
                Decline
              </button>
            </div>
          )}

          <div className="rounded border border-fuchsia-200 p-3 space-y-2">
            <div className="font-semibold text-fuchsia-800">Design track</div>
            {item.design?.surfaces && <div><span className="text-slate-500">Touches: </span>{item.design.surfaces}</div>}
            {item.design?.link && (
              <div>
                <a href={item.design.link} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline break-all">
                  {item.design.link}
                </a>
              </div>
            )}
            {item.design?.notes && <div className="text-slate-600">{item.design.notes}</div>}
            {canDesign && (
              <div className="flex flex-wrap items-center gap-2">
                <select className="input" value={item.design?.status} disabled={busy} onChange={(e) => run(`/${item._id}/design`, "POST", { status: e.target.value })}>
                  {options.designStatuses.map((s) => (
                    <option key={s} value={s}>
                      {DESIGN_LABEL[s] || s}
                    </option>
                  ))}
                </select>
                <input className="input flex-1 min-w-[12rem]" placeholder="Figma or staged page link" value={design.link} onChange={(e) => setDesign((d) => ({ ...d, link: e.target.value }))} />
                <input className="input flex-1 min-w-[12rem]" placeholder="Design notes" value={design.notes} onChange={(e) => setDesign((d) => ({ ...d, notes: e.target.value }))} />
                <button className="btn btn-sm" disabled={busy} onClick={() => run(`/${item._id}/design`, "POST", design)}>
                  Save design
                </button>
              </div>
            )}
          </div>

          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-500">Move to</span>
              <select className="input" value={item.stage} disabled={busy} onChange={(e) => run(`/${item._id}`, "PATCH", { stage: e.target.value })}>
                {options.stages.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABEL[s] || s}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            {(item.comments || []).map((c) => (
              <div key={c._id} className="text-slate-700 dark:text-slate-300">
                <span className="text-xs text-slate-500">
                  {c.byName || c.by}, {new Date(c.at).toLocaleString()}:
                </span>{" "}
                {c.text}
              </div>
            ))}
            <div className="flex gap-2">
              <input className="input flex-1" placeholder="Comment" value={comment} onChange={(e) => setComment(e.target.value)} />
              <button className="btn btn-sm" disabled={busy || comment.trim().length < 2} onClick={() => run(`/${item._id}/comment`, "POST", { text: comment })}>
                Post
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function WorkBoard() {
  const { data, error, load, call } = useWorkBoard();
  const [msg, setMsg] = React.useState("");
  const [proposing, setProposing] = React.useState(false);
  const [product, setProduct] = React.useState("");
  const [showDone, setShowDone] = React.useState(false);

  if (error) return <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 p-3 text-sm">{error}</div>;
  if (!data) return <div className="text-sm text-slate-500">Loading…</div>;

  const { options } = data;
  const items = data.items
    .filter((i) => !product || (i.products || []).includes(product))
    .filter((i) => showDone || !["shipped", "declined"].includes(i.stage));
  const groups = ORDER.map((s) => [s, items.filter((i) => i.stage === s)]).filter(([, l]) => l.length);

  return (
    <div className="space-y-4">
      <div className="card text-sm space-y-1">
        <div>
          Approver: <strong>{data.approver?.name || data.approver?.email || "none named"}</strong>
          {data.you.isApprover ? " (you)" : ""}
        </div>
        <div className="text-slate-500">
          New features and buttons need the approver&apos;s yes before they are designed, built or shipped. Nobody approves
          their own idea: the approver&apos;s own proposals go to the owner. Fixes and infrastructure are shown here too, but
          they do not need approval. Releases are signed off separately, at the{" "}
          <Link to="/admin/releases" className="text-sky-700 hover:underline">
            release desk
          </Link>
          .
        </div>
      </div>

      <SummaryTiles summary={data.summary} />

      {msg && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 p-3 text-sm">{msg}</div>}

      <div className="flex flex-wrap items-center gap-2">
        <select className="input" value={product} onChange={(e) => setProduct(e.target.value)}>
          <option value="">All products</option>
          {options.products.map((p) => (
            <option key={p} value={p}>
              {options.productLabels[p] || p}
            </option>
          ))}
        </select>
        <label className="text-sm flex items-center gap-1">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show shipped and declined
        </label>
        <span className="flex-1" />
        <button className="btn btn-sm" onClick={load}>
          Refresh
        </button>
        {!proposing && (
          <button className="btn btn-sm bg-sky-600 hover:bg-sky-700 text-white" onClick={() => setProposing(true)}>
            Propose a feature
          </button>
        )}
      </div>

      {proposing && (
        <ProposalForm
          options={options}
          onCancel={() => setProposing(false)}
          onSubmit={async (f) => {
            await call("", "POST", f);
            setProposing(false);
          }}
        />
      )}

      {groups.length === 0 && <div className="text-sm text-slate-500">Nothing on the board yet.</div>}
      {groups.map(([stage, list]) => (
        <section key={stage} className="space-y-2">
          <h2 className="text-sm uppercase tracking-wide text-slate-500">
            {STAGE_LABEL[stage]} ({list.length})
          </h2>
          {list.map((i) => (
            <ItemCard key={i._id} item={i} data={data} call={call} setMsg={setMsg} />
          ))}
        </section>
      ))}
    </div>
  );
}
