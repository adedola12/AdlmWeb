// client/src/components/ReleaseBatchCard.jsx
//
// The batch the approver tests and approves (docs/RELEASE_GATE.md).
//
// This is the whole of Richard's release job: open the test sheet, work down
// the flows on preview.adlmstudio.net and in his own Installer Hub, mark each
// one, then Approve. He never opens GitHub; his approval is what unblocks the
// merge, because GitHub's required check reads it.
import React from "react";
import { apiAuthed } from "../http.js";

const VERDICTS = [
  { key: "works", label: "Works as designed", tone: "bg-green-100 text-green-700" },
  { key: "needs-change", label: "Needs change", tone: "bg-amber-100 text-amber-800" },
  { key: "could-not-test", label: "Couldn't test", tone: "bg-slate-200 text-slate-600" },
];
const KEEP = [
  { key: "keep", label: "Keep", tone: "bg-green-100 text-green-700" },
  { key: "change", label: "Change", tone: "bg-amber-100 text-amber-800" },
  { key: "remove", label: "Remove", tone: "bg-red-100 text-red-700" },
];

// A verdict shows the moment it is picked and saves in the background; only this card
// waits for its own save. It used to disable every button and reload the whole page after
// each click, so the approver waited on every answer and watched the page refresh.
function Item({ item, canDecide, onVerdict, saving }) {
  const options = item.kind === "not-in-design" ? KEEP : VERDICTS;
  const [note, setNote] = React.useState(item.note || "");
  // A note typed after the verdict is saved when the box is left, with the same verdict.
  const saveNote = () => {
    if (item.verdict && note !== (item.note || "")) onVerdict(item.key, item.verdict, note);
  };

  return (
    <div className="rounded-lg border border-slate-200 p-3 space-y-2">
      <div className="font-medium">{item.title}</div>
      {item.where && <div className="text-sm text-slate-600">Where: {item.where}</div>}
      {item.steps?.length > 0 && (
        <ol className="text-sm text-slate-600 list-decimal ml-5 space-y-0.5">
          {item.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}
      {item.designUrl && (
        <a className="text-sm underline" href={item.designUrl} target="_blank" rel="noreferrer">
          Open your design to compare
        </a>
      )}
      {canDecide ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {options.map((o) => (
            <button
              key={o.key}
              disabled={saving}
              aria-pressed={item.verdict === o.key}
              onClick={() => onVerdict(item.key, o.key, note)}
              className={`btn btn-sm ${item.verdict === o.key ? "ring-2 ring-offset-1 ring-slate-400" : ""}`}
            >
              {o.label}
            </button>
          ))}
          <input
            className="input w-full sm:w-72"
            placeholder="Note (what should change?)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
          />
          {saving && <span className="text-xs text-slate-500">Saving…</span>}
        </div>
      ) : (
        item.verdict && (
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${(options.find((o) => o.key === item.verdict) || {}).tone || "bg-slate-200"}`}>
            {(options.find((o) => o.key === item.verdict) || {}).label || item.verdict}
            {item.note ? ` — ${item.note}` : ""}
          </span>
        )
      )}
    </div>
  );
}

export default function ReleaseBatchCard({ token, onChanged }) {
  const [data, setData] = React.useState(null);
  const [msg, setMsg] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [savingKeys, setSavingKeys] = React.useState(() => new Set());

  const load = React.useCallback(async () => {
    try {
      setData(await apiAuthed("/admin/releases/batch", { token }));
      setMsg("");
    } catch (e) {
      setMsg(e?.message || "Could not load the batch");
    }
  }, [token]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function act(path, body) {
    setBusy(true);
    setMsg("");
    try {
      const res = await apiAuthed(path, { token, method: "POST", body });
      if (res?.message) setMsg(res.message);
      await load();
      onChanged?.();
    } catch (e) {
      setMsg(e?.message || "Action failed");
    } finally {
      setBusy(false);
    }
  }

  // One verdict: shown at once, saved in the background, nothing reloaded. On failure the
  // card goes back to what the server holds and says so.
  async function saveVerdict(batchId, key, verdict, itemNote) {
    const patch = (fn) =>
      setData((d) => (d?.batch ? { ...d, batch: { ...d.batch, items: d.batch.items.map((i) => (i.key === key ? fn(i) : i)) } } : d));
    let before = null;
    patch((i) => {
      before = { verdict: i.verdict, note: i.note };
      return { ...i, verdict, note: itemNote };
    });
    setSavingKeys((s) => new Set(s).add(key));
    try {
      await apiAuthed(`/admin/releases/batch/${batchId}/verdict`, { token, method: "POST", body: { key, verdict, note: itemNote } });
    } catch (e) {
      if (before) patch((i) => ({ ...i, ...before }));
      setMsg(`Not saved: ${e?.message || "the verdict could not be saved"}. Pick it again.`);
    } finally {
      setSavingKeys((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }
  }

  const batch = data?.batch;
  const canDecide = !!data?.isApprover && batch && batch.status !== "merged";
  const flows = (batch?.items || []).filter((i) => i.kind !== "behind-the-scenes");
  const behind = (batch?.items || []).filter((i) => i.kind === "behind-the-scenes");
  const undecided = flows.filter((i) => !i.verdict).length;

  if (!batch) {
    return (
      <div className="card text-sm">
        <h2 className="text-base md:text-lg font-semibold leading-snug">This release</h2>
        <div className="text-slate-500 mt-2">Nothing is waiting to be tested. You will be told when the next one is ready.</div>
      </div>
    );
  }

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base md:text-lg font-semibold leading-snug mr-auto">{batch.title}</h2>
        {batch.status === "approved" && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700">approved, going live</span>
        )}
        {batch.status === "changes-requested" && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">sent back</span>
        )}
        {batch.sheetUrl && (
          <a className="btn btn-sm" href={batch.sheetUrl} target="_blank" rel="noreferrer">
            Open the test sheet
          </a>
        )}
      </div>

      <p className="text-sm text-slate-600">
        Try each thing below on{" "}
        <a className="underline" href="https://preview.adlmstudio.net" target="_blank" rel="noreferrer">
          preview.adlmstudio.net
        </a>{" "}
        and in your Installer Hub, say how each one went, then approve. Approving is what sends it to customers.
      </p>

      {msg && <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm">{msg}</div>}

      {flows.map((item) => (
        <Item
          key={item.key}
          item={item}
          canDecide={canDecide}
          saving={savingKeys.has(item.key)}
          onVerdict={(key, verdict, itemNote) => saveVerdict(batch._id, key, verdict, itemNote)}
        />
      ))}

      {behind.length > 0 && (
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="font-medium mb-1">Fixed behind the scenes — nothing to test</div>
          <ul className="list-disc ml-5 text-slate-600 space-y-0.5">
            {behind.map((i) => (
              <li key={i.key}>{i.title}</li>
            ))}
          </ul>
        </div>
      )}

      {canDecide && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
          <input
            className="input w-full sm:w-96"
            placeholder="Anything to add (required if you send it back)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            className="btn btn-sm bg-green-600 hover:bg-green-700 text-white"
            disabled={busy || savingKeys.size > 0}
            onClick={() => act(`/admin/releases/batch/${batch._id}/approve`, { note })}
          >
            Approve and send to customers
          </button>
          <button className="btn btn-sm" disabled={busy || savingKeys.size > 0} onClick={() => act(`/admin/releases/batch/${batch._id}/reject`, { note })}>
            Send back for changes
          </button>
          {undecided > 0 && (
            <span className="text-xs text-slate-500">
              {undecided} of {flows.length} not marked yet — you can still approve.
            </span>
          )}
        </div>
      )}

      {batch.status === "approved" && (
        <div className="text-sm text-slate-600">
          Approved by {batch.approvedBy} on {new Date(batch.approvedAt).toLocaleString()}. Nothing else to do.
        </div>
      )}
    </div>
  );
}
