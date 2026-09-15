// src/pages/AdminYoutubeStatus.jsx
//
// YouTube status — the channel beside the free library, in the older admin
// build. The same three actions the command-line sync offers, for an admin
// without a terminal: apply the catalogue, publish held videos, and ask
// YouTube whether each video will still play. The DS build's screen is
// ds/DsAdminYoutube.jsx; both read the same endpoints.

import React from "react";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { formatDuration } from "../lib/freeVideos.js";

const PRODUCT_NAMES = {
  revit: "QUIV",
  planswift: "HERON",
  mep: "Revit MEP",
  rategen: "RateGen",
  "qs-takeoff": "Time Pro",
  civil3d: "CIVIQ",
  bimbld: "BIM course",
  BIMMEP: "BIM MEP course",
};

const when = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

function Kpi({ label, value, sub, warn }) {
  return (
    <div className={`card p-4 ${warn ? "ring-1 ring-amber-400/60" : ""}`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-adlm-dark-muted">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${warn ? "text-amber-600 dark:text-amber-400" : ""}`}>{value}</div>
      {sub ? <div className="text-[11px] text-slate-500 dark:text-adlm-dark-muted mt-0.5">{sub}</div> : null}
    </div>
  );
}

function Chip({ tone = "", children }) {
  const cls = {
    good: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
    due: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
    bad: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30",
    "": "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/5 dark:text-adlm-dark-muted dark:ring-white/10",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${cls}`}>{children}</span>;
}

const AVAIL = { ok: ["good", "Plays"], private: ["bad", "Private"], missing: ["bad", "Removed"], error: ["due", "No answer"] };

export default function AdminYoutubeStatus() {
  const { accessToken } = useAuth();
  const [d, setD] = React.useState(null);
  const [msg, setMsg] = React.useState("");
  const [view, setView] = React.useState("all");
  const [avail, setAvail] = React.useState(null);
  const [busy, setBusy] = React.useState("");

  const load = React.useCallback(async () => {
    try {
      setD(await apiAuthed("/admin/learn/youtube/status", { token: accessToken }));
    } catch (e) {
      setMsg(e.message || "Could not read the status.");
    }
  }, [accessToken]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function act(name, path, done) {
    if (busy) return;
    setBusy(name);
    setMsg("");
    try {
      done(await apiAuthed(path, { token: accessToken, method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }));
    } catch (e) {
      setMsg(e.message || "The server refused that.");
    } finally {
      setBusy("");
    }
  }

  const check = () =>
    act("check", "/admin/learn/youtube/check", (r) => {
      setAvail(r);
      const t = r.tally || {};
      setMsg(`Asked YouTube about ${Object.keys(r.results || {}).length} videos: ${t.ok || 0} play, ${t.private || 0} private, ${t.missing || 0} removed${t.error ? `, ${t.error} gave no answer` : ""}.`);
    });
  const sync = () =>
    act("sync", "/admin/learn/youtube/sync", async (r) => {
      await load();
      setMsg(`Catalogue applied: ${r.created} added, ${r.updated} updated, ${r.unchanged} already in step.`);
    });
  const publish = () =>
    act("publish", "/admin/learn/youtube/publish", async (r) => {
      await load();
      setMsg(r.published ? `${r.published} held video(s) published.` : "Nothing was held back.");
    });

  const s = d?.summary || {};
  const rows = d?.rows || [];
  const stateOf = (r) => avail?.results?.[r.youtubeId]?.state || "";
  const filters = [
    ["all", "Everything", rows.length],
    ["held", "Held", rows.filter((r) => r.inLibrary && !r.published).length],
    ["missing", "Not added", rows.filter((r) => !r.inLibrary).length],
    ["unfiled", "Unfiled", rows.filter((r) => r.inLibrary && !r.filed).length],
    ["orphans", "Not in catalogue", rows.filter((r) => r.inLibrary && !r.inCatalogue).length],
    ["recommended", "Recommended", rows.filter((r) => r.recommended && r.published).length],
    ...(avail ? [["trouble", "Will not play", rows.filter((r) => ["private", "missing", "error"].includes(stateOf(r))).length]] : []),
  ];
  const shown = rows.filter((r) => {
    if (view === "held") return r.inLibrary && !r.published;
    if (view === "unfiled") return r.inLibrary && !r.filed;
    if (view === "recommended") return r.recommended && r.published;
    if (view === "missing") return !r.inLibrary;
    if (view === "orphans") return r.inLibrary && !r.inCatalogue;
    if (view === "trouble") return ["private", "missing", "error"].includes(stateOf(r));
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
              <span aria-hidden="true" className="h-6 w-1.5 rounded-full bg-gradient-to-b from-adlm-orange to-amber-400" />
              Admin · YouTube
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-adlm-dark-muted max-w-3xl">
              The ADLM Studio channel beside the free library. The catalogue is the reviewed filing of every
              video onto a shelf; the library is what the Learn page shows.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm" disabled={!!busy || !d} onClick={check}>
              {busy === "check" ? "Asking YouTube…" : "Check on YouTube"}
            </button>
            <button type="button" className="btn btn-sm" disabled={!!busy || !d} onClick={sync}>
              {busy === "sync" ? "Applying…" : "Apply the catalogue"}
            </button>
            <button type="button" className="btn btn-sm" disabled={!!busy || !s.held} onClick={publish}>
              {busy === "publish" ? "Publishing…" : `Publish held${s.held ? ` (${s.held})` : ""}`}
            </button>
          </div>
        </div>
        {msg && <div className="text-sm mt-3">{msg}</div>}
        {d?.problems?.length ? (
          <div className="text-sm mt-3 text-rose-600">The catalogue cannot be applied until this is fixed: {d.problems.join(" · ")}</div>
        ) : null}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="On the channel catalogue" value={d ? s.catalogue : "—"} sub={s.pulledOn ? `Pulled ${when(s.pulledOn)}` : ""} />
        <Kpi label="Published in the library" value={d ? s.published : "—"} sub={d ? `${s.library} rows · ${s.recommended} recommended` : ""} />
        <Kpi label="Not yet showing" value={d ? s.held + s.missing : "—"} sub={d ? `${s.held} held · ${s.missing} not added yet` : ""} warn={!!(s.held || s.missing)} />
        <Kpi label="Needs a look" value={d ? s.unfiled + s.orphans + s.shelfDiffers : "—"} sub={d ? `${s.unfiled} unfiled · ${s.orphans} not in catalogue · ${s.shelfDiffers} shelf differs` : ""} warn={!!(s.unfiled || s.orphans || s.shelfDiffers)} />
      </div>

      {d && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="card">
            <h2 className="font-semibold mb-2">Shelves</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500 dark:text-adlm-dark-muted">
                <tr><th className="py-1">Shelf</th><th className="py-1 text-right">Videos</th><th className="py-1 text-right">Published</th><th className="py-1 text-right">Recommended</th></tr>
              </thead>
              <tbody>
                {d.shelves.map((x) => (
                  <tr key={x.slug || "unfiled"} className="border-t border-slate-100 dark:border-white/5">
                    <td className="py-1.5">{x.label}<span className="ml-2 text-xs text-slate-500">{x.productKey === "*" ? "every product page" : PRODUCT_NAMES[x.productKey] ? `${PRODUCT_NAMES[x.productKey]} page` : ""}</span></td>
                    <td className="py-1.5 text-right tabular-nums">{x.total}</td>
                    <td className="py-1.5 text-right tabular-nums">{x.published === x.total ? x.published : <Chip tone="due">{x.published}</Chip>}</td>
                    <td className="py-1.5 text-right tabular-nums">{x.recommended || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h2 className="font-semibold mb-2">Product pages · the recommended strip today</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500 dark:text-adlm-dark-muted">
                <tr><th className="py-1">Product</th><th className="py-1 text-right">Own</th><th className="py-1 text-right">Shared</th><th className="py-1 text-right">Shows</th></tr>
              </thead>
              <tbody>
                {d.products.map((p) => (
                  <tr key={p.key} className="border-t border-slate-100 dark:border-white/5">
                    <td className="py-1.5">{PRODUCT_NAMES[p.key] || p.key}</td>
                    <td className="py-1.5 text-right tabular-nums">{p.own}</td>
                    <td className="py-1.5 text-right tabular-nums">{p.shared}</td>
                    <td className="py-1.5 text-right tabular-nums">{Math.min(6, p.own + p.shared)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex flex-wrap gap-2 mb-3">
          {filters.map(([v, label, n]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 transition ${view === v ? "bg-adlm-blue-700 text-white ring-adlm-blue-700" : "bg-white dark:bg-white/5 text-slate-700 dark:text-adlm-dark-text ring-slate-200 dark:ring-white/10"}`}
            >
              {label} <span className={view === v ? "text-white/70" : "text-slate-400"}>{n}</span>
            </button>
          ))}
        </div>
        {!d ? (
          <div className="text-sm text-slate-600">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500 dark:text-adlm-dark-muted">
                <tr>
                  <th className="py-1 pr-3">Video</th><th className="py-1 pr-3">Shelf</th><th className="py-1 pr-3">Library</th>
                  <th className="py-1 pr-3">Recommended</th><th className="py-1 pr-3 text-right">Length</th><th className="py-1 pr-3">Catalogue</th><th className="py-1">On YouTube</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const st = stateOf(r);
                  const [tone, label] = AVAIL[st] || ["", ""];
                  return (
                    <tr key={r.youtubeId} className="border-t border-slate-100 dark:border-white/5 align-top">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{r.title}</div>
                        <a className="text-xs text-adlm-blue-700 dark:text-adlm-blue-400 hover:underline" href={`https://www.youtube.com/watch?v=${r.youtubeId}`} target="_blank" rel="noreferrer">{r.youtubeId}</a>
                      </td>
                      <td className="py-2 pr-3">{r.filed ? <>{r.sectionLabel}{r.shelfDiffers && <div className="text-xs text-amber-600">catalogue says {r.catalogueSection}</div>}</> : <Chip tone="due">unfiled</Chip>}</td>
                      <td className="py-2 pr-3">{!r.inLibrary ? <Chip tone="bad">not added</Chip> : !r.published ? <Chip tone="due">held</Chip> : <Chip tone="good">published</Chip>}</td>
                      <td className="py-2 pr-3">{r.recommended ? PRODUCT_NAMES[r.productKey] || (r.productKey === "*" ? "every product" : r.productKey || "—") : <span className="text-slate-400">—</span>}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatDuration(r.durationSec) || <span className="text-slate-400">unknown</span>}</td>
                      <td className="py-2 pr-3">{r.inCatalogue ? when(r.publishedAt) || "listed" : <Chip tone="due">not in catalogue</Chip>}</td>
                      <td className="py-2">{st ? <Chip tone={tone}>{label}</Chip> : <span className="text-slate-400">{avail ? "—" : "not checked"}</span>}</td>
                    </tr>
                  );
                })}
                {!shown.length && (
                  <tr><td colSpan={7} className="py-4 text-sm text-slate-500">No video matches this view.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500 dark:text-adlm-dark-muted">
          Applying the catalogue adds what the library lacks and fills blanks on what it holds; it never deletes or
          unpublishes. New uploads reach the catalogue by editing server/data/youtube-free-videos.json and applying it here.
          {avail?.checkedAt ? ` Last checked ${new Date(avail.checkedAt).toLocaleTimeString("en-GB")}.` : ""}
        </p>
      </div>
    </div>
  );
}
