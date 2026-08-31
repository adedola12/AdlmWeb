import React from "react";
import dayjs from "dayjs";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { apiAuthed } from "../http.js";
import { useAuth } from "../store.jsx";
import { parseBunny, bunnyIframeSrc } from "../lib/video.js";
import CertificateNameModal from "../components/CertificateNameModal.jsx";
import { clock } from "../ds/lxCourses.js";
import { SecureVideo, SecureEmbed } from "../components/SecureVideo.jsx";
import ModuleQuiz from "../components/ModuleQuiz.jsx";
import {
  IconDownload,
  IconLink,
  IconLock,
  IconPlaySquare,
  IconPlus,
} from "../components/icons.jsx";

/* Stands in for a module code in the sidebar selection, so one piece of state
   drives both which recording plays and which panel is shown. Never sent to the
   server: the intro is requested with an empty moduleCode. */
const INTRO_CODE = "__intro";

/**
 * Claims a streaming seat for the module being watched, keeps it alive with a
 * heartbeat, and hands back the session ref that gets burned into the video
 * watermark.
 *
 * Returns `blocked` when the account already has the maximum number of streams
 * running — the seat frees itself ~90s after the other device stops, so the
 * message tells the student that rather than leaving them stuck.
 *
 * `track` picks the lecture or its recap clip. Switching tears the session down
 * and claims a fresh one, which is right: they are two different encodes behind
 * two different signed prefixes, and only one of them is playing at a time.
 */
function usePlaybackSession(sku, moduleCode, token, track = "lecture") {
  const [session, setSession] = React.useState(null);
  const [blocked, setBlocked] = React.useState(null);

  React.useEffect(() => {
    // The intro belongs to the course, not to a module, so it is the one track
    // that legitimately has no module code.
    if (!sku || !token) return undefined;
    if (!moduleCode && track !== "onboarding") return undefined;

    let cancelled = false;
    let timer = null;
    let current = null;
    const startedAt = Date.now();
    let lastPingAt = startedAt;

    const stop = () => {
      if (!current) return;
      const body = JSON.stringify({ sessionId: current });
      // No sendBeacon here: it cannot carry the Authorization header this API
      // requires, so it would always 401. If the tab dies before this request
      // lands, the missing heartbeat frees the seat within 90s anyway.
      apiAuthed(`/me/courses/${encodeURIComponent(sku)}/playback/stop`, {
        token,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }).catch(() => {});
      current = null;
    };

    (async () => {
      try {
        const res = await apiAuthed(
          `/me/courses/${encodeURIComponent(sku)}/playback/start`,
          {
            token,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              moduleCode: track === "onboarding" ? "" : moduleCode,
              track,
            }),
          },
        );
        if (cancelled) {
          current = res.sessionId;
          stop();
          return;
        }
        current = res.sessionId;
        setSession(res);
        setBlocked(null);

        timer = setInterval(() => {
          const now = Date.now();
          const deltaSec = Math.round((now - lastPingAt) / 1000);
          lastPingAt = now;
          apiAuthed(`/me/courses/${encodeURIComponent(sku)}/playback/ping`, {
            token,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: current,
              watchedDeltaSec: deltaSec,
              positionSec: Math.round((now - startedAt) / 1000),
            }),
          }).catch(() => {});
        }, (res.heartbeatSec || 30) * 1000);
      } catch (e) {
        if (cancelled) return;
        if (e?.status === 409) {
          setSession(null);
          setBlocked(e.data || { error: "Too many active streams" });
        }
      }
    })();

    window.addEventListener("pagehide", stop);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("pagehide", stop);
      stop();
    };
  }, [sku, moduleCode, token, track]);

  return { session, blocked };
}

export default function CourseDetail() {
  const { sku } = useParams();
  const [params] = useSearchParams();
  const { accessToken } = useAuth();
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [activeCode, setActiveCode] = React.useState("");
  const [track, setTrack] = React.useState("lecture");
  // His four-tab strip under the stage. "about" is the only one every
  // session has, so it is both the default and the fallback when a tab
  // disappears — switching to a session with no assignment must not leave
  // the panel pointing at one.
  const [tab, setTab] = React.useState("about");
  // His Notes tab. Kept on the account, per lesson — see LessonNote for why
  // that is the whole specification of the feature.
  const [note, setNote] = React.useState("");
  const [noteState, setNoteState] = React.useState("idle");
  // His Transcript tab. `at` is the player's position, which is what makes the
  // live cue highlight and the timestamps work as controls rather than labels.
  const [rate, setRate] = React.useState(() => {
    try {
      const saved = Number(localStorage.getItem("adlm_lecture_rate"));
      // Clamped rather than trusted: a value left over from a different set of
      // options, or edited by hand, must not put the player somewhere the
      // control cannot show or the browser will refuse.
      return saved >= 0.5 && saved <= 3 ? saved : 1;
    } catch {
      return 1;
    }
  });
  const [cues, setCues] = React.useState(null);
  const [at, setAt] = React.useState(0);
  const videoRef = React.useRef(null);
  // Read inside bindVideo, which is memoised on nothing — a ref keeps it
  // current without re-binding the element every time the speed changes.
  const rateRef = React.useRef(1);
  const [certModalOpen, setCertModalOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setErr("");
      const res = await apiAuthed(`/me/courses/${encodeURIComponent(sku)}`, {
        token: accessToken,
      });
      setData(res);
      // My learning links here with the lesson somebody stopped at. Only
      // honour it if that module actually exists on this course, so a stale
      // or hand-typed link falls back to the top rather than a blank stage.
      //
      // Read through the router rather than off window.location: the two agree
      // under BrowserRouter and nowhere else, which makes the deep link
      // untestable and quietly wrong anywhere the history is not the address
      // bar.
      const wanted = params.get("m") || "";
      const open = (res?.moduleSubmissions || []).some((m) => m.moduleCode === wanted)
        ? wanted
        : res?.moduleSubmissions?.[0]?.moduleCode || "";
      setActiveCode((prev) => prev || open);
    } catch (e) {
      setErr(e?.message || "Failed to load course");
    }
  }, [sku, accessToken, params]);

  React.useEffect(() => {
    load();
  }, [load]);

  // Notes are fetched per lesson rather than with the course: most sessions
  // will never have one, and loading eighteen empty strings to render one
  // textarea is work nobody asked for.
  React.useEffect(() => {
    if (!sku || !accessToken || !activeCode || activeCode === INTRO_CODE) {
      setNote("");
      setNoteState("idle");
      return undefined;
    }
    let alive = true;
    setNoteState("loading");
    apiAuthed(
      `/me/courses/${encodeURIComponent(sku)}/notes/${encodeURIComponent(activeCode)}`,
      { token: accessToken },
    )
      .then((r) => {
        if (!alive) return;
        setNote(r?.body || "");
        setNoteState("idle");
      })
      .catch(() => alive && setNoteState("idle"));
    return () => {
      alive = false;
    };
  }, [sku, accessToken, activeCode]);

  React.useEffect(() => {
    rateRef.current = rate;
    if (videoRef.current) videoRef.current.playbackRate = rate;
    try {
      localStorage.setItem("adlm_lecture_rate", String(rate));
    } catch {
      // A browser with storage blocked still gets the speed, just not the memory.
    }
  }, [rate]);

  // Fetched per lesson like the notes, and for the same reason: a course has
  // eighteen of these and a session needs one.
  React.useEffect(() => {
    if (!sku || !accessToken || !activeCode || activeCode === INTRO_CODE) {
      setCues(null);
      return undefined;
    }
    let alive = true;
    setCues(null);
    apiAuthed(
      `/me/courses/${encodeURIComponent(sku)}/transcript/${encodeURIComponent(activeCode)}`,
      { token: accessToken },
    )
      .then((r) => alive && setCues(Array.isArray(r?.cues) ? r.cues : []))
      .catch(() => alive && setCues([]));
    return () => {
      alive = false;
    };
  }, [sku, accessToken, activeCode]);

  // The player's position, for the live cue. Bound imperatively because the
  // element comes from SecureVideo rather than from this component's JSX.
  const bindVideo = React.useCallback((el) => {
    videoRef.current = el;
    if (!el) return;
    // A newly mounted <video> always starts at 1x, so the chosen speed has to
    // be re-applied here rather than only when the control is used.
    el.playbackRate = rateRef.current;
    const onTime = () => setAt(el.currentTime || 0);
    el.addEventListener("timeupdate", onTime);
    // Not returned as cleanup — SecureVideo calls this again with null on
    // unmount, and the listener dies with the element either way.
  }, []);

  // Saved on a pause in typing rather than on every keystroke, and never on
  // unmount: a note the person is mid-sentence on is not a note they have
  // finished, and firing a request per character would be one per character.
  React.useEffect(() => {
    if (noteState !== "dirty") return undefined;
    const timer = setTimeout(async () => {
      setNoteState("saving");
      try {
        await apiAuthed(
          `/me/courses/${encodeURIComponent(sku)}/notes/${encodeURIComponent(activeCode)}`,
          {
            token: accessToken,
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body: note }),
          },
        );
        setNoteState("saved");
      } catch {
        setNoteState("failed");
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [note, noteState, sku, activeCode, accessToken]);

  const { session: playback, blocked: playbackBlocked } = usePlaybackSession(
    sku,
    activeCode,
    accessToken,
    track,
  );

  // Moving to another session always lands on its lecture. Staying on "recap"
  // across a module change would silently start the next session on a 3-minute
  // summary — and on the modules that have none, on nothing at all.
  React.useEffect(() => {
    setTrack(activeCode === INTRO_CODE ? "onboarding" : "lecture");
  }, [activeCode]);

  async function markComplete(moduleCode) {
    try {
      await apiAuthed(`/me/courses/${encodeURIComponent(sku)}/complete`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleCode }),
      });
      await load();
    } catch (e) {
      alert(e.message || "Failed to mark complete");
    }
  }

  async function uploadToCloudinary(file, resourceType = "raw") {
    setUploading(true);
    try {
      const sig = await apiAuthed(`/me/media/sign`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource_type: resourceType }),
      });
      const fd = new FormData();
      fd.append("file", file);
      fd.append("api_key", sig.api_key);
      fd.append("timestamp", sig.timestamp);
      fd.append("signature", sig.signature);
      if (sig.folder) fd.append("folder", sig.folder);

      const endpoint = `https://api.cloudinary.com/v1_1/${sig.cloud_name}/${resourceType}/upload`;
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.secure_url) {
        throw new Error(json?.error?.message || "Upload failed");
      }
      return json.secure_url;
    } finally {
      setUploading(false);
    }
  }

  async function submitAssignment(moduleCode, file) {
    if (!file) return;
    const ext = (file.name || "").split(".").pop().toLowerCase();
    const isVideo = ["mp4", "mov", "avi", "mkv", "webm"].includes(ext);
    const isImage = ["png", "jpg", "jpeg", "gif", "webp"].includes(ext);
    const resourceType = isVideo ? "video" : isImage ? "image" : "raw";

    try {
      const fileUrl = await uploadToCloudinary(file, resourceType);
      await apiAuthed(`/me/courses/${encodeURIComponent(sku)}/submit`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleCode, fileUrl }),
      });
      await load();
      alert("Submitted!");
    } catch (e) {
      alert(e.message || "Submit failed");
    }
  }

  if (err) {
    return (
      <div className="lx-stage msg" style={{ aspectRatio: "auto" }}>
        <div>
          <b>This course could not be opened</b>
          <p>{err}</p>
        </div>
      </div>
    );
  }
  if (!data) return <p className="ds-sub">Loading the course…</p>;

  const { course, enrollment, progress, moduleSubmissions, summary, access, classroom } = data;
  // The intro is not a module: it has no assignment, no quiz and nothing to
  // mark complete, so it selects an empty module rather than falling through to
  // the first one — which would quietly play lecture one under an "intro" tab.
  const isIntro = activeCode === INTRO_CODE;
  const active = isIntro
    ? {}
    : moduleSubmissions.find((module) => module.moduleCode === activeCode) ||
      moduleSubmissions[0] ||
      {};

  // A signed CloudFront stream wins when the session hands one back: it is the
  // only source that carries the concurrency seat and the audit row. Anything
  // still on the old host keeps playing until its master has been transcoded.
  const hlsSrc = playback?.playbackUrl || "";
  // Only fall back to the onboarding video when there are no modules at all.
  // Playing it under every module made all 18 sessions look like the same
  // recording while the real ones were still being migrated.
  // The legacy per-module URL is the lecture, so it is not a stand-in for a
  // recap that has not finished encoding — showing the two-hour session under
  // a "Recap" tab would be worse than showing nothing.
  const fallbackSrc =
    track === "summary"
      ? ""
      : active?.moduleCode
        ? active?.videoUrl || ""
        : course?.onboardingVideoUrl || "";
  const parsed = hlsSrc ? null : parseBunny(fallbackSrc);
  const isBunny = parsed?.kind === "bunny";
  const playerSrc = hlsSrc || (isBunny ? bunnyIframeSrc(parsed.libId, parsed.videoId) : parsed?.src);

  // Where this session sits in the list, which is what makes "Next lesson" a
  // real destination rather than a guess.
  const index = isIntro
    ? -1
    : moduleSubmissions.findIndex((m) => m.moduleCode === active.moduleCode);
  const next = isIntro ? moduleSubmissions[0] : moduleSubmissions[index + 1] || null;
  const total = moduleSubmissions.length;
  const done = summary?.completedModules || 0;
  const softwares = Array.isArray(course?.softwares) ? course.softwares : [];
  // Weeks exist only where somebody set them in the admin editor. Where they
  // do, the sidebar groups by week and the head says "Week 4" exactly as his
  // does; where they do not, it stays a flat numbered list rather than
  // inventing a week per session.
  const hasWeeks = moduleSubmissions.some((m) => Number(m.week || 0) > 0);
  const groups = hasWeeks
    ? [
        ...moduleSubmissions.reduce((acc, m, i) => {
          const w = Number(m.week || 0) || 0;
          if (!acc.has(w)) acc.set(w, []);
          acc.get(w).push({ ...m, i });
          return acc;
        }, new Map()),
      ].sort((a, b) => a[0] - b[0])
    : [[0, moduleSubmissions.map((m, i) => ({ ...m, i }))]];
  const submissions = active?.submissions || [];
  const certReady = enrollment?.status === "completed" && !!course?.certificateTemplateUrl;

  // His four tabs are About / Transcript / Resources / Notes. We hold no
  // transcripts and no per-lesson notes, so those two would be empty frames
  // with invented content in them. What we do hold and he does not is the
  // assignment and the quiz, so they take the slots.
  const TABS = [
    { id: "about", label: "About this lesson" },
    !isIntro && active?.hasTranscript ? { id: "transcript", label: "Transcript" } : null,
    softwares.length ? { id: "resources", label: "Resources" } : null,
    active?.requiresSubmission ? { id: "assignment", label: "Assignment" } : null,
    isIntro ? null : { id: "quiz", label: "Quiz" },
    isIntro ? null : { id: "notes", label: "Notes" },
  ].filter(Boolean);
  const tabOn = TABS.some((t) => t.id === tab) ? tab : "about";

  const lessonTitle = isIntro
    ? "Start here, course intro"
    : active?.moduleTitle || active?.moduleCode || course.title;
  const lessonLength = isIntro
    ? course.onboardingDurationSec
    : track === "summary"
      ? active?.summaryDurationSec
      : active?.durationSec;

  return (
    <>
      <div className="lx-player">
        <div>
          {/* The lecture and its recap are two different encodes behind two
              different signed prefixes, so this is a real switch, not a view. */}
          {active?.hasSummary && !isIntro ? (
            <div className="lx-tabs track">
              {[
                { id: "lecture", label: "Full session", secs: active.durationSec },
                { id: "summary", label: "Recap", secs: active.summaryDurationSec },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={track === t.id ? "on" : undefined}
                  aria-pressed={track === t.id}
                  onClick={() => setTrack(t.id)}
                >
                  {t.label}
                  {t.secs ? ` · ${Math.round(t.secs / 60)} min` : ""}
                </button>
              ))}
            </div>
          ) : null}

          {playbackBlocked ? (
            <div className="lx-stage msg">
              <div>
                <b>This account is already watching on another device</b>
                <p>
                  Your plan allows {playbackBlocked.limit || 2} streams at a time. Close the
                  lecture on the other device and reload — the seat frees itself about a minute
                  and a half after playback stops.
                </p>
              </div>
            </div>
          ) : playerSrc ? (
            isBunny ? (
              <SecureEmbed
                className="lx-stage live"
                src={playerSrc}
                title="course-player"
                sessionRef={playback?.sessionRef || ""}
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
              />
            ) : (
              <SecureVideo
                className="lx-stage live"
                onElement={bindVideo}
                src={playerSrc}
                sessionRef={playback?.sessionRef || ""}
                videoClassName="object-contain"
                preload="metadata"
              />
            )
          ) : (
            <div className="lx-stage msg">
              <div>
                <b>Recording not available yet</b>
                <p>
                  The notes below cover this session. The recording appears here once it has been
                  uploaded.
                </p>
              </div>
            </div>
          )}

          <div className="lx-guard">
            <IconLock />
            <span>
              Protected stream, watermarked to your account. Recording or sharing is prohibited.
            </span>
            {/* Speed. A ninety-six minute lecture is the reason this exists —
                the native control is switched off by controlsList, alongside
                download and remote playback, so it is offered here instead. */}
            <span className="lx-rate">
              <label htmlFor="lx-rate">Speed</label>
              <select
                id="lx-rate"
                value={rate}
                onChange={(e) => setRate(Number(e.target.value) || 1)}
              >
                {/* Past 2x the browser stops pitch-correcting and the tutor
                    starts to chipmunk, but these are ninety-minute lectures
                    and somebody revising a session they have already watched
                    is entitled to skim it. */}
                {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3].map((r) => (
                  <option key={r} value={r}>
                    {r === 1 ? "Normal" : `${r}×`}
                  </option>
                ))}
              </select>
            </span>
          </div>

          <div className="lx-head">
            <div>
              <span className="k">
                {course.title}
                {isIntro
                  ? " · Intro"
                  : hasWeeks && active?.week
                    ? ` · Week ${active.week}`
                    : total
                      ? ` · Lesson ${index + 1} of ${total}`
                      : ""}
              </span>
              <h1>{lessonTitle}</h1>
            </div>
            <div className="lx-hacts">
              {isIntro ? null : (
                <button
                  type="button"
                  className="ds-btn btn-o ds-btn-sm"
                  onClick={() => markComplete(active.moduleCode)}
                  disabled={!active?.moduleCode}
                >
                  {active?.completed ? "Completed" : "Mark complete"}
                </button>
              )}
              {next ? (
                <button
                  type="button"
                  className="ds-btn btn-p ds-btn-sm"
                  onClick={() => {
                    setActiveCode(next.moduleCode);
                    setTab("about");
                    window.scrollTo(0, 0);
                  }}
                >
                  Next lesson
                </button>
              ) : certReady ? (
                <button
                  type="button"
                  className="ds-btn btn-p ds-btn-sm"
                  onClick={() => setCertModalOpen(true)}
                >
                  Your certificate
                </button>
              ) : (
                <Link className="ds-btn btn-p ds-btn-sm" to="/dash-certificates">
                  Your certificate
                </Link>
              )}
            </div>
          </div>

          <div className="lx-tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={tabOn === t.id ? "on" : undefined}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="lx-tabbody">
            {tabOn === "about" ? (
              <>
                <p className="lx-desc">
                  {active?.instructions ||
                    (isIntro
                      ? "How the programme runs: what is expected each week, how the sessions are recorded, and how the work is marked."
                      : course.description ||
                        course.blurb ||
                        "No description has been written for this session yet.")}
                </p>
                {/* His four cells, in his order: Course, the week, who
                    teaches it, how long it runs. Always four — dropping one
                    when its data is unset is what stops a page looking like
                    his, so each carries an honest fallback instead. */}
                <div className="lx-meta">
                  <div>
                    <span>Course</span>
                    <b>{course.title}</b>
                  </div>
                  <div>
                    <span>{hasWeeks && active?.week ? `Week ${active.week}` : "Progress"}</span>
                    <b>
                      {hasWeeks && active?.week
                        ? `${done} of ${total} lessons · ${progress}%`
                        : `Lesson ${index + 1} of ${total} · ${progress}%`}
                    </b>
                  </div>
                  <div>
                    <span>Tutor</span>
                    <b>
                      {course.tutorName || "ADLM Studio"}
                      {course.tutorName && course.tutorTitle ? ` · ${course.tutorTitle}` : ""}
                    </b>
                  </div>
                  <div>
                    <span>Length</span>
                    <b>{lessonLength ? clock(lessonLength) : "Not recorded"}</b>
                  </div>
                </div>
                <p className="wk-note">
                  {access?.label || "Open access"}
                  {access?.expiresAt
                    ? `, until ${dayjs(access.expiresAt).format("D MMMM YYYY")}.`
                    : " — this course does not expire."}
                </p>
                {classroom?.joinUrl || classroom?.notes ? (
                  <p className="wk-note">
                    {classroom?.joinUrl ? (
                      <>
                        Live sessions run in{" "}
                        <a
                          className="ds-a"
                          href={classroom.joinUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          the classroom
                        </a>
                        . Progress shown here is what ADLM Studio tracks.{" "}
                      </>
                    ) : null}
                    {classroom?.notes || ""}
                  </p>
                ) : null}
              </>
            ) : null}

            {tabOn === "transcript" ? (
              <>
                {cues === null ? (
                  <p className="lx-desc">Loading the transcript…</p>
                ) : cues.length === 0 ? (
                  <p className="lx-desc">
                    No transcript has been produced for this session yet.
                  </p>
                ) : (
                  <div className="lx-tx">
                    {cues.map((cue, i) => {
                      // The live cue is the last one that has started. Reading
                      // it off the next cue's start rather than off a duration
                      // means the final cue stays lit to the end of the video.
                      const next = cues[i + 1];
                      const live = at >= cue.at && (!next || at < next.at);
                      return (
                        <p key={`${cue.at}-${i}`} className={live ? "on" : undefined}>
                          <button
                            type="button"
                            onClick={() => {
                              const v = videoRef.current;
                              if (!v) return;
                              v.currentTime = cue.at;
                              setAt(cue.at);
                              if (v.paused) v.play?.().catch(() => {});
                            }}
                          >
                            {clock(cue.at)}
                          </button>
                          <span>{cue.text}</span>
                        </p>
                      );
                    })}
                  </div>
                )}
                <p className="wk-note">
                  Machine-transcribed from the recording, so expect the odd wrong word on a
                  technical term. Every timestamp moves the player.
                </p>
              </>
            ) : null}

            {tabOn === "resources" ? (
              <>
                <div className="lx-res">
                  {softwares.map((s) => {
                    const mb = s.fileSize ? (s.fileSize / (1024 * 1024)).toFixed(1) : null;
                    const meta = [s.kind, s.version, mb ? `${mb} MB` : null]
                      .filter(Boolean)
                      .join(" · ");
                    return s.fileUrl ? (
                      <a key={s._id} href={s.fileUrl} download target="_blank" rel="noreferrer">
                        <IconDownload />
                        <b>{s.name}</b>
                        <em>{meta}</em>
                      </a>
                    ) : (
                      <div className="row" key={s._id}>
                        <IconDownload />
                        <b>{s.name}</b>
                        <em>Not uploaded yet</em>
                      </div>
                    );
                  })}
                  {softwares
                    .filter((s) => s.installVideoUrl)
                    .map((s) => (
                      <a
                        key={`${s._id}-install`}
                        href={s.installVideoUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <IconPlaySquare />
                        <b>{s.name} — install walkthrough</b>
                        <em>Video</em>
                      </a>
                    ))}
                </div>
                <p className="wk-note">
                  Resources are attached to the course, so the version you download is the one the
                  tutor is teaching from. ADLM software and plugins are licensed separately and do
                  not come with the course.
                </p>
              </>
            ) : null}

            {tabOn === "assignment" ? (
              <>
                <p className="lx-desc">
                  {active.assignmentPrompt || "No brief has been written for this assignment yet."}
                </p>
                <div className="lx-res" style={{ marginTop: 18 }}>
                  <label className="row" style={{ cursor: uploading ? "wait" : "pointer" }}>
                    <IconPlus />
                    <b>{uploading ? "Uploading…" : "Upload your submission"}</b>
                    <em>Any file the brief asks for</em>
                    <input
                      type="file"
                      hidden
                      disabled={uploading}
                      onChange={(e) => submitAssignment(active.moduleCode, e.target.files?.[0])}
                    />
                  </label>
                  {submissions.map((sub) => (
                    <a
                      key={sub._id}
                      className={sub.gradeStatus === "approved" ? "ok" : undefined}
                      href={sub.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <IconLink />
                      <b>
                        {(sub.fileUrl || "").split("/").pop() || "Submission"}
                        {sub.feedback ? ` — ${sub.feedback}` : ""}
                      </b>
                      <em>{sub.gradeStatus || "submitted"}</em>
                    </a>
                  ))}
                </div>
                <p className="wk-note">
                  {submissions.length
                    ? "A submission stays here once it is marked, with the tutor's note against it."
                    : "Nothing submitted yet. The certificate is issued once every required submission is marked."}
                </p>
              </>
            ) : null}

            {tabOn === "quiz" ? (
              <ModuleQuiz sku={sku} moduleCode={active?.moduleCode || ""} />
            ) : null}

            {tabOn === "notes" ? (
              <>
                <textarea
                  className="lx-notes"
                  placeholder="Your notes on this lesson — they stay with it, and they are yours."
                  value={note}
                  onChange={(e) => {
                    setNote(e.target.value);
                    setNoteState("dirty");
                  }}
                />
                <p className="wk-note">
                  {noteState === "saving"
                    ? "Saving…"
                    : noteState === "saved"
                      ? "Saved to your account."
                      : noteState === "failed"
                        ? "That did not save. Your text is still here — it will try again as you type."
                        : "Notes are kept against the lesson on your account, so they follow you to another machine. Nobody else can read them."}
                </p>
              </>
            ) : null}
          </div>
        </div>

        <aside className="lx-side">
          <div className="lx-sh">
            <b>{course.title}</b>
            <span>
              {done} of {total} lessons · {progress}%
            </span>
            <div className="lx-bar">
              <i style={{ width: `${progress}%` }} />
            </div>
          </div>

          {course?.hasOnboarding ? (
            <div className="lx-mod">
              <div className="h">
                <span>Start</span>Before week one
              </div>
              <button
                type="button"
                className={`lx-li${isIntro ? " on" : ""}`}
                onClick={() => setActiveCode(INTRO_CODE)}
              >
                <span className="t">
                  {course.thumbnailUrl ? <img src={course.thumbnailUrl} alt="" /> : null}
                </span>
                <span className="n">
                  <b>Course intro</b>
                  <em>
                    {course.onboardingDurationSec
                      ? `${Math.round(course.onboardingDurationSec / 60)} min`
                      : "How the programme runs"}
                  </em>
                </span>
                <span className="tk" />
              </button>
            </div>
          ) : null}

          {groups.map(([week, items]) => (
            <div className="lx-mod" key={week}>
              <div className="h">
                <span>{week ? `Week ${week}` : "Lessons"}</span>
                {week
                  ? `${items.length} session${items.length === 1 ? "" : "s"}`
                  : total
                    ? `${total} in this course`
                    : "None yet"}
              </div>
              {items.map((module) => (
                <button
                  key={module.moduleCode}
                  type="button"
                  className={`lx-li${activeCode === module.moduleCode ? " on" : ""}${
                    module.completed ? " done" : ""
                  }`}
                  onClick={() => {
                    setActiveCode(module.moduleCode);
                    setTab("about");
                  }}
                >
                  <span className="t">
                    {course.thumbnailUrl ? <img src={course.thumbnailUrl} alt="" /> : null}
                  </span>
                  <span className="n">
                    <b>
                      {module.i + 1}. {module.moduleTitle}
                    </b>
                    <em>
                      {module.durationSec ? `${Math.round(module.durationSec / 60)} min` : ""}
                      {module.durationSec && module.requiresSubmission ? " · " : ""}
                      {module.requiresSubmission ? "Assignment" : ""}
                      {!module.durationSec && !module.requiresSubmission ? "Watch and mark" : ""}
                    </em>
                  </span>
                  <span className="tk" />
                </button>
              ))}
            </div>
          ))}
          {total === 0 ? (
            <p className="wk-note">No sessions have been published for this course yet.</p>
          ) : null}

          {/* His capstone box, once a course has one set. */}
          {course.capstoneTitle ? (
            <div className="lx-cap">
              <b>Capstone</b>
              <p>{course.capstoneTitle}</p>
              <span>
                {course.capstoneDueAt
                  ? `Due ${dayjs(course.capstoneDueAt).format("D MMMM YYYY")}`
                  : "No date set"}
              </span>
            </div>
          ) : null}

          {/* And what the capstone is for. On a course with no capstone set
              this is the only box, which is why it is not folded into the one
              above. */}
          <div className="lx-cap">
            <b>Certificate</b>
            <p>
              {certReady
                ? "Ready to download"
                : enrollment?.status === "completed"
                  ? "Signed off, template pending"
                  : `${Math.max(total - done, 0)} lesson${total - done === 1 ? "" : "s"} to go`}
            </p>
            <span>
              {certReady
                ? "Carries the name held on your account."
                : summary?.pendingAssignments
                  ? `${summary.pendingAssignments} submission${
                      summary.pendingAssignments === 1 ? " is" : "s are"
                    } with the tutor.`
                  : "Issued once the lessons are done and the submissions are marked."}
            </span>
          </div>
        </aside>
      </div>

      <CertificateNameModal
        open={certModalOpen}
        onClose={() => setCertModalOpen(false)}
        courseSku={course?.sku || sku}
        courseTitle={course?.title}
        courseDescription={course?.blurb || ""}
        completionDate={enrollment?.certificateIssuedAt || enrollment?.updatedAt}
      />
    </>
  );
}
