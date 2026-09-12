// src/lib/useOrgVideoUpload.js
//
// The upload-and-encode flow for an organisation video, as a hook, so the
// full admin screen and the quick-add panel on the old Admin Hub run the same
// code: get a presigned PUT from the server, stream the master from this
// browser into the archive bucket, tell the server it is in, then poll while
// MediaConvert builds the adaptive ladder.
//
//   const up = useOrgVideoUpload({ token, storage, onRow, say });
//   up.sendFile(rowId, file)        — the whole flow, fire and forget
//   up.watchEncode(rowId)           — resume polling a row that is encoding
//   up.enhance(row)                 — build (or rebuild) the ladder
//   up.uploads[rowId]               — { phase, pct, label } or undefined
//                                     phase: uploading | processing | failed
//
// `storage` is the { pipeline, cloudfront } the list endpoint reports.

import React from "react";
import { apiAuthed } from "../api.js";
import { uploadToPresignedUrl } from "./s3Upload.js";

const DONE = new Set(["COMPLETE", "ERROR", "CANCELED"]);

export function useOrgVideoUpload({ token, storage, onRow, say }) {
  const [uploads, setUploads] = React.useState({});
  const pollers = React.useRef(new Map());
  const live = React.useRef({ storage, onRow, say });
  live.current = { storage, onRow, say };

  React.useEffect(() => {
    const map = pollers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
      map.clear();
    };
  }, []);

  // Leaving mid-upload loses the file. Ask.
  const uploading = Object.values(uploads).some((u) => u.phase === "uploading");
  React.useEffect(() => {
    if (!uploading) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  const setUp = React.useCallback(
    (id, patch) => setUploads((u) => ({ ...u, [id]: { ...(u[id] || {}), ...patch } })),
    [],
  );
  const clearUp = React.useCallback(
    (id) =>
      setUploads((u) => {
        const n = { ...u };
        delete n[id];
        return n;
      }),
    [],
  );

  const post = React.useCallback(
    (path, body) =>
      apiAuthed(path, {
        token,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      }),
    [token],
  );

  /** Poll MediaConvert until the ladder exists, then let the row be. */
  const watchEncode = React.useCallback(
    function watch(id, attempt = 0) {
      if (pollers.current.has(id)) return;
      const t = setTimeout(async () => {
        pollers.current.delete(id);
        try {
          const r = await apiAuthed(`/admin/org-videos/${id}/status`, { token });
          const item = r?.item;
          if (item) live.current.onRow?.(item);
          const p = item?.pipeline;
          if (p?.stream) {
            clearUp(id);
            live.current.say?.(`“${item.title}” is encoded — the adaptive stream is live.`);
            return;
          }
          if (p && DONE.has(p.status)) {
            setUp(id, { phase: "failed", label: p.error || "The encode did not complete." });
            return;
          }
          setUp(id, {
            phase: "processing",
            label: p?.percent ? `Encoding ${p.percent}%` : "Encoding queued…",
          });
        } catch {
          /* a missed poll is not a failure */
        }
        // Up to ~2 hours; MediaConvert on a long recording takes a while.
        if (attempt < 720) watch(id, attempt + 1);
        else clearUp(id);
      }, attempt < 4 ? 4000 : 10000);
      pollers.current.set(id, t);
    },
    [token, setUp, clearUp],
  );

  /** The master, up, then the encode. */
  const sendFile = React.useCallback(
    async (id, f) => {
      const meta = { fileName: f.name, fileSize: f.size, contentType: f.type || "video/mp4" };
      setUp(id, { phase: "uploading", pct: 0 });
      const onProgress = (sent, total) =>
        setUp(id, { phase: "uploading", pct: total ? Math.floor((sent / total) * 100) : 0 });
      try {
        if (!live.current.storage?.pipeline) {
          throw new Error("The video pipeline is not configured on the server, so a file cannot be uploaded. Paste a link instead.");
        }
        const signed = await post(`/admin/org-videos/${id}/upload/s3`, meta);
        await uploadToPresignedUrl({
          file: f,
          uploadUrl: signed.uploadUrl,
          contentType: signed.contentType,
          onProgress,
        });
        const done = await post(`/admin/org-videos/${id}/upload/done`, { key: signed.key, ...meta });
        if (done?.item) live.current.onRow?.(done.item);
        const p = done?.item?.pipeline;
        if (p?.status === "ERROR") {
          setUp(id, { phase: "failed", label: p.error || "The encode could not be started." });
          live.current.say?.("Uploaded, but the encode could not be started. The recording plays as one file; try “Improve quality” to encode it.");
          return;
        }
        setUp(id, { phase: "processing", label: "Encoding queued…" });
        live.current.say?.("Uploaded. It plays now as one file; the adaptive stream follows once the encode completes.");
        watchEncode(id);
      } catch (e) {
        setUp(id, { phase: "failed", label: e?.message || "Upload failed" });
        live.current.say?.(e?.message || "The upload failed. The row is still here — try again from Edit.");
      }
    },
    [post, setUp, watchEncode],
  );

  /** "Improve quality": build (or rebuild) the ladder from the master. */
  const enhance = React.useCallback(
    async (row) => {
      try {
        const r = await post(`/admin/org-videos/${row.id}/enhance`);
        if (r?.item) live.current.onRow?.(r.item);
        setUp(row.id, { phase: "processing", label: "Encoding queued…" });
        watchEncode(row.id);
        live.current.say?.(`“${row.title}” is being encoded at every rendition the recording supports.`);
        return true;
      } catch (e) {
        if (e?.data?.item) live.current.onRow?.(e.data.item);
        live.current.say?.(e?.message || "Could not start the encode.");
        return false;
      }
    },
    [post, setUp, watchEncode],
  );

  return { uploads, sendFile, watchEncode, enhance, clearUp };
}

/** One word and a tone for where a row is up to, upload state included. */
export function orgVideoState(v, up) {
  if (up) {
    if (up.phase === "failed") return { word: up.label || "Upload failed", tone: "bad" };
    if (up.phase === "uploading") return { word: `Uploading ${up.pct}%`, tone: "due" };
    if (up.phase === "processing") return { word: up.label || "Encoding…", tone: "due" };
  }
  if (v.source === "s3") {
    const p = v.pipeline || {};
    if (p.stream) return { word: "Streaming", tone: "ok" };
    if (p.status === "ERROR" || p.status === "CANCELED") return { word: "Plays · encode failed", tone: "bad" };
    if (p.master) return { word: p.percent ? `Encoding ${p.percent}%` : "Plays · encoding", tone: "due" };
    return { word: "Waiting for upload", tone: "due" };
  }
  if (v.source === "none" || !v.videoUrl) return { word: "No video yet", tone: "calm" };
  if (v.source === "bunny") return { word: "Bunny (older)", tone: "ok" };
  if (v.source === "r2") return { word: "Plain MP4 (older)", tone: "ok" };
  return { word: "Link", tone: "ok" };
}

/** Can "Improve quality" do anything for this row? Returns the reason if not. */
export function enhanceBlocker(v, storage) {
  if (!storage?.pipeline) return "The video pipeline is not configured on this server.";
  if (v.source !== "s3" || !v.pipeline?.master) {
    return v.source === "none" || !v.videoUrl
      ? "Upload a recording first."
      : "Only an uploaded recording can be encoded. Upload the file itself for a Drive or YouTube link.";
  }
  const st = v.pipeline.status;
  if (st && !DONE.has(st)) return "Still encoding.";
  return "";
}
