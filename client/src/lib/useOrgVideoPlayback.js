// src/lib/useOrgVideoPlayback.js
//
// Turns an organisation video into something a <video> can play, the way the
// course player does it: an uploaded recording is only reachable through a
// playback session — the server sets the CloudFront cookies, claims a seat and
// hands back the manifest — with a heartbeat while it plays and a stop when
// it is left. A pasted link needs none of that and is played directly.
//
//   const pb = useOrgVideoPlayback(video, { token, admin });
//   pb.src        what to hand the player ("" while it is being arranged)
//   pb.kind       "stream" (HLS) | "master" (one file) | "link" | "embed" | ""
//   pb.sessionRef for the watermark
//   pb.blocked    the 409 body when the account is already streaming elsewhere
//   pb.error      anything else that stopped it
//
// `admin: true` is the preview on the admin screens: it signs the cookies
// through /admin/org-videos/:id/play and takes no seat, logs no watch.

import React from "react";
import { apiAuthed } from "../api.js";
import { playableFor } from "./orgVideoPlayer.js";

export function useOrgVideoPlayback(video, { token, admin = false } = {}) {
  const [state, setState] = React.useState({ src: "", kind: "", sessionRef: "", blocked: null, error: "" });
  const id = video?.id || "";
  const stream = video?.source === "s3" || video?.kind === "stream";

  React.useEffect(() => {
    if (!id || !token) {
      setState({ src: "", kind: "", sessionRef: "", blocked: null, error: "" });
      return undefined;
    }

    // Links and embeds: nothing to arrange.
    if (!stream) {
      const play = playableFor(video);
      setState({
        src: play?.src || "",
        kind: play ? (play.kind === "iframe" ? "embed" : "link") : "",
        sessionRef: "",
        blocked: null,
        error: "",
      });
      return undefined;
    }

    let cancelled = false;
    let current = null;
    let timer = null;
    setState({ src: "", kind: "", sessionRef: "", blocked: null, error: "" });

    const json = (path, body) =>
      apiAuthed(path, {
        token,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
      if (!current || admin) return;
      json("/me/org-videos/playback/stop", { sessionId: current }).catch(() => {});
      current = null;
    };

    (async () => {
      try {
        if (admin) {
          const r = await apiAuthed(`/admin/org-videos/${id}/play`, { token });
          if (cancelled) return;
          setState({ src: r?.playbackUrl || "", kind: r?.kind || "", sessionRef: "", blocked: null, error: r?.playbackUrl ? "" : "Nothing to play yet." });
          return;
        }
        const r = await json(`/me/org-videos/${id}/playback/start`);
        if (cancelled) {
          current = r.sessionId;
          stop();
          return;
        }
        current = r.sessionId;
        setState({ src: r.playbackUrl || "", kind: r.kind || "", sessionRef: r.sessionRef || "", blocked: null, error: r.playbackUrl ? "" : "This recording is not ready yet." });

        const startedAt = Date.now();
        let lastPingAt = startedAt;
        timer = setInterval(() => {
          const now = Date.now();
          const deltaSec = Math.round((now - lastPingAt) / 1000);
          lastPingAt = now;
          json("/me/org-videos/playback/ping", {
            sessionId: current,
            watchedDeltaSec: deltaSec,
            positionSec: Math.round((now - startedAt) / 1000),
          }).catch(() => {});
        }, (r.heartbeatSec || 30) * 1000);
      } catch (e) {
        if (cancelled) return;
        if (e?.status === 409) {
          setState({ src: "", kind: "", sessionRef: "", blocked: e.data || { error: "Too many active streams" }, error: "" });
        } else {
          setState({ src: "", kind: "", sessionRef: "", blocked: null, error: e?.message || "Could not start playback." });
        }
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
    // `video` itself is deliberately not a dependency: the row object is
    // replaced on every list refresh, and re-claiming a seat each time would
    // restart the picture under the viewer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, stream, token, admin]);

  return state;
}
