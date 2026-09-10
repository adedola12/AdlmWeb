// src/features/account/OrgVideosSection.jsx
//
// Recordings ADLM made for this account's firm, on the Dashboard. Renders
// nothing at all for a personal account or a firm with no videos, so nobody
// sees an empty "your organisation" box.
//
// GET /me/org-videos works out which firm the account belongs to from the
// organisation names on its licences. An uploaded recording plays through a
// playback session exactly like a lecture — signed CloudFront cookies, a
// seat, a heartbeat — and through the same hardened player, so the watermark
// carries the viewer's identity and the session ref. A demo recorded for one
// firm is not for forwarding.

import React from "react";
import { useAuth } from "../../store.jsx";
import { apiAuthed } from "../../http.js";
import { SecureEmbed, SecureVideo } from "../../components/SecureVideo.jsx";
import { IconPlayCircle } from "../../components/icons.jsx";
import { clockOf } from "../../lib/orgVideoPlayer.js";
import { useOrgVideoPlayback } from "../../lib/useOrgVideoPlayback.js";

const dateOf = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

function Notice({ title, children }) {
  return (
    <div className="w-full h-full flex items-center justify-center text-center text-white/80 text-sm p-6">
      <div>
        <b className="block text-white">{title}</b>
        {children}
      </div>
    </div>
  );
}

export default function OrgVideosSection() {
  const { accessToken } = useAuth();
  const [d, setD] = React.useState(null);
  const [current, setCurrent] = React.useState("");
  const noted = React.useRef(new Set());

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

  const items = d?.items || [];
  const active = items.find((v) => v.id === current) || items[0] || null;
  const playback = useOrgVideoPlayback(active, { token: accessToken });

  // Links never go through a playback session, so their watch is logged here.
  React.useEffect(() => {
    if (!active || !accessToken || active.kind === "stream" || noted.current.has(active.id)) return;
    noted.current.add(active.id);
    apiAuthed(`/me/org-videos/${active.id}/watched`, {
      token: accessToken,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => {});
  }, [active, accessToken]);

  if (!items.length) return null;

  const org = d.organisation || active?.orgName || "your organisation";

  let stage;
  if (playback.blocked) {
    stage = (
      <Notice title="This account is already watching on another device">
        Your plan allows {playback.blocked.limit || 2} streams at a time. Close the video on the other
        device and reload — the seat frees itself about a minute and a half after playback stops.
      </Notice>
    );
  } else if (active?.ready === false) {
    stage = <Notice title="Still being prepared">This recording is being uploaded. Check back in a few minutes.</Notice>;
  } else if (playback.kind === "embed" && playback.src) {
    stage = (
      <SecureEmbed
        className="w-full h-full"
        src={playback.src}
        title={active.title}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
      />
    );
  } else if (playback.src) {
    stage = (
      <SecureVideo
        className="w-full h-full"
        src={playback.src}
        sessionRef={playback.sessionRef}
        videoClassName="object-contain"
        preload="metadata"
      />
    );
  } else {
    stage = (
      <Notice title={playback.error ? "Could not start playback" : "Arranging playback…"}>
        {playback.error || "One moment."}
      </Notice>
    );
  }

  return (
    <section className="bg-white rounded-2xl shadow-depth p-4 md:p-5" id="org-videos">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-base md:text-lg font-bold text-slate-900 flex items-center gap-2">
            <IconPlayCircle className="w-5 h-5 text-adlm-blue-700" />
            From ADLM, for {org}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {items.length === 1 ? "One recording" : `${items.length} recordings`} made for your team. Only accounts
            on your licence can see this.
          </p>
        </div>
      </div>

      <div className={`grid gap-4 ${items.length > 1 ? "lg:grid-cols-[1fr_300px]" : ""}`}>
        <div>
          <div className="rounded-xl overflow-hidden bg-black" style={{ aspectRatio: "16 / 9" }}>
            {stage}
          </div>
          {active ? (
            <div className="mt-3">
              <h3 className="font-semibold text-slate-900">{active.title}</h3>
              <p className="text-xs text-slate-500">
                {[
                  active.durationSec ? clockOf(active.durationSec) : "",
                  dateOf(active.createdAt),
                  playback.kind === "stream" ? "adaptive stream" : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {active.description ? <p className="text-sm text-slate-700 mt-1.5">{active.description}</p> : null}
            </div>
          ) : null}
        </div>

        {items.length > 1 ? (
          <aside>
            <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Also for {org}</p>
            <ul className="space-y-2">
              {items.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setCurrent(v.id)}
                    aria-current={v.id === active?.id ? "true" : undefined}
                    className={`w-full text-left rounded-lg px-3 py-2 text-sm ring-1 transition ${
                      v.id === active?.id
                        ? "bg-adlm-navy text-white ring-adlm-navy"
                        : "bg-slate-50 text-slate-800 ring-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <span className="block font-medium truncate">{v.title}</span>
                    <span className={`block text-[11px] ${v.id === active?.id ? "text-white/70" : "text-slate-500"}`}>
                      {[v.durationSec ? clockOf(v.durationSec) : "", dateOf(v.createdAt)].filter(Boolean).join(" · ")}
                    </span>
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
