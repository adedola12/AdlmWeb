// Organisation videos — a recording made for one firm, filed so that firm's
// accounts can watch it.
//
// The register is one row per video, grouped under the organisation it was
// made for. Adding one is a drawer: the title, which firm (picked from the
// names already on the licences, or typed for a firm that has none yet), a
// note, and either a file or a link.
//
// A file goes from THIS browser straight into the course archive bucket — the
// API only signs the upload (it runs on Lambda, which cannot carry the
// bytes). MediaConvert then builds the adaptive ladder, and the row reads
// "Encoding 60%" until the stream is live; the master plays as one file in
// the meantime. A pasted link (Drive, YouTube, an MP4) needs no upload at all.
//
// The upload flow itself lives in lib/useOrgVideoUpload.js, shared with the
// quick-add panel on the old Admin Hub, so a file started on either screen
// shows the same progress on the same row.
//
// "Improve quality" builds (or rebuilds) the ladder: every rendition the
// recording supports, up to its own resolution. It cannot add detail the
// recording never had.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { SecureVideo } from "../components/SecureVideo.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmChip, AdmFilters } from "./adminUi.jsx";
import { useAdmToast, checkFields } from "./adminKit.jsx";
import { AdmDrawer, AdmFields } from "./adminForm.jsx";
import { useOrgVideoUpload, orgVideoState, enhanceBlocker } from "../lib/useOrgVideoUpload.js";
import { useOrgVideoPlayback } from "../lib/useOrgVideoPlayback.js";
import { clockOf, sizeOf } from "../lib/orgVideoPlayer.js";

const NEW_ORG = "__new__";

const when = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "";

const BLANK = { title: "", orgPick: "", orgName: "", description: "", how: "upload", videoUrl: "" };

/** The preview inside the Watch drawer. */
function AdminPreview({ video, token }) {
  const pb = useOrgVideoPlayback(video, { token, admin: true });
  if (pb.kind === "embed" && pb.src) {
    return (
      <div style={{ position: "relative", aspectRatio: "16 / 9", background: "#000", borderRadius: 10, overflow: "hidden" }}>
        <iframe
          src={pb.src}
          title={video.title}
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
        />
      </div>
    );
  }
  if (pb.src) {
    return (
      <>
        <SecureVideo
          src={pb.src}
          preload="metadata"
          className="rounded-xl"
          videoClassName="object-contain"
          style={{ aspectRatio: "16 / 9", background: "#000", borderRadius: 10 }}
        />
        <p className="adm-note" style={{ marginTop: 10 }}>
          {pb.kind === "stream"
            ? "Playing the adaptive stream from CloudFront — what the firm gets."
            : pb.kind === "master"
              ? "Playing the uploaded master as one file. The adaptive stream replaces this once the encode completes."
              : "Playing the pasted link."}
        </p>
      </>
    );
  }
  return <p className="adm-note">{pb.error || "Arranging playback…"}</p>;
}

export default function DsAdminOrgVideos() {
  const { accessToken } = useAuth();
  const [d, setD] = React.useState(null);
  const [orgs, setOrgs] = React.useState([]);
  const [failed, setFailed] = React.useState(false);
  const [view, setView] = React.useState("");
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [reload, setReload] = React.useState(0);
  const [open, setOpen] = React.useState(null);
  const [confirming, setConfirming] = React.useState(null);
  const [file, setFile] = React.useState(null);
  const [say, toast] = useAdmToast();

  /** Replace one row in the loaded list without refetching everything. */
  const putRow = React.useCallback(
    (item) =>
      setD((cur) =>
        cur ? { ...cur, items: cur.items.map((r) => (r.id === item.id ? item : r)) } : cur,
      ),
    [],
  );

  const up = useOrgVideoUpload({ token: accessToken, storage: d?.storage, onRow: putRow, say });

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    const t = setTimeout(() => {
      apiAuthed("/admin/org-videos", { token: accessToken, params: { org: view, q } })
        .then((r) => alive && setD(r))
        .catch(() => alive && setFailed(true));
    }, q ? 220 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [accessToken, view, q, reload]);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    apiAuthed("/admin/org-videos/organisations", { token: accessToken })
      .then((r) => alive && setOrgs(Array.isArray(r?.items) ? r.items : []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [accessToken, reload]);

  // A row still encoding when the screen opens gets watched, so its chip
  // moves without a refresh — a file started from the old hub, say.
  React.useEffect(() => {
    for (const v of d?.items || []) {
      const p = v.pipeline;
      if (p && p.master && !p.stream && p.status && !["COMPLETE", "ERROR", "CANCELED"].includes(p.status) && !up.uploads[v.id]) {
        up.watchEncode(v.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.items?.length]);

  /* ─────────────────────────────────────────────────────────── drawer ── */

  const orgOptions = [
    ["", "Choose an organisation…"],
    ...orgs.map((o) => [o.name, `${o.name}${o.people ? ` · ${o.people} ${o.people === 1 ? "account" : "accounts"}` : ""}`]),
    [NEW_ORG, "Another organisation (type the name)…"],
  ];

  const FIELDS = [
    { k: "title", label: "Title", type: "text", required: true, wide: true, placeholder: "QUIV demo — takeoff to BoQ, 9 Sep" },
    {
      k: "orgPick",
      label: "For which organisation",
      type: "select",
      options: orgOptions,
      required: true,
      reqMsg: "Pick the firm this was made for.",
      hint: "These are the firm names on the licences. Their accounts see the video; nobody else does.",
    },
    {
      k: "orgName",
      label: "Organisation name",
      type: "text",
      required: true,
      placeholder: "As it will appear on their licences",
      when: (v) => v.orgPick === NEW_ORG,
      hint: "Match the spelling used when their licences are set up, or the video will not find them.",
    },
    { k: "description", label: "A note to go with it", type: "textarea", rows: 3, wide: true, placeholder: "What was covered, what to try next." },
    {
      k: "how",
      label: "The recording",
      type: "select",
      options: [
        ["upload", "Upload a file — encoded for adaptive streaming"],
        ["link", "Paste a link (Drive, YouTube, an MP4)"],
      ],
    },
    {
      k: "videoUrl",
      label: "Link",
      type: "text",
      wide: true,
      placeholder: "https://drive.google.com/file/d/… or https://youtu.be/…",
      when: (v) => v.how === "link",
      required: true,
      reqMsg: "Paste the link, or switch to uploading a file.",
    },
  ];

  function openNew() {
    setFile(null);
    setOpen({ mode: "edit", row: null, errors: {}, values: { ...BLANK } });
  }

  function openEdit(v) {
    setFile(null);
    const known = orgs.some((o) => o.name === v.orgName);
    setOpen({
      mode: "edit",
      row: v,
      errors: {},
      values: {
        title: v.title,
        orgPick: known ? v.orgName : NEW_ORG,
        orgName: known ? "" : v.orgName,
        description: v.description || "",
        how: v.source === "link" ? "link" : "upload",
        videoUrl: v.source === "link" ? v.videoUrl : "",
      },
    });
  }

  async function save() {
    if (!open || busy) return;
    const v = open.values;
    const errors = checkFields(FIELDS, v);
    const orgName = v.orgPick === NEW_ORG ? String(v.orgName || "").trim() : v.orgPick;
    if (!orgName) errors.orgPick = errors.orgPick || "Pick the firm this was made for.";
    const hasSomething = open.row && (open.row.pipeline?.master || open.row.videoUrl);
    if (v.how === "upload" && !file && !hasSomething) {
      errors.videoUrl = "Choose a file, or paste a link instead.";
    }
    if (Object.keys(errors).length) {
      setOpen((o) => ({ ...o, errors }));
      return;
    }

    setBusy(true);
    try {
      const body = {
        title: v.title.trim(),
        orgName,
        description: String(v.description || "").trim(),
      };
      if (v.how === "link") body.videoUrl = String(v.videoUrl || "").trim();

      const r = await apiAuthed(open.row ? `/admin/org-videos/${open.row.id}` : "/admin/org-videos", {
        token: accessToken,
        method: open.row ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const item = r?.item;
      setOpen(null);
      setReload((n) => n + 1);

      if (v.how === "upload" && file && item?.id) {
        say(`Saved. Uploading “${file.name}”…`);
        const f = file;
        setFile(null);
        up.sendFile(item.id, f);
      } else {
        say(open.row ? "Saved." : `Added for ${orgName}.`);
      }
    } catch (e) {
      say(e?.message || "The server refused that. Nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublished(v) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await apiAuthed(`/admin/org-videos/${v.id}`, {
        token: accessToken,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished: !v.isPublished }),
      });
      if (r?.item) putRow(r.item);
      say(v.isPublished ? `“${v.title}” is hidden from ${v.orgName}.` : `“${v.title}” is live for ${v.orgName}.`);
    } catch (e) {
      say(e?.message || "The server refused that. Nothing changed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(v) {
    if (busy) return;
    setBusy(true);
    try {
      await apiAuthed(`/admin/org-videos/${v.id}`, { token: accessToken, method: "DELETE" });
      setConfirming(null);
      up.clearUp(v.id);
      setReload((n) => n + 1);
      say(`“${v.title}” removed, and the file with it.`);
    } catch (e) {
      say(e?.message || "The server refused that. Nothing was removed.");
    } finally {
      setBusy(false);
    }
  }

  if (failed) {
    return <p className="adm-note">Organisation videos could not be loaded just now. Please refresh.</p>;
  }

  const items = d?.items || [];
  const counts = d?.counts || {};
  const orgTabs = Object.keys(counts).sort((a, b) => a.localeCompare(b));
  const storage = d?.storage;

  const cols = [
    {
      h: "Video",
      w: "28%",
      cell: (v) => (
        <AdmTwo
          top={v.title}
          under={[v.durationSec ? clockOf(v.durationSec) : "", v.fileName ? `${v.fileName}${v.fileSize ? ` · ${sizeOf(v.fileSize)}` : ""}` : ""]
            .filter(Boolean)
            .join(" · ")}
        />
      ),
    },
    { h: "For", cell: (v) => v.orgName },
    {
      h: "Status",
      cell: (v) => {
        const s = orgVideoState(v, up.uploads[v.id]);
        return <AdmChip tone={s.tone}>{s.word}</AdmChip>;
      },
    },
    {
      h: "Quality",
      cell: (v) => {
        const p = v.pipeline;
        if (p) {
          if (p.stream) return <AdmTwo top="Adaptive stream" under="every rendition up to the recording's own" />;
          if (p.master) return <AdmTwo top="As recorded" under={p.error ? p.error.slice(0, 60) : "one file, until the encode completes"} />;
          return <AdmDim>nothing uploaded</AdmDim>;
        }
        if (v.source === "bunny" || v.source === "r2") return <AdmDim>older storage</AdmDim>;
        if (v.source === "link") return <AdmDim>external</AdmDim>;
        return <AdmDim>—</AdmDim>;
      },
    },
    {
      h: "Watched",
      cell: (v) =>
        v.watchers ? (
          <AdmTwo
            top={`${v.watchers} ${v.watchers === 1 ? "person" : "people"}`}
            under={v.lastWatchedAt ? `last ${when(v.lastWatchedAt)}` : ""}
          />
        ) : (
          <AdmDim>not yet</AdmDim>
        ),
    },
    { h: "Added", cell: (v) => when(v.createdAt) },
    {
      h: "Live",
      cell: (v) => (
        <label className="adm-switch" title={v.isPublished ? "Their accounts can see it" : "Hidden from their accounts"}>
          <input
            type="checkbox"
            checked={!!v.isPublished}
            disabled={busy}
            onChange={() => togglePublished(v)}
            aria-label={`${v.isPublished ? "Hide" : "Show"} ${v.title}`}
          />
        </label>
      ),
    },
    {
      h: "",
      cell: (v) => {
        if (confirming === v.id) {
          return (
            <span className="adm-log">
              <b>Delete “{v.title}”?</b>
              <span>The file goes too. Hiding it instead keeps it here.</span>
              <span className="adm-rowacts">
                <button type="button" className="ds-btn btn-p ds-btn-sm" disabled={busy} onClick={() => remove(v)}>
                  Delete it
                </button>
                <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => setConfirming(null)}>
                  Keep it
                </button>
              </span>
            </span>
          );
        }
        const canWatch = v.pipeline ? v.pipeline.master : !!v.videoUrl;
        const blocker = enhanceBlocker(v, storage);
        return (
          <span className="adm-rowacts">
            {canWatch ? (
              <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => setOpen({ mode: "watch", row: v })}>
                Watch
              </button>
            ) : null}
            <button
              type="button"
              className="ds-btn btn-o ds-btn-sm"
              disabled={!!blocker || !!up.uploads[v.id]}
              title={blocker || "Build every rendition the recording allows"}
              onClick={() => up.enhance(v)}
            >
              Improve quality
            </button>
            <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => openEdit(v)}>
              Edit
            </button>
            <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => setConfirming(v.id)}>
              Delete
            </button>
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
          <h1 className="adm-h">Organisation videos</h1>
          <p className="adm-lede">
            A recording made for one firm — a demo walked through on a call, a recap of a training
            day. It is filed under the organisation name on their licences and appears under
            “My learning” on every account that carries that name. Nobody else sees it.
          </p>
        </div>
        <div className="adm-acts">
          <label className="adm-find" style={{ margin: 0 }}>
            <input
              type="search"
              value={q}
              placeholder="Search titles and firms"
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search"
            />
          </label>
          <button type="button" className="ds-btn btn-p ds-btn-sm" onClick={openNew}>
            + Add a video
          </button>
        </div>
      </div>

      {orgTabs.length > 1 ? (
        <AdmFilters
          current={view}
          onPick={setView}
          options={[["", "Every organisation", items.length], ...orgTabs.map((o) => [o, o, counts[o]])]}
        />
      ) : null}

      {d && !storage?.pipeline ? (
        <p className="adm-note">
          The video pipeline (archive bucket, MediaConvert, CloudFront) is not configured on this server, so a
          recording can only be added as a link.
        </p>
      ) : d && !storage?.cloudfront ? (
        <p className="adm-note">
          CloudFront signing is not configured on this server, so uploads play as one file rather than as the
          adaptive stream.
        </p>
      ) : null}

      {!d ? (
        <p className="adm-note">Reading…</p>
      ) : (
        <>
          <AdmTable
            cols={cols}
            rows={items}
            rowKey={(v) => v.id}
            empty={[
              "No organisation videos yet",
              "Add one and pick the firm it was made for. Their accounts see it under My learning the moment it is live.",
            ]}
          />
          {items.length ? (
            <div className="adm-merge">
              <b>What “Improve quality” can and cannot do.</b>
              <span>
                It builds the adaptive ladder from the uploaded master — every rendition the recording
                supports, 1080p if it was recorded at 1080p, 4K if it was recorded at 4K — so the picture
                stops stalling on a slow connection and stays sharp on a good one. It cannot add detail
                the recording never had: record the screen at 1080p or better and the encode follows.
              </span>
            </div>
          ) : null}
        </>
      )}

      {open?.mode === "edit" ? (
        <AdmDrawer
          title={open.row ? "Edit this video" : "Add a video for an organisation"}
          intro={
            open.row
              ? "Changing the organisation moves it to that firm's accounts. Choosing a new file replaces the old one."
              : "It appears under My learning on every account whose licence names this firm."
          }
          onClose={() => (busy ? null : setOpen(null))}
          foot={
            <>
              <button type="button" className="ds-btn btn-o ds-btn-sm" disabled={busy} onClick={() => setOpen(null)}>
                Cancel
              </button>
              <button type="button" className="ds-btn btn-p ds-btn-sm" disabled={busy} onClick={save}>
                {busy ? "Saving…" : open.row ? "Save" : file ? "Add and upload" : "Add it"}
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

          {open.values.how === "upload" ? (
            <div className="adm-fs" style={{ marginTop: 14 }}>
              <label className={`adm-f media wide${open.errors.videoUrl ? " bad" : ""}`} htmlFor="orgvideo-file">
                <span className="adm-f-l">The file{open.row?.pipeline?.master ? "" : " *"}</span>
                <span className="adm-file">
                  <input
                    id="orgvideo-file"
                    type="file"
                    accept="video/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setFile(f);
                      if (f) setOpen((o) => ({ ...o, errors: { ...o.errors, videoUrl: undefined } }));
                    }}
                  />
                  <span>
                    {file
                      ? `${file.name} · ${sizeOf(file.size)}`
                      : open.row?.fileName
                        ? `Keeping ${open.row.fileName} — choose a file to replace it`
                        : "Choose the recording"}
                  </span>
                </span>
                <span className="adm-f-h">
                  Goes straight from this browser into the archive and is encoded for adaptive streaming. Big
                  files are fine; keep this tab open until the upload finishes.
                </span>
                {open.errors.videoUrl ? <span className="adm-f-e">{open.errors.videoUrl}</span> : null}
              </label>
            </div>
          ) : null}
        </AdmDrawer>
      ) : null}

      {open?.mode === "watch" ? (
        <AdmDrawer
          title={open.row.title}
          intro={`For ${open.row.orgName}. ${open.row.isPublished ? "Live on their accounts." : "Hidden from their accounts at the moment."}`}
          onClose={() => setOpen(null)}
          foot={
            <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => setOpen(null)}>
              Close
            </button>
          }
        >
          <AdminPreview video={open.row} token={accessToken} />
          {open.row.description ? (
            <p className="adm-note" style={{ marginTop: 14 }}>
              {open.row.description}
            </p>
          ) : null}
        </AdmDrawer>
      ) : null}
    </>
  );
}
