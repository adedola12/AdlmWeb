// client/src/pages/AdminReleases.jsx
// Release sign-off (docs/RELEASE_GATE.md). Every plugin release waits here
// until the named release approver signs it off. Super-admins also see the
// emergency button, which ships at once but is emailed to the approver,
// permanently recorded, and flagged here until the approver reviews it.
//
// Approved builds go to firms with more than 5 seats first; everyone else gets
// them when the approver presses "Release to everyone", which unlocks three
// months later (server/util/releaseRollout.js). A hotfix goes to everyone.
import React from "react";
import { FiShield } from "../components/icons.jsx";
import AdminPageHeader from "../components/AdminPageHeader.jsx";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

function fmt(d) {
  return d ? new Date(d).toLocaleString() : "—";
}

function day(d) {
  return d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
}

const STATUS_STYLE = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  superseded: "bg-slate-200 text-slate-600",
  emergency: "bg-purple-100 text-purple-700",
};

function Badge({ status }) {
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_STYLE[status] || "bg-slate-200"}`}>{status}</span>
  );
}

function Version({ c }) {
  return (
    <span>
      <strong>{c.displayName || c.productKey}</strong>{" "}
      <span className="text-slate-500">
        {c.fromVersion ? `v${c.fromVersion}` : "new"} → <strong className="text-slate-800">v{c.toVersion || "?"}</strong>
      </span>
    </span>
  );
}

export default function AdminReleases() {
  const { accessToken } = useAuth();
  const [data, setData] = React.useState(null);
  const [msg, setMsg] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [notes, setNotes] = React.useState({});
  // Pending release id -> true when it should go to everyone now (a hotfix).
  const [hotfix, setHotfix] = React.useState({});

  const load = React.useCallback(async () => {
    try {
      setData(await apiAuthed("/admin/releases", { token: accessToken }));
      setMsg("");
    } catch (e) {
      setMsg(e?.message || "Could not load releases");
    }
  }, [accessToken]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function act(id, action, body) {
    setBusy(`${id}:${action}`);
    setMsg("");
    try {
      await apiAuthed(`/admin/releases/${id}/${action}`, { token: accessToken, method: "POST", body });
      setNotes((n) => ({ ...n, [id]: "" }));
      await load();
    } catch (e) {
      setMsg(e?.message || "Action failed");
    } finally {
      setBusy("");
    }
  }

  function emergency(c) {
    const reason = window.prompt(
      `EMERGENCY: ship ${c.displayName || c.productKey} v${c.toVersion} WITHOUT sign-off?\n\n` +
        "The approver is emailed immediately with your name and reason, it is written to the locked audit log, " +
        "and it stays flagged until they review it.\n\nReason (at least 20 characters):",
    );
    if (reason && reason.trim()) act(c._id, "emergency", { reason: reason.trim() });
  }

  const you = data?.you || {};
  const approver = data?.approver || {};
  const rule = data?.rolloutRule || { seatsMoreThan: 5, months: 3 };
  const isHotfix = (c) => hotfix[c._id] ?? c.rollout === "everyone";

  function releaseToEveryone(r) {
    if (!window.confirm(`Release ${r.displayName} v${r.earlyVersion} to everyone? Single users move from v${r.generalVersion} and are emailed.`)) return;
    act(`rollouts/${r.productKey}`, "everyone", {});
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={FiShield}
        title="Release sign-off"
        subtitle="No update reaches customers until the release approver signs it off. Firms get it first; everyone else later."
      />

      <div className="card text-sm space-y-1">
        <div>
          Release approver:{" "}
          {approver.email ? (
            <strong>
              {approver.name || approver.email} ({approver.email})
            </strong>
          ) : (
            <strong className="text-red-600">none. Releases are blocked until one is named.</strong>
          )}
        </div>
        <div className="text-slate-500">
          {you.isApprover
            ? "You are the approver. Pending builds are also offered to you in your own Installer Hub so you can install and test them before approving. Website changes can be tried at preview.adlmstudio.net."
            : "Only the approver can approve. Nobody can approve a release they submitted themselves."}
        </div>
      </div>

      {msg && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 p-3 text-sm">{msg}</div>}

      {data?.awaitingReview?.length > 0 && (
        <div className="card space-y-3 border border-purple-200">
          <h2 className="text-base md:text-lg font-semibold leading-snug text-purple-800">Emergency releases waiting for review</h2>
          {data.awaitingReview.map((c) => {
            const overdue = c.reviewDueAt && new Date(c.reviewDueAt) < new Date();
            return (
              <div key={c._id} className="rounded-lg border border-slate-200 p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Version c={c} /> <Badge status="emergency" />
                  {overdue && <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-600 text-white">review overdue</span>}
                </div>
                <div className="text-sm text-slate-600">
                  Forced by {c.decidedBy} on {fmt(c.decidedAt)}. Reason: <em>{c.emergencyReason}</em>
                </div>
                {you.isApprover && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className="input w-full sm:w-80"
                      placeholder="Note (required to object)"
                      value={notes[c._id] || ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [c._id]: e.target.value }))}
                    />
                    <button className="btn btn-sm" disabled={!!busy} onClick={() => act(c._id, "review", { verdict: "upheld", note: notes[c._id] })}>
                      Uphold
                    </button>
                    <button
                      className="btn btn-sm bg-red-600 hover:bg-red-700 text-white"
                      disabled={!!busy}
                      onClick={() => act(c._id, "review", { verdict: "objected", note: notes[c._id] })}
                    >
                      Object
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="card space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base md:text-lg font-semibold leading-snug mr-auto">Plugin releases waiting for sign-off</h2>
          <button className="btn btn-sm" onClick={load}>Refresh</button>
        </div>
        {!data ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : data.pending.length === 0 ? (
          <div className="text-sm text-slate-500">Nothing is waiting.</div>
        ) : (
          data.pending.map((c) => (
            <div key={c._id} className="rounded-lg border border-slate-200 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Version c={c} /> <Badge status="pending" />
              </div>
              <div className="text-xs text-slate-500 break-all">
                Submitted by {c.submittedBy || "—"} on {fmt(c.submittedAt)}
                {c.payload?.sha256 ? ` · sha256 ${c.payload.sha256}` : ""}
              </div>
              {c.notifyBody?.releaseNotes && (
                <pre className="text-xs whitespace-pre-wrap bg-slate-50 rounded p-2">{c.notifyBody.releaseNotes}</pre>
              )}
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={isHotfix(c)}
                  disabled={!you.isApprover}
                  onChange={(e) => setHotfix((h) => ({ ...h, [c._id]: e.target.checked }))}
                />
                <span>
                  Hotfix: release to everyone now
                  <span className="block text-xs text-slate-500">
                    {isHotfix(c)
                      ? "Every customer gets it once approved."
                      : `Once approved it goes to firms with more than ${rule.seatsMoreThan} seats; everyone else can have it ${rule.months} months later.`}
                  </span>
                </span>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {you.isApprover && (
                  <>
                    <input
                      className="input w-full sm:w-80"
                      placeholder="Note (required to send back)"
                      value={notes[c._id] || ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [c._id]: e.target.value }))}
                    />
                    <button
                      className="btn btn-sm bg-green-600 hover:bg-green-700 text-white"
                      disabled={!!busy}
                      onClick={() =>
                        act(c._id, "approve", { note: notes[c._id], rollout: isHotfix(c) ? "everyone" : "organizations" })
                      }
                    >
                      {isHotfix(c) ? "Approve and release to everyone" : "Approve and release to firms"}
                    </button>
                    <button className="btn btn-sm" disabled={!!busy} onClick={() => act(c._id, "reject", { note: notes[c._id] })}>
                      Send back
                    </button>
                  </>
                )}
                {you.canEmergency && (
                  <button
                    className="btn btn-sm bg-purple-700 hover:bg-purple-800 text-white ml-auto"
                    disabled={!!busy}
                    onClick={() => emergency(c)}
                  >
                    Emergency release…
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="card space-y-3">
        <h2 className="text-base md:text-lg font-semibold leading-snug">With firms, waiting for everyone</h2>
        <p className="text-sm text-slate-500">
          Firms with more than {rule.seatsMoreThan} seats (added up across all their products) get a build first.
          Everyone else stays on the previous build until you release it to them, which you can do {rule.months} months after
          it first went to firms.
          {data?.earlyFirms?.length ? ` Firms that go first today: ${data.earlyFirms.join(", ")}.` : ""}
        </p>
        {data?.rolloutError && <div className="text-sm text-amber-700">{data.rolloutError}</div>}
        {!data ? null : !data.rollouts?.length ? (
          <div className="text-sm text-slate-500">Nothing is with firms only.</div>
        ) : (
          data.rollouts.map((r) => {
            const id = `rollouts/${r.productKey}`;
            return (
              <div key={r.productKey} className="rounded-lg border border-slate-200 p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{r.displayName}</strong>
                  <span className="text-slate-500">
                    firms <strong className="text-slate-800">v{r.earlyVersion}</strong> · everyone else v{r.generalVersion || "—"}
                  </span>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full ${
                      r.canReleaseToEveryone ? "bg-green-100 text-green-700" : "bg-sky-100 text-sky-800"
                    }`}
                  >
                    {r.canReleaseToEveryone ? "ready for everyone" : `everyone from ${day(r.unlocksAt)}`}
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  With firms since {day(r.startedAt)}
                  {r.firstVersion && r.firstVersion !== r.earlyVersion ? ` (from v${r.firstVersion})` : ""} · latest approved by{" "}
                  {r.approvedBy || "—"} on {fmt(r.approvedAt)}
                </div>
                {you.isApprover && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="btn btn-sm bg-green-600 hover:bg-green-700 text-white"
                      disabled={!!busy || !r.canReleaseToEveryone}
                      title={r.canReleaseToEveryone ? "" : `Unlocks on ${day(r.unlocksAt)}`}
                      onClick={() => releaseToEveryone(r)}
                    >
                      Release to everyone
                    </button>
                    <input
                      className="input w-full sm:w-72"
                      placeholder="Why take it back? (required)"
                      value={notes[id] || ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [id]: e.target.value }))}
                    />
                    <button className="btn btn-sm" disabled={!!busy} onClick={() => act(id, "withdraw", { note: notes[id] })}>
                      Take back from firms
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="card space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base md:text-lg font-semibold leading-snug mr-auto">Website, API and service changes</h2>
          <span className="text-xs text-slate-500">Signed off on GitHub</span>
        </div>
        <p className="text-sm text-slate-500">
          These changes cannot merge until {approver.name || "the approver"} approves the pull request on GitHub.
          Try a website change first at{" "}
          <a className="underline" href="https://preview.adlmstudio.net" target="_blank" rel="noreferrer">preview.adlmstudio.net</a>.
        </p>
        {data?.code?.error && <div className="text-sm text-amber-700">{data.code.error}</div>}
        {!data ? null : !data.code?.pulls?.length ? (
          <div className="text-sm text-slate-500">No open pull requests.</div>
        ) : (
          data.code.pulls.map((p) => (
            <div key={`${p.repo}#${p.number}`} className="rounded-lg border border-slate-200 p-3 flex flex-wrap items-center gap-2">
              <div className="min-w-0 mr-auto">
                <div className="font-medium break-words">{p.title}</div>
                <div className="text-xs text-slate-500">
                  {p.label} · #{p.number} by {p.author}{p.draft ? " · draft" : ""} · opened {fmt(p.createdAt)}
                </div>
              </div>
              <Badge status={p.state === "approved" ? "approved" : p.state === "changes_requested" ? "rejected" : "pending"} />
              <a
                className="btn btn-sm"
                href={p.state === "waiting" ? `${p.url}/files` : p.url}
                target="_blank"
                rel="noreferrer"
              >
                {you.isApprover && p.state === "waiting" ? "Review on GitHub" : "Open"}
              </a>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h2 className="text-base md:text-lg font-semibold leading-snug mb-3">History</h2>
        {data?.recent?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2 pr-3">Release</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Decided by</th>
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Note</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((c) => (
                  <tr key={c._id} className="border-b border-slate-100">
                    <td className="py-2 pr-3"><Version c={c} /></td>
                    <td className="py-2 pr-3">
                      <Badge status={c.status} />
                      {c.reviewVerdict ? <span className="ml-1 text-xs text-slate-500">({c.reviewVerdict})</span> : null}
                      {c.appliedTo ? (
                        <span className="ml-1 text-xs text-slate-500">{c.appliedTo === "everyone" ? "to everyone" : "to firms first"}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">{c.decidedBy || "—"}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{fmt(c.decidedAt)}</td>
                    <td className="py-2 pr-3 text-slate-600">{c.emergencyReason || c.decisionNote || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-slate-500">No decisions yet.</div>
        )}
      </div>
    </div>
  );
}
