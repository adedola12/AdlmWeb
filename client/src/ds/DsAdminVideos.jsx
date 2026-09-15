// Videos — what has been announced, to how many, and what failed.
//
// Most of this screen is a record rather than a control, and that is the point.
// The poller does the work every fifteen minutes without anybody here, so the
// question the screen answers is "did it go, and did it reach people" — not
// "how do I send one". The two buttons exist for the two moments the poller is
// the wrong tool: a launch that has to go out now, and a run where the
// provider dropped forty addresses.
//
// WHY THE SKIPPED COUNTS ARE ON SCREEN
//
// A video that reached 760 of 820 accounts is a fact about consent, not a
// fault. Showing only "760 sent" leaves somebody hunting for a bug that is not
// there, so the opted-out and unconfirmed figures sit beside it with their
// reasons.
//
// WHY DRY RUN IS A BANNER AND NOT A FOOTNOTE
//
// A DRY_RUN nobody knows about looks exactly like a send that silently reached
// nobody. Same for a poller with no API key: a channel that has published
// nothing and a poller that cannot reach YouTube produce an identical empty
// screen. Both say so at the top rather than waiting to be discovered.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmChip, AdmFilters } from "./adminUi.jsx";
import { useAdmToast } from "./adminKit.jsx";

const when = (d) =>
  d
    ? new Date(d).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const num = (n) => new Intl.NumberFormat("en-NG").format(Number(n) || 0);

export default function DsAdminVideos() {
  const { accessToken } = useAuth();
  const [say, toast] = useAdmToast();

  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [view, setView] = React.useState("all");
  const [reload, setReload] = React.useState(0);
  const [busy, setBusy] = React.useState("");
  const [paste, setPaste] = React.useState("");

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    setD(null);
    apiAuthed("/admin/videos", { token: accessToken })
      .then((r) => alive && setD(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken, reload]);

  const items = React.useMemo(() => {
    const all = d?.items || [];
    if (view === "notified") return all.filter((v) => v.notifiedAt);
    if (view === "pending") return all.filter((v) => !v.notifiedAt);
    if (view === "failures") return all.filter((v) => v.failedCount > 0);
    return all;
  }, [d, view]);

  const counts = d?.counts || {};
  const config = d?.config || {};

  /* ── announce one now ────────────────────────────────────────────────── */

  const announce = React.useCallback(async () => {
    const video = paste.trim();
    if (!video) return say("Paste the video's URL first.");

    setBusy("notify");
    try {
      const r = await apiAuthed("/admin/videos/notify", {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video }),
      });
      setPaste("");
      say(
        r.dryRun
          ? `DRY RUN: "${r.title}" would be announced. Nothing was sent.`
          : `Announcing "${r.title}". It sends in the background — refresh in a minute for the counts.`,
      );
      // The send runs after the response, so the figures are not there yet.
      // Re-reading now picks up the claim; the counts arrive on the next look.
      setTimeout(() => setReload((n) => n + 1), 1200);
    } catch (err) {
      say(err.message || "That could not be announced.");
    } finally {
      setBusy("");
    }
  }, [accessToken, paste, say]);

  const resend = React.useCallback(
    async (row) => {
      setBusy(row.videoId);
      try {
        const r = await apiAuthed(`/admin/videos/${row.videoId}/resend-failed`, {
          token: accessToken,
          method: "POST",
        });
        say(
          r.dryRun
            ? `DRY RUN: would retry ${num(r.retrying)} address(es).`
            : `Retrying ${num(r.retrying)} address(es) that failed last time.`,
        );
        setTimeout(() => setReload((n) => n + 1), 1200);
      } catch (err) {
        say(err.message || "That could not be retried.");
      } finally {
        setBusy("");
      }
    },
    [accessToken, say],
  );

  /* ── columns ─────────────────────────────────────────────────────────── */

  const cols = [
    {
      h: "Video",
      cell: (v) => (
        <AdmTwo
          top={v.title || v.videoId}
          under={
            <a href={v.url} target="_blank" rel="noreferrer">
              {v.videoId}
            </a>
          }
        />
      ),
    },
    {
      h: "Published",
      w: "150px",
      cell: (v) => (v.publishedAt ? when(v.publishedAt) : <AdmDim>unknown</AdmDim>),
    },
    {
      h: "Sent",
      w: "170px",
      cell: (v) =>
        v.notifiedAt ? (
          <AdmTwo
            top={when(v.notifiedAt)}
            under={v.source === "manual" ? `by ${v.notifiedBy || "an admin"}` : "by the poller"}
          />
        ) : (
          <AdmChip tone="calm">Not yet</AdmChip>
        ),
    },
    {
      h: "Recipients",
      w: "110px",
      num: true,
      cell: (v) => (v.notifiedAt ? num(v.stats.sent) : <AdmDim>—</AdmDim>),
    },
    {
      h: "Failed",
      w: "90px",
      num: true,
      cell: (v) =>
        !v.notifiedAt ? (
          <AdmDim>—</AdmDim>
        ) : v.stats.failed ? (
          <AdmChip tone="bad">{num(v.stats.failed)}</AdmChip>
        ) : (
          <AdmDim>0</AdmDim>
        ),
    },
    {
      // Not a failure. Shown so "760 of 820" reads as consent rather than
      // sending somebody looking for a bug that is not there.
      h: "Skipped",
      w: "160px",
      cell: (v) =>
        !v.notifiedAt ? (
          <AdmDim>—</AdmDim>
        ) : (
          <AdmDim>
            {num(v.stats.skippedOptedOut)} opted out · {num(v.stats.skippedUnverified)} unconfirmed
          </AdmDim>
        ),
    },
    {
      h: "",
      w: "150px",
      cell: (v) => (
        <span className="adm-rowacts">
          {v.stats.dryRun ? <AdmChip tone="due">Dry run</AdmChip> : null}
          {v.failedCount > 0 ? (
            <button
              type="button"
              className="ds-btn btn-o ds-btn-sm"
              disabled={busy === v.videoId}
              onClick={() => resend(v)}
            >
              {busy === v.videoId ? "Retrying…" : `Resend to ${num(v.failedCount)}`}
            </button>
          ) : null}
        </span>
      ),
    },
  ];

  if (failed) {
    return (
      <>
        {toast}
        <p className="adm-note">That list could not be read. Reload the page.</p>
      </>
    );
  }

  return (
    <>
      {toast}

      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Videos</h1>
          <p className="adm-lede">
            Every video the channel publishes is mailed to everybody with a confirmed address who
            has not turned video updates off. The poller checks every fifteen minutes; the box
            below is for when a launch cannot wait that long.
          </p>
        </div>
      </div>

      {config.dryRun ? (
        <div className="adm-merge">
          <b>DRY_RUN is on. Nothing is being sent to anybody.</b>
          <span>
            Runs go through the whole audience and the whole template and then log the recipients
            instead of mailing them. Unset DRY_RUN on the server to send for real.
          </span>
        </div>
      ) : null}

      {!config.pollerConfigured ? (
        <div className="adm-merge">
          <b>The poller is not configured, so nothing is being checked.</b>
          <span>
            YOUTUBE_API_KEY and YOUTUBE_CHANNEL_ID both have to be set. Until they are, this screen
            will stay empty whether or not the channel has published anything — which is exactly
            why it says so here rather than looking quiet.
          </span>
        </div>
      ) : null}

      <div className="adm-merge">
        <b>Announce one now</b>
        <span>
          Paste the watch URL, the youtu.be link or the 11-character id. It sends the same mail the
          poller would, and a video that has already been announced is refused rather than sent
          twice.
        </span>
        <div className="adm-inline" style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input
            type="text"
            className="ds-input"
            style={{ flex: 1, minWidth: 0 }}
            placeholder="https://www.youtube.com/watch?v=…"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") announce();
            }}
          />
          <button
            type="button"
            className="ds-btn btn-p ds-btn-sm"
            disabled={busy === "notify" || !paste.trim()}
            onClick={announce}
          >
            {busy === "notify" ? "Sending…" : "Announce it"}
          </button>
        </div>
      </div>

      <AdmFilters
        current={view}
        onPick={setView}
        options={[
          ["all", "Everything", counts.all],
          ["notified", "Announced", counts.notified],
          ["pending", "Not yet", counts.pending],
          ["failures", "With failures", counts.withFailures],
        ]}
      />

      {!d ? (
        <p className="adm-note">Reading…</p>
      ) : (
        <>
          <AdmTable
            cols={cols}
            rows={items}
            rowKey={(v) => v.videoId}
            empty={[
              "No videos yet",
              "Nothing has been filed. The poller records what it finds on the channel; the first run files the back catalogue without mailing anybody, so the first video you hear about is the next one published.",
            ]}
          />

          <div className="adm-merge">
            <b>Turning video updates off stops these only.</b>
            <span>
              Receipts, licence activations, renewal warnings, password resets and support replies
              ignore the switch entirely. Unconfirmed addresses are skipped too — nobody has proved
              they exist, and mailing them costs sender reputation on the bounce.
            </span>
          </div>
        </>
      )}
    </>
  );
}
