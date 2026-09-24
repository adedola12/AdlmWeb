// src/features/admin/OrgVideosQuickAdd.jsx
//
// The organisation-video shelf on the OLD Admin Hub (pages/Admin.jsx), in
// that page's own Tailwind grammar — card, input, btn — so it sits inside the
// Organizations tab like everything else there. The full register with
// filters, watch-logs and editing is /admin/org-videos (the DS screen); this
// is the two-minute version: pick the firm, drop the file, done.
//
// Same API, same upload hook, so a file started here shows the same encode
// progress the DS screen would show — it is the same row. The file goes from
// this browser straight into the course archive bucket; MediaConvert builds
// the adaptive stream; CloudFront serves it to the firm.

import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../store.jsx";
import { apiAuthed } from "../../http.js";
import { SecureVideo } from "../../components/SecureVideo.jsx";
import { useOrgVideoUpload, orgVideoState, enhanceBlocker } from "../../lib/useOrgVideoUpload.js";
import { useOrgVideoPlayback } from "../../lib/useOrgVideoPlayback.js";
import { sizeOf, clockOf } from "../../lib/orgVideoPlayer.js";

const NEW_ORG = "__new__";

const TONE_CLS = {
  ok: "bg-green-50 text-green-700",
  due: "bg-yellow-50 text-yellow-800",
  bad: "bg-red-50 text-red-700",
  calm: "bg-slate-100 text-slate-600",
  "": "bg-slate-100 text-slate-600",
};

const when = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

/** The preview under the table. */
function Preview({ video, token, onClose }) {
  const pb = useOrgVideoPlayback(video, { token, admin: true });
  return (
    <div className="mt-3 rounded-xl border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <b className="text-sm">{video.title}</b>
        <button className="btn btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
      {pb.kind === "embed" && pb.src ? (
        <div className="relative w-full" style={{ aspectRatio: "16 / 9", background: "#000", borderRadius: 10, overflow: "hidden" }}>
          <iframe
            src={pb.src}
            title={video.title}
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
          />
        </div>
      ) : pb.src ? (
        <>
          <div className="rounded-xl overflow-hidden bg-black" style={{ aspectRatio: "16 / 9" }}>
            <SecureVideo className="w-full h-full" src={pb.src} videoClassName="object-contain" preload="metadata" />
          </div>
          <div className="text-[11px] text-slate-500 mt-2">
            {pb.kind === "stream"
              ? "Playing the adaptive stream from CloudFront — what the firm gets."
              : pb.kind === "master"
                ? "Playing the uploaded master as one file. The adaptive stream replaces this once the encode completes."
                : "Playing the pasted link."}
          </div>
        </>
      ) : (
        <div className="text-sm text-slate-600">{pb.error || "Arranging playback…"}</div>
      )}
    </div>
  );
}

export default function OrgVideosQuickAdd({ defaultOrg = "", fullRegister = true }) {
  const { accessToken } = useAuth();
  const [d, setD] = React.useState(null);
  const [orgs, setOrgs] = React.useState([]);
  const [msg, setMsg] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [reload, setReload] = React.useState(0);
  const [preview, setPreview] = React.useState(null);
  const [form, setForm] = React.useState({
    title: "",
    orgPick: defaultOrg || "",
    orgName: "",
    description: "",
    how: "upload",
    videoUrl: "",
  });
  const [file, setFile] = React.useState(null);
  const fileRef = React.useRef(null);

  const putRow = React.useCallback(
    (item) =>
      setD((cur) => (cur ? { ...cur, items: cur.items.map((r) => (r.id === item.id ? item : r)) } : cur)),
    [],
  );
  const up = useOrgVideoUpload({ token: accessToken, storage: d?.storage, onRow: putRow, say: setMsg });

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    apiAuthed("/admin/org-videos", { token: accessToken })
      .then((r) => alive && setD(r))
      .catch((e) => alive && setMsg(e?.message || "Could not load organisation videos."));
    apiAuthed("/admin/org-videos/organisations", { token: accessToken })
      .then((r) => alive && setOrgs(Array.isArray(r?.items) ? r.items : []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [accessToken, reload]);

  // Anything still encoding when the tab opens gets watched, so the chip
  // moves without a refresh.
  React.useEffect(() => {
    for (const v of d?.items || []) {
      const p = v.pipeline;
      if (p && p.master && !p.stream && p.status && !["COMPLETE", "ERROR", "CANCELED"].includes(p.status) && !up.uploads[v.id]) {
        up.watchEncode(v.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.items?.length]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function add() {
    const orgName = form.orgPick === NEW_ORG ? form.orgName.trim() : form.orgPick;
    if (!form.title.trim()) return setMsg("Give the video a title.");
    if (!orgName) return setMsg("Pick the organisation it was made for.");
    if (form.how === "link" && !form.videoUrl.trim()) return setMsg("Paste the link, or upload a file.");
    if (form.how === "upload" && !file) return setMsg("Choose the recording to upload.");

    setBusy(true);
    setMsg("");
    try {
      const body = { title: form.title.trim(), orgName, description: form.description.trim() };
      if (form.how === "link") body.videoUrl = form.videoUrl.trim();
      const r = await apiAuthed("/admin/org-videos", {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const item = r?.item;
      setD((cur) => (cur ? { ...cur, items: [item, ...cur.items] } : cur));
      setForm((f) => ({ ...f, title: "", description: "", videoUrl: "" }));
      if (form.how === "upload" && file && item?.id) {
        const f = file;
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
        setMsg(`Added for ${orgName}. Uploading “${f.name}”…`);
        up.sendFile(item.id, f);
      } else {
        setMsg(`Added for ${orgName}. It is live on their accounts.`);
      }
    } catch (e) {
      setMsg(e?.message || "The server refused that. Nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(v) {
    try {
      const r = await apiAuthed(`/admin/org-videos/${v.id}`, {
        token: accessToken,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished: !v.isPublished }),
      });
      if (r?.item) putRow(r.item);
    } catch (e) {
      setMsg(e?.message || "Could not change that.");
    }
  }

  async function remove(v) {
    if (!window.confirm(`Delete “${v.title}” for ${v.orgName}? The file goes too.`)) return;
    try {
      await apiAuthed(`/admin/org-videos/${v.id}`, { token: accessToken, method: "DELETE" });
      up.clearUp(v.id);
      if (preview?.id === v.id) setPreview(null);
      setReload((n) => n + 1);
      setMsg(`“${v.title}” removed.`);
    } catch (e) {
      setMsg(e?.message || "Could not remove that.");
    }
  }

  const items = d?.items || [];
  const storage = d?.storage;

  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div>
          <h2 className="font-semibold">Organisation videos</h2>
          <div className="text-xs text-slate-500">
            A demo or recap recorded for one firm. It appears on the Dashboard of every account
            whose licence names that firm — nobody else sees it.
          </div>
        </div>
        {fullRegister ? (
          <Link className="btn btn-sm" to="/admin/org-videos">
            Full register
          </Link>
        ) : null}
      </div>

      {msg ? (
        <div className="text-xs rounded-lg px-3 py-2 mb-3 bg-blue-50 text-adlm-blue-700">{msg}</div>
      ) : null}

      {/* Quick add */}
      <div className="grid gap-2 md:grid-cols-2">
        <input
          className="input"
          placeholder="Title — e.g. QUIV demo walkthrough, 9 Sep"
          value={form.title}
          onChange={set("title")}
        />
        <select className="input" value={form.orgPick} onChange={set("orgPick")}>
          <option value="">Which organisation…</option>
          {orgs.map((o) => (
            <option key={o.key} value={o.name}>
              {o.name}
              {o.people ? ` · ${o.people} account${o.people === 1 ? "" : "s"}` : ""}
            </option>
          ))}
          <option value={NEW_ORG}>Another organisation (type the name)…</option>
        </select>
        {form.orgPick === NEW_ORG ? (
          <input
            className="input md:col-span-2"
            placeholder="Organisation name — spelt as it will be on their licences"
            value={form.orgName}
            onChange={set("orgName")}
          />
        ) : null}
        <input
          className="input md:col-span-2"
          placeholder="A note to go with it (optional)"
          value={form.description}
          onChange={set("description")}
        />
        <select className="input" value={form.how} onChange={set("how")}>
          <option value="upload">Upload a file — encoded for adaptive streaming</option>
          <option value="link">Paste a link (Drive, YouTube, an MP4)</option>
        </select>
        {form.how === "link" ? (
          <input
            className="input"
            placeholder="https://drive.google.com/file/d/… or https://youtu.be/…"
            value={form.videoUrl}
            onChange={set("videoUrl")}
          />
        ) : (
          <label className="input flex items-center gap-2 cursor-pointer overflow-hidden">
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <span className="text-xs truncate">
              {file ? `${file.name} · ${sizeOf(file.size)}` : "Choose the recording…"}
            </span>
          </label>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] text-slate-500">
          {storage?.pipeline
            ? "Files go straight from this browser into the archive and are encoded for adaptive streaming. Keep the tab open until the upload finishes."
            : "The video pipeline is not configured on this server — paste a link."}
        </div>
        <button className="btn btn-sm" disabled={busy} onClick={add}>
          {busy ? "Saving…" : form.how === "upload" ? "Add and upload" : "Add video"}
        </button>
      </div>

      {/* What exists */}
      {!d ? (
        <div className="text-sm text-slate-600 mt-3">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-slate-600 mt-3">No organisation videos yet.</div>
      ) : (
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-600">
              <tr className="border-b">
                <th className="py-2 pr-3">Video</th>
                <th className="py-2 pr-3">For</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Quality</th>
                <th className="py-2 pr-3">Watched</th>
                <th className="py-2 pr-3">Live</th>
                <th className="py-2 pr-0 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((v) => {
                const s = orgVideoState(v, up.uploads[v.id]);
                const blocker = enhanceBlocker(v, storage);
                const p = v.pipeline;
                const canWatch = p ? p.master : !!v.videoUrl;
                return (
                  <tr key={v.id} className="border-b align-middle">
                    <td className="py-2 pr-3">
                      <div className="font-medium text-slate-900 dark:text-white">{v.title}</div>
                      <div className="text-[11px] text-slate-500">
                        {[v.durationSec ? clockOf(v.durationSec) : "", when(v.createdAt), v.fileName].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="py-2 pr-3">{v.orgName}</td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${TONE_CLS[s.tone] || TONE_CLS[""]}`}>
                        {s.word}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-600">
                      {p
                        ? p.stream
                          ? "adaptive stream"
                          : p.master
                            ? "as recorded"
                            : "—"
                        : v.source === "link"
                          ? "external"
                          : v.source === "none"
                            ? "—"
                            : "older storage"}
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-600">
                      {v.watchers ? `${v.watchers} · last ${when(v.lastWatchedAt)}` : "not yet"}
                    </td>
                    <td className="py-2 pr-3">
                      <input type="checkbox" checked={!!v.isPublished} onChange={() => toggle(v)} title={v.isPublished ? "Live on their accounts" : "Hidden"} />
                    </td>
                    <td className="py-2 pr-0">
                      <div className="flex gap-1.5 justify-end flex-wrap">
                        {canWatch ? (
                          <button className="btn btn-sm" onClick={() => setPreview(v)}>
                            Watch
                          </button>
                        ) : null}
                        <button
                          className="btn btn-sm"
                          disabled={!!blocker || !!up.uploads[v.id]}
                          title={blocker || "Build every rendition the recording allows"}
                          onClick={() => up.enhance(v)}
                        >
                          Improve quality
                        </button>
                        <button className="btn btn-sm" onClick={() => remove(v)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="text-[11px] text-slate-500 mt-2">
            “Improve quality” builds the adaptive stream from the uploaded recording — every rendition it supports, up
            to its own resolution. It cannot add detail the recording never had — record at 1080p or better.
          </div>
        </div>
      )}

      {preview ? <Preview video={preview} token={accessToken} onClose={() => setPreview(null)} /> : null}
    </div>
  );
}
