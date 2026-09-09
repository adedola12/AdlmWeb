// src/lib/useOrgVideoUpload.js
//
// The upload-and-encode flow for an organisation video, as a hook, so the
// full admin screen and the quick-add panel on the old Admin Hub run the same
// code: open the upload on the server, stream the bytes from this browser,
// tell the server they are in, then poll while Bunny encodes.
//
//   const up = useOrgVideoUpload({ token, storage, onRow, say });
//   up.sendFile(rowId, file)        — the whole flow, fire and forget
//   up.watchEncode(rowId)           — resume polling a row that is encoding
//   up.uploads[rowId]               — { phase, pct, label } or undefined
//                                     phase: uploading | processing | failed
//
// `storage` is the { bunny, r2 } the list endpoint reports. Bunny is tried
// first; if Bunny refuses to OPEN the upload (a rejected key) the file goes
// to R2 as a plain MP4 instead. A failure mid-upload is not retried on the
// other store — half a file in two places helps nobody.

import React from "react";
import { apiAuthed } from "../api.js";
import { uploadToBunnyTus, uploadToPresignedUrl } from "./bunnyTus.js";

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

  /** Poll Bunny's encode until the row is playable, then let the row be. */
  const watchEncode = React.useCallback(
    function watch(id, attempt = 0) {
      const t = setTimeout(async () => {
        pollers.current.delete(id);
        try {
          const r = await apiAuthed(`/admin/org-videos/${id}/status`, { token });
          const item = r?.item;
          if (item) live.current.onRow?.(item);
          const b = item?.bunny;
          if (b?.ready) {
            clearUp(id);
            live.current.say?.(`“${item.title}” is encoded and ready to watch.`);
            return;
          }
          if (b?.error) {
            setUp(id, { phase: "failed", label: b.error });
            return;
          }
          setUp(id, {
            phase: "processing",
            label: b?.status === 0 ? "Waiting for Bunny…" : `Encoding ${b?.encodeProgress || 0}%`,
          });
        } catch {
          /* a missed poll is not a failure */
        }
        // Up to ~40 minutes; a long recording takes a while.
        if (attempt < 480) watch(id, attempt + 1);
        else clearUp(id);
      }, attempt < 6 ? 3000 : 5000);
      pollers.current.set(id, t);
    },
    [token, setUp, clearUp],
  );

  /** The file, up, by whichever door the server has open. */
  const sendFile = React.useCallback(
    async (id, f) => {
      const meta = { fileName: f.name, fileSize: f.size, contentType: f.type || "video/mp4" };
      const { storage: st } = live.current;
      setUp(id, { phase: "uploading", pct: 0 });
      const onProgress = (sent, total) =>
        setUp(id, { phase: "uploading", pct: total ? Math.floor((sent / total) * 100) : 0 });

      let useBunny = !!st?.bunny;
      let start = null;
      if (useBunny) {
        try {
          start = await post(`/admin/org-videos/${id}/upload/bunny`, meta);
        } catch (e) {
          if (!st?.r2) {
            setUp(id, { phase: "failed", label: e?.message || "Bunny refused the upload" });
            live.current.say?.(e?.message || "Bunny refused the upload.");
            return;
          }
          useBunny = false;
          live.current.say?.(
            `Bunny refused to open the upload (${(e?.message || "").replace(/^Bunny Stream: /, "").slice(0, 90)}). Storing it as a plain MP4 on R2 instead.`,
          );
        }
      }

      try {
        if (useBunny) {
          if (start?.item) live.current.onRow?.(start.item);
          await uploadToBunnyTus({ file: f, tus: start.tus, onProgress });
          const done = await post(`/admin/org-videos/${id}/upload/done`, { provider: "bunny" });
          if (done?.item) live.current.onRow?.(done.item);
          setUp(id, { phase: "processing", label: "Encoding…" });
          watchEncode(id);
        } else if (st?.r2) {
          const signed = await post(`/admin/org-videos/${id}/upload/r2`, meta);
          await uploadToPresignedUrl({
            file: f,
            uploadUrl: signed.uploadUrl,
            contentType: signed.contentType,
            onProgress,
          });
          const done = await post(`/admin/org-videos/${id}/upload/done`, {
            provider: "r2",
            key: signed.key,
            publicUrl: signed.publicUrl,
            ...meta,
          });
          if (done?.item) live.current.onRow?.(done.item);
          clearUp(id);
          live.current.say?.("Uploaded. It plays as a plain MP4 — use “Improve quality” to have Bunny encode it for streaming.");
        } else {
          throw new Error("No video storage is configured on the server, so a file cannot be uploaded. Paste a link instead.");
        }
      } catch (e) {
        setUp(id, { phase: "failed", label: e?.message || "Upload failed" });
        live.current.say?.(e?.message || "The upload failed. The row is still here — try again from Edit.");
      }
    },
    [post, setUp, clearUp, watchEncode],
  );

  /** "Improve quality": re-encode on Bunny, or have Bunny fetch a plain file. */
  const enhance = React.useCallback(
    async (row) => {
      try {
        const r = await post(`/admin/org-videos/${row.id}/enhance`);
        if (r?.item) live.current.onRow?.(r.item);
        setUp(row.id, { phase: "processing", label: r?.action === "fetch" ? "Bunny is fetching the file…" : "Re-encoding…" });
        watchEncode(row.id);
        live.current.say?.(
          r?.action === "fetch"
            ? `Bunny is pulling “${row.title}” in and encoding it for streaming.`
            : `“${row.title}” is being encoded again at the library's best settings.`,
        );
        return true;
      } catch (e) {
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
  if (v.source === "none" || !v.videoUrl) return { word: "No video yet", tone: "calm" };
  if (v.source === "bunny") {
    const b = v.bunny || {};
    if (b.error || b.status === 5 || b.status === 6) return { word: "Failed", tone: "bad" };
    if (b.ready) return { word: "Ready", tone: "ok" };
    if (b.status === 0) return { word: "Waiting for upload", tone: "due" };
    return { word: `Encoding ${b.encodeProgress || 0}%`, tone: "due" };
  }
  if (v.source === "r2") return { word: "Ready · plain MP4", tone: "ok" };
  return { word: "Link", tone: "ok" };
}

/** Can "Improve quality" do anything for this row? Returns the reason if not. */
export function enhanceBlocker(v, storage) {
  if (!storage?.bunny) return "Bunny Stream is not configured on this server.";
  if (v.source === "bunny") {
    const b = v.bunny || {};
    if (b.status != null && b.status < 4 && b.status !== 0) return "Still encoding.";
    return "";
  }
  const url = String(v.videoUrl || "");
  if (/^https?:\/\/[^?#]+\.(mp4|mov|m4v|webm|mkv|avi)(\?|#|$)/i.test(url)) return "";
  if (!url) return "No video yet.";
  return "Only a direct video file can be encoded. Upload the file itself for a Drive or YouTube link.";
}
