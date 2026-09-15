// YouTube — the channel beside the library.
//
// Richard drew no screen for this, so it is built in his admin grammar: the
// KPI row from Today, the register table and filter row from every other
// screen. Nothing new to learn.
//
// What it answers, in order: is the library in step with the channel
// catalogue (created, held, missing, unfiled, not in the catalogue), what
// each product page's recommended strip holds today, and — on request —
// whether YouTube will still play each video. That last one is asked live
// rather than stored, because a stored "available" goes stale the moment a
// video is made private, and a stale yes is worse than no answer.
//
// The three actions here are the three things the command-line sync does,
// so an admin without a terminal can do them from this screen.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmFilters, AdmChip } from "./adminUi.jsx";
import { useAdmToast } from "./adminKit.jsx";
import { formatDuration } from "../lib/freeVideos.js";

const when = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

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

const AVAIL = {
  ok: ["good", "Plays"],
  private: ["bad", "Private"],
  missing: ["bad", "Removed"],
  error: ["due", "No answer"],
};

export default function DsAdminYoutube() {
  const { accessToken } = useAuth();
  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [view, setView] = React.useState("all");
  const [avail, setAvail] = React.useState(null); // { checkedAt, tally, results }
  const [busy, setBusy] = React.useState("");
  const [say, toast] = useAdmToast();
  const [reload, setReload] = React.useState(0);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    apiAuthed("/admin/learn/youtube/status", { token: accessToken })
      .then((r) => alive && setD(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken, reload]);

  async function act(name, path, body, done) {
    if (busy) return;
    setBusy(name);
    try {
      const r = await apiAuthed(path, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      done(r);
    } catch (e) {
      say(e?.message || "The server refused that. Nothing was changed.");
    } finally {
      setBusy("");
    }
  }

  const check = () =>
    act("check", "/admin/learn/youtube/check", {}, (r) => {
      setAvail(r);
      const t = r.tally || {};
      say(
        `Asked YouTube about ${Object.keys(r.results || {}).length} videos: ${t.ok || 0} play, ${t.private || 0} private, ${t.missing || 0} removed${t.error ? `, ${t.error} gave no answer` : ""}.`,
      );
    });

  const sync = () =>
    act("sync", "/admin/learn/youtube/sync", {}, (r) => {
      setReload((n) => n + 1);
      say(`Catalogue applied: ${r.created} added, ${r.updated} updated, ${r.unchanged} already in step.`);
    });

  const publish = () =>
    act("publish", "/admin/learn/youtube/publish", {}, (r) => {
      setReload((n) => n + 1);
      say(r.published ? `${r.published} held video${r.published === 1 ? "" : "s"} published.` : "Nothing was held back.");
    });

  if (failed) {
    return <p className="adm-note">The YouTube status could not be read just now. Please refresh.</p>;
  }

  const s = d?.summary || {};
  const rows = d?.rows || [];
  const stateOf = (r) => avail?.results?.[r.youtubeId]?.state || "";

  const counts = {
    all: rows.length,
    held: rows.filter((r) => r.inLibrary && !r.published).length,
    unfiled: rows.filter((r) => r.inLibrary && !r.filed).length,
    recommended: rows.filter((r) => r.recommended && r.published).length,
    missing: rows.filter((r) => !r.inLibrary).length,
    orphans: rows.filter((r) => r.inLibrary && !r.inCatalogue).length,
    trouble: avail ? rows.filter((r) => ["private", "missing", "error"].includes(stateOf(r))).length : null,
  };
  const shown = rows.filter((r) => {
    if (view === "held") return r.inLibrary && !r.published;
    if (view === "unfiled") return r.inLibrary && !r.filed;
    if (view === "recommended") return r.recommended && r.published;
    if (view === "missing") return !r.inLibrary;
    if (view === "orphans") return r.inLibrary && !r.inCatalogue;
    if (view === "trouble") return ["private", "missing", "error"].includes(stateOf(r));
    return true;
  });

  const cols = [
    {
      h: "Video",
      w: "34%",
      cell: (r) => (
        <AdmTwo
          top={r.title}
          under={
            <a href={`https://www.youtube.com/watch?v=${r.youtubeId}`} target="_blank" rel="noreferrer">
              {r.youtubeId}
            </a>
          }
        />
      ),
    },
    {
      h: "Shelf",
      cell: (r) =>
        r.filed ? (
          <AdmTwo top={r.sectionLabel} under={r.shelfDiffers ? `catalogue says ${r.catalogueSection}` : ""} />
        ) : (
          <AdmChip tone="due">unfiled</AdmChip>
        ),
    },
    {
      h: "Library",
      cell: (r) =>
        !r.inLibrary ? (
          <AdmChip tone="bad">not added</AdmChip>
        ) : !r.published ? (
          <AdmChip tone="due">held</AdmChip>
        ) : (
          <AdmChip tone="good">published</AdmChip>
        ),
    },
    {
      h: "Recommended",
      cell: (r) =>
        r.recommended ? (
          <span>{PRODUCT_NAMES[r.productKey] || (r.productKey === "*" ? "every product" : r.productKey || "—")}</span>
        ) : (
          <AdmDim>—</AdmDim>
        ),
    },
    { h: "Length", num: true, cell: (r) => formatDuration(r.durationSec) || <AdmDim>unknown</AdmDim> },
    {
      h: "Catalogue",
      cell: (r) => (r.inCatalogue ? when(r.publishedAt) || <AdmDim>listed</AdmDim> : <AdmChip tone="due">not in catalogue</AdmChip>),
    },
    {
      h: "On YouTube",
      cell: (r) => {
        const st = stateOf(r);
        if (!st) return <AdmDim>{avail ? "—" : "not checked"}</AdmDim>;
        const [tone, label] = AVAIL[st] || ["", st];
        return <AdmChip tone={tone}>{label}</AdmChip>;
      },
    },
  ];

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">YouTube</h1>
          <p className="adm-lede">
            The ADLM Studio channel beside the free library. The catalogue is the reviewed filing
            of every video onto a shelf; the library is what the Learn page shows. This says where
            the two differ, what each product page recommends today, and — when asked — whether
            YouTube will still play each video.
          </p>
        </div>
        <div className="adm-acts">
          <button type="button" className="ds-btn btn-o ds-btn-sm" disabled={!!busy || !d} onClick={check}>
            {busy === "check" ? "Asking YouTube…" : "Check on YouTube"}
          </button>
          <button type="button" className="ds-btn btn-o ds-btn-sm" disabled={!!busy || !d} onClick={sync}>
            {busy === "sync" ? "Applying…" : "Apply the catalogue"}
          </button>
          <button
            type="button"
            className="ds-btn btn-p ds-btn-sm"
            disabled={!!busy || !s.held}
            onClick={publish}
            title={s.held ? "Publish every held catalogue video" : "Nothing is held back"}
          >
            {busy === "publish" ? "Publishing…" : `Publish held${s.held ? ` (${s.held})` : ""}`}
          </button>
        </div>
      </div>

      {d?.problems?.length ? (
        <p className="adm-note adm-bad">
          The catalogue cannot be applied until this is fixed: {d.problems.join(" · ")}
        </p>
      ) : null}

      <div className="adm-kpis">
        <div className="adm-kpi">
          <span className="k">On the channel catalogue</span>
          <b>{d ? s.catalogue : "—"}</b>
          <span className="ds-sub">
            {s.pulledOn ? `Pulled ${when(s.pulledOn)}` : "No pull date recorded"}
          </span>
        </div>
        <div className="adm-kpi">
          <span className="k">In the library</span>
          <b>
            {d ? s.published : "—"}
            <span className="u">published</span>
          </b>
          <span className="ds-sub">{d ? `${s.library} rows · ${s.recommended} recommended` : ""}</span>
        </div>
        <div className={`adm-kpi${s.held || s.missing ? " warn" : ""}`}>
          <span className="k">Not yet showing</span>
          <b>{d ? s.held + s.missing : "—"}</b>
          <span className="ds-sub">{d ? `${s.held} held · ${s.missing} not added yet` : ""}</span>
        </div>
        <div className={`adm-kpi${s.unfiled || s.orphans || s.shelfDiffers ? " warn" : ""}`}>
          <span className="k">Needs a look</span>
          <b>{d ? s.unfiled + s.orphans + s.shelfDiffers : "—"}</b>
          <span className="ds-sub">
            {d ? `${s.unfiled} unfiled · ${s.orphans} not in catalogue · ${s.shelfDiffers} shelf differs` : ""}
          </span>
        </div>
      </div>

      {d && (
        <div className="adm-cols" style={{ marginBottom: 20 }}>
          <section className="adm-panel">
            <div className="adm-panel-h">
              <h2>Shelves</h2>
              <span className="note">what the Learn page groups by</span>
            </div>
            <div className="adm-panel-b">
              <AdmTable
                cols={[
                  { h: "Shelf", cell: (x) => <AdmTwo top={x.label} under={x.productKey === "*" ? "every product page" : PRODUCT_NAMES[x.productKey] ? `${PRODUCT_NAMES[x.productKey]} page` : ""} /> },
                  { h: "Videos", num: true, cell: (x) => x.total },
                  { h: "Published", num: true, cell: (x) => (x.published === x.total ? x.published : <AdmChip tone="due">{x.published}</AdmChip>) },
                  { h: "Recommended", num: true, cell: (x) => x.recommended || <AdmDim>—</AdmDim> },
                ]}
                rows={d.shelves}
                rowKey={(x) => x.slug || "unfiled"}
                empty={["No shelves", "Nothing is filed yet."]}
              />
            </div>
          </section>
          <section className="adm-panel">
            <div className="adm-panel-h">
              <h2>Product pages</h2>
              <span className="note">the recommended strip today</span>
            </div>
            <div className="adm-panel-b">
              <AdmTable
                cols={[
                  { h: "Product", cell: (p) => PRODUCT_NAMES[p.key] || p.key },
                  { h: "Own", num: true, cell: (p) => p.own || <AdmDim>0</AdmDim> },
                  { h: "Shared", num: true, cell: (p) => p.shared || <AdmDim>0</AdmDim> },
                  { h: "Shows", num: true, cell: (p) => Math.min(6, p.own + p.shared) },
                ]}
                rows={d.products}
                rowKey={(p) => p.key}
                empty={["No products", "No shelf points at a product."]}
              />
            </div>
          </section>
        </div>
      )}

      <AdmFilters
        current={view}
        onPick={setView}
        options={[
          ["all", "Everything", counts.all],
          ["held", "Held", counts.held],
          ["missing", "Not added", counts.missing],
          ["unfiled", "Unfiled", counts.unfiled],
          ["orphans", "Not in catalogue", counts.orphans],
          ["recommended", "Recommended", counts.recommended],
          ...(avail ? [["trouble", "Will not play", counts.trouble]] : []),
        ]}
      />

      {!d ? (
        <p className="adm-note">Reading the library…</p>
      ) : (
        <AdmTable
          cols={cols}
          rows={shown}
          rowKey={(r) => r.youtubeId}
          empty={["Nothing here", "No video matches this view."]}
        />
      )}

      <p className="adm-foot-note">
        Applying the catalogue adds what the library lacks and fills blanks on what it holds; it never
        deletes or unpublishes. New uploads reach the catalogue by editing server/data/youtube-free-videos.json
        and applying it here. A video the check calls private or removed still shows on the Learn page
        until somebody unpublishes it in Free lessons.
        {avail?.checkedAt ? ` Last checked ${new Date(avail.checkedAt).toLocaleTimeString("en-GB")}.` : ""}
      </p>

      {toast}
    </>
  );
}
