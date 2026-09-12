// The organisation's shelf — recordings ADLM made for this firm.
//
// Two shapes of the same data:
//
//   <DsOrgVideos />       the full thing, on My learning: a player and the
//                         list beside it. Renders nothing at all when the
//                         account belongs to no firm or the firm has no
//                         videos, so a personal account never sees an empty
//                         "your organisation" box.
//   <DsOrgVideosPanel />  the overview's short version: titles and a link.
//
// Everything comes from GET /me/org-videos, which works out which firm the
// account belongs to from the names on its licences. An uploaded recording
// plays through a playback session exactly like a lecture — signed CloudFront
// cookies, a seat, a heartbeat — and through the same hardened player, so the
// watermark carries the viewer's identity and the session ref.

import React from "react";
import { Link } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { SecureEmbed, SecureVideo } from "../components/SecureVideo.jsx";
import { clockOf } from "../lib/orgVideoPlayer.js";
import { useOrgVideoPlayback } from "../lib/useOrgVideoPlayback.js";

function useOrgVideos() {
  const { accessToken } = useAuth();
  const [d, setD] = React.useState(null);
  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    apiAuthed("/me/org-videos", { token: accessToken })
      .then((r) => alive && setD(r && Array.isArray(r.items) ? r : { items: [] }))
      .catch(() => alive && setD({ items: [] }));
    return () => {
      alive = false;
    };
  }, [accessToken]);
  return d;
}

const dateOf = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

/** The stage: whatever the playback hook arranged, or why it could not. */
export function OrgVideoStage({ video, playback }) {
  if (!video) return null;
  if (playback.blocked) {
    return (
      <div className="lx-stage msg">
        <div>
          <b>This account is already watching on another device</b>
          <p>
            Your plan allows {playback.blocked.limit || 2} streams at a time. Close the video on the
            other device and reload — the seat frees itself about a minute and a half after playback
            stops.
          </p>
        </div>
      </div>
    );
  }
  if (video.ready === false) {
    return (
      <div className="lx-stage msg">
        <div>
          <b>Still being prepared</b>
          <p>This recording is being uploaded. Check back in a few minutes.</p>
        </div>
      </div>
    );
  }
  if (playback.kind === "embed" && playback.src) {
    return (
      <SecureEmbed
        className="lx-stage live"
        src={playback.src}
        title={video.title}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
      />
    );
  }
  if (playback.src) {
    return (
      <SecureVideo
        className="lx-stage live"
        src={playback.src}
        sessionRef={playback.sessionRef}
        videoClassName="object-contain"
        preload="metadata"
      />
    );
  }
  return (
    <div className="lx-stage msg">
      <div>
        <b>{playback.error ? "Could not start playback" : "Arranging playback…"}</b>
        <p>{playback.error || "One moment."}</p>
      </div>
    </div>
  );
}

// Links never go through a playback session, so their watch is logged here.
function useLinkWatch(video, token) {
  const noted = React.useRef(new Set());
  React.useEffect(() => {
    if (!video || !token || video.kind === "stream" || noted.current.has(video.id)) return;
    noted.current.add(video.id);
    apiAuthed(`/me/org-videos/${video.id}/watched`, {
      token,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => {});
  }, [video, token]);
}

export default function DsOrgVideos() {
  const { accessToken } = useAuth();
  const d = useOrgVideos();
  const [current, setCurrent] = React.useState("");

  const items = d?.items || [];
  const active = items.find((v) => v.id === current) || items[0] || null;
  const playback = useOrgVideoPlayback(active, { token: accessToken });
  useLinkWatch(active, accessToken);

  if (!items.length) return null;

  const org = d.organisation || active?.orgName || "your organisation";

  return (
    <section className="wk-panel" id="org-videos">
      <div className="wk-ph">
        <h2>From ADLM, for {org}</h2>
        <span className="wk-locnote">
          {items.length === 1 ? "One recording" : `${items.length} recordings`} made for your team
        </span>
      </div>

      <div className="lx-player" style={{ padding: "0 22px 22px" }}>
        <div>
          <OrgVideoStage video={active} playback={playback} />

          {active ? (
            <div className="lx-head" style={{ marginTop: 14 }}>
              <h1 style={{ maxWidth: "none" }}>{active.title}</h1>
              <p className="ds-sub">
                {[
                  active.durationSec ? clockOf(active.durationSec) : "",
                  dateOf(active.createdAt),
                  playback.kind === "stream" ? "adaptive stream" : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {active.description ? <p className="lx-desc">{active.description}</p> : null}
            </div>
          ) : null}
        </div>

        {items.length > 1 ? (
          <aside className="lx-side">
            <p className="wk-locnote" style={{ margin: "0 0 10px" }}>
              Also for {org}
            </p>
            {/* A plain stacked list. His .lx-li is the lesson row inside a
                course and lays its children out in a line, which put two
                titles side by side here. */}
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
              {items.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    className={`ds-btn ds-btn-sm ${v.id === active?.id ? "btn-p" : "btn-o"}`}
                    style={{ width: "100%", justifyContent: "flex-start", textAlign: "left" }}
                    onClick={() => setCurrent(v.id)}
                    aria-current={v.id === active?.id ? "true" : undefined}
                  >
                    {v.title}
                    {v.durationSec ? <span style={{ opacity: 0.7, marginLeft: 8 }}>{clockOf(v.durationSec)}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </div>
    </section>
  );
}

/** The overview's short version: what there is, and where to watch it. */
export function DsOrgVideosPanel() {
  const d = useOrgVideos();
  const items = d?.items || [];
  if (!items.length) return null;
  const org = d.organisation || items[0].orgName;

  return (
    <section className="dsh-panel">
      <div className="dsh-ph">
        <h2>From ADLM, for {org}</h2>
        <Link className="more" to="/dash-learning#org-videos">
          Watch
        </Link>
      </div>
      <div className="dsh-body">
        <ul className="dsh-feed">
          {items.slice(0, 4).map((v) => (
            <li key={v.id}>
              <span className="tick g" />
              <div>
                <b>{v.title}</b>
                {v.description ? ` ${v.description.length > 90 ? `${v.description.slice(0, 90)}…` : v.description}` : ""}
              </div>
              <span className="ago">{v.durationSec ? clockOf(v.durationSec) : dateOf(v.createdAt)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
