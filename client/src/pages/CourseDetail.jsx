import React from "react";
import dayjs from "dayjs";
import { useParams } from "react-router-dom";
import { apiAuthed } from "../http.js";
import { useAuth } from "../store.jsx";
import { parseBunny, bunnyIframeSrc } from "../lib/video.js";
import CertificateNameModal from "../components/CertificateNameModal.jsx";
import { SecureVideo, SecureEmbed } from "../components/SecureVideo.jsx";
import ModuleQuiz from "../components/ModuleQuiz.jsx";
import { IconAlertCircle, IconLock } from "../components/icons.jsx";

function accessTone(access) {
  if (access?.isExpired) {
    return "bg-rose-50 text-rose-700 ring-1 ring-rose-100";
  }
  if (typeof access?.daysLeft === "number" && access.daysLeft <= 7) {
    return "bg-amber-50 text-amber-800 ring-1 ring-amber-100";
  }
  if (access?.expiresAt) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100";
  }
  return "bg-slate-50 text-slate-700 ring-1 ring-slate-100";
}

function statCard(label, value, helper = "") {
  return { label, value, helper };
}

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
  const { accessToken } = useAuth();
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [activeCode, setActiveCode] = React.useState("");
  const [track, setTrack] = React.useState("lecture");
  const [certModalOpen, setCertModalOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setErr("");
      const res = await apiAuthed(`/me/courses/${encodeURIComponent(sku)}`, {
        token: accessToken,
      });
      setData(res);
      const first = res?.moduleSubmissions?.[0]?.moduleCode || "";
      setActiveCode((prev) => prev || first);
    } catch (e) {
      setErr(e?.message || "Failed to load course");
    }
  }, [sku, accessToken]);

  React.useEffect(() => {
    load();
  }, [load]);

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

  if (err) return <div className="card text-red-600">{err}</div>;
  if (!data) return <div className="card text-sm text-slate-600">Loading...</div>;

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

  const stats = [
    statCard(
      "Modules",
      `${summary?.completedModules || 0}/${summary?.totalModules || 0}`,
      `${progress}% complete`,
    ),
    statCard(
      "Assignments",
      `${summary?.submittedAssignments || 0}/${summary?.requiredAssignments || 0}`,
      `${summary?.pendingAssignments || 0} pending review`,
    ),
    statCard(
      "Access",
      access?.label || "Open access",
      access?.expiresAt ? dayjs(access.expiresAt).format("MMM D, YYYY") : "No expiry set",
    ),
  ];

  return (
    <div className="space-y-6">
      <div className="card space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          {course.thumbnailUrl ? (
            <img
              src={course.thumbnailUrl}
              className="h-28 w-40 rounded border object-cover"
              alt=""
            />
          ) : (
            <div className="h-28 w-40 rounded border bg-slate-100" />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{course.title}</h1>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${accessTone(access)}`}>
                {access?.label || "Open access"}
              </span>
            </div>

            <p className="mt-2 text-sm text-slate-600">{course.blurb}</p>

            {course.description ? (
              <details className="mt-2 group">
                <summary className="cursor-pointer text-sm font-medium text-adlm-blue-700 marker:content-['']">
                  <span className="group-open:hidden">What this course covers ▾</span>
                  <span className="hidden group-open:inline">Hide course outline ▴</span>
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-adlm-dark-dim">
                  {course.description}
                </p>
              </details>
            ) : null}

            <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <IconAlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-xs text-amber-800">
                <span className="font-semibold">Disclaimer:</span> ADLM Softwares and Plugins do not come with the course.
              </p>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded bg-slate-200">
              <div className="h-full bg-adlm-blue-700" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-1 text-xs text-slate-600">{progress}% complete</div>

            <div className="mt-4 flex flex-wrap gap-2">
              {classroom?.joinUrl ? (
                <a
                  className="px-3 py-2 rounded-md bg-adlm-blue-700 text-white text-sm hover:bg-[#0050c8] transition"
                  href={classroom.joinUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Go to Google Classroom
                </a>
              ) : null}

              {enrollment?.status === "completed" && course?.certificateTemplateUrl ? (
                <button
                  className="px-3 py-2 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700 transition"
                  onClick={() => setCertModalOpen(true)}
                >
                  Download Certificate
                </button>
              ) : enrollment?.certificateUrl ? (
                <a
                  className="px-3 py-2 rounded-md border text-sm hover:bg-slate-50 transition"
                  href={enrollment.certificateUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download certificate
                </a>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {stats.map((item) => (
            <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-500">{item.label}</div>
              <div className="mt-1 font-semibold text-slate-900">{item.value}</div>
              <div className="mt-1 text-xs text-slate-500">{item.helper}</div>
            </div>
          ))}
        </div>

        {(classroom?.joinUrl || classroom?.notes) && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <div className="font-medium text-slate-900">Classroom access</div>
            <div className="mt-1">
              Google Classroom opens in a new tab. Progress shown here reflects work tracked through ADLM Studio.
            </div>
            {classroom?.notes ? (
              <div className="mt-2 whitespace-pre-wrap">{classroom.notes}</div>
            ) : null}
          </div>
        )}

        {Array.isArray(course?.softwares) && course.softwares.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="font-semibold text-slate-900 mb-1">Course softwares</div>
            <p className="text-xs text-slate-500 mb-3">
              Download the tools you need for this course. Each software has an
              optional install walkthrough video.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {course.softwares.map((s) => {
                const sizeMb = s.fileSize ? (s.fileSize / (1024 * 1024)).toFixed(1) : null;
                return (
                  <div
                    key={s._id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex flex-col gap-2"
                  >
                    <div>
                      <div className="font-medium text-slate-900">
                        {s.name}
                        {s.version ? (
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            {s.version}
                          </span>
                        ) : null}
                      </div>
                      {s.description ? (
                        <div className="text-xs text-slate-600 mt-0.5">
                          {s.description}
                        </div>
                      ) : null}
                      <div className="mt-1 text-xs text-slate-500">
                        <span className="capitalize">{s.kind}</span>
                        {sizeMb ? ` · ${sizeMb} MB` : ""}
                      </div>
                    </div>
                    <div className="mt-auto flex flex-wrap gap-2">
                      {s.fileUrl ? (
                        <a
                          className="btn btn-sm"
                          href={s.fileUrl}
                          download
                          target="_blank"
                          rel="noreferrer"
                        >
                          Download
                        </a>
                      ) : (
                        <span className="text-xs text-amber-700">
                          File not yet available
                        </span>
                      )}
                      {s.installVideoUrl ? (
                        <a
                          className="btn btn-sm bg-slate-800 text-white hover:bg-slate-700"
                          href={s.installVideoUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Install video
                        </a>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          {active?.hasSummary ? (
            <div className="mb-3 flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-white/5 w-fit">
              {[
                { id: "lecture", label: "Full session", hint: active.durationSec },
                { id: "recap", label: "Recap", hint: active.summaryDurationSec },
              ].map((tab) => {
                const id = tab.id === "recap" ? "summary" : "lecture";
                const on = track === id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTrack(id)}
                    aria-pressed={on}
                    className={`rounded-md px-3 py-1.5 text-sm transition ${
                      on
                        ? "bg-white font-medium text-slate-900 shadow-sm dark:bg-white/10 dark:text-white"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                    }`}
                  >
                    {tab.label}
                    {tab.hint ? (
                      <span className="ml-1.5 text-xs opacity-60">
                        {Math.round(tab.hint / 60)} min
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
          {playbackBlocked ? (
            <div className="grid w-full aspect-video place-items-center rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
              <div>
                <div className="font-semibold text-amber-900">
                  This account is already watching on another device
                </div>
                <p className="mx-auto mt-2 max-w-md text-sm text-amber-800">
                  Your plan allows {playbackBlocked.limit || 2} streams at a time.
                  Close the lecture on the other device and reload this page, the
                  seat frees itself about a minute and a half after playback stops.
                </p>
              </div>
            </div>
          ) : playerSrc ? (
            isBunny ? (
              <SecureEmbed
                className="aspect-video w-full rounded-xl ring-1 ring-black/10 dark:ring-white/10 shadow-depth"
                src={playerSrc}
                title="course-player"
                sessionRef={playback?.sessionRef || ""}
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
              />
            ) : (
              <SecureVideo
                className="aspect-video w-full rounded-xl ring-1 ring-black/10 dark:ring-white/10 shadow-depth"
                src={playerSrc}
                sessionRef={playback?.sessionRef || ""}
                videoClassName="object-contain"
                preload="metadata"
              />
            )
          ) : (
            <div className="grid w-full aspect-video place-items-center rounded-xl border border-slate-200 dark:border-adlm-dark-border bg-black px-6 text-center text-white/70">
              <div>
                <div className="font-medium text-white/90">
                  Recording not available yet
                </div>
                <p className="mt-1 text-sm">
                  The notes below cover this session. The recording appears here
                  once it has been uploaded.
                </p>
              </div>
            </div>
          )}
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400 dark:text-adlm-dark-dim">
            <IconLock className="w-3.5 h-3.5" />
            Protected stream, watermarked to your account. Recording or sharing is prohibited.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              className="btn btn-sm"
              onClick={() => markComplete(active.moduleCode)}
              disabled={!active?.moduleCode}
            >
              {active?.completed ? "Completed" : "Mark complete"}
            </button>

            {active?.requiresSubmission && (
              <label className={`btn btn-sm ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
                Upload assignment
                <input
                  type="file"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) =>
                    submitAssignment(active.moduleCode, e.target.files?.[0])
                  }
                />
              </label>
            )}
          </div>

          {active?.instructions ? (
            <div className="mt-4">
              <div className="font-medium">What this session covers</div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-adlm-dark-dim">
                {active.instructions}
              </p>
            </div>
          ) : null}

          {active?.requiresSubmission && (
            <div className="mt-4 space-y-3">
              <div>
                <div className="font-medium">Assignment</div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                  {active.assignmentPrompt || "No instructions provided."}
                </p>
              </div>

              <div>
                <div className="text-xs text-slate-600">Your submissions</div>
                {(active.submissions || []).length === 0 ? (
                  <div className="mt-1 text-xs text-slate-500">No submissions yet.</div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {(active.submissions || []).map((submission) => (
                      <div
                        key={submission._id}
                        className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 text-xs sm:flex-row sm:items-center sm:justify-between"
                      >
                        <a
                          className="truncate underline"
                          href={submission.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {submission.fileUrl}
                        </a>
                        <span className="shrink-0 text-slate-600">
                          {submission.gradeStatus}
                          {submission.feedback ? ` - ${submission.feedback}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          {isIntro ? null : <ModuleQuiz sku={sku} moduleCode={active?.moduleCode || ""} />}
        </div>

        <div className="card">
          <div className="mb-2 font-semibold">Modules</div>
          <div className="space-y-2">
            {course?.hasOnboarding ? (
              <button
                className={`w-full rounded border border-dashed p-3 text-left hover:bg-slate-50 ${
                  activeCode === INTRO_CODE ? "ring-2 ring-adlm-blue-700" : ""
                }`}
                onClick={() => setActiveCode(INTRO_CODE)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">Start here, course intro</div>
                    <div className="mt-1 text-xs text-slate-500">
                      How the programme runs
                    </div>
                  </div>
                  {course.onboardingDurationSec ? (
                    <div className="text-right text-xs text-slate-500">
                      {Math.round(course.onboardingDurationSec / 60)} min
                    </div>
                  ) : null}
                </div>
              </button>
            ) : null}
            {moduleSubmissions.map((module, idx) => (
              <button
                key={module.moduleCode}
                className={`w-full rounded border p-3 text-left hover:bg-slate-50 ${
                  activeCode === module.moduleCode ? "ring-2 ring-adlm-blue-700" : ""
                }`}
                onClick={() => setActiveCode(module.moduleCode)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">
                      {idx + 1}. {module.moduleTitle}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {module.completed ? "Completed" : "In progress"}
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    {module.requiresSubmission ? "Assignment required" : "Watch and mark complete"}
                  </div>
                </div>
              </button>
            ))}
            {moduleSubmissions.length === 0 && (
              <div className="text-sm text-slate-600">No modules yet.</div>
            )}
          </div>
        </div>
      </div>

      <CertificateNameModal
        open={certModalOpen}
        onClose={() => setCertModalOpen(false)}
        courseSku={course?.sku || sku}
        courseTitle={course?.title}
        courseDescription={course?.blurb || ""}
        completionDate={enrollment?.certificateIssuedAt || enrollment?.updatedAt}
      />
    </div>
  );
}
