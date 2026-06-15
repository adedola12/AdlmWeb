import React from "react";
import {
  FaTimes,
  FaCopy,
  FaCheck,
  FaTrash,
  FaKey,
  FaUserFriends,
  FaEye,
  FaPen,
  FaQrcode,
  FaLink,
} from "react-icons/fa";
import { QRCodeSVG } from "qrcode.react";
import { apiAuthed } from "../../http.js";

// Owner-only panel to share a project with colleagues: generate share codes
// (each carrying a view/full access level, optional email restriction and use
// limit), see who has joined, change a collaborator's level, and revoke
// codes/people. Self-contained — it talks to /projects/:tool/:id/collab/*
// directly so the parent only has to open/close it.
export default function CollaboratorsModal({
  open,
  onClose,
  tool,
  projectId,
  accessToken,
}) {
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [collaborators, setCollaborators] = React.useState([]);
  const [codes, setCodes] = React.useState([]);

  // New-code form
  const [level, setLevel] = React.useState("view");
  const [label, setLabel] = React.useState("");
  const [emails, setEmails] = React.useState("");
  const [maxUses, setMaxUses] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState("");
  const [qrFor, setQrFor] = React.useState(""); // code id whose link/QR is open
  const [copiedLinkId, setCopiedLinkId] = React.useState("");

  const base = `/projects/${tool}/${projectId}/collab`;

  // Short share link for a code — opens /j/:code, which redeems it and forwards
  // into the project (handles the login round-trip for logged-out colleagues).
  const joinUrl = (c) =>
    c?.codePlain ? `${window.location.origin}/j/${c.codePlain}` : "";

  const load = React.useCallback(async () => {
    if (!projectId || !tool) return;
    setLoading(true);
    setErr("");
    try {
      const data = await apiAuthed(base, { token: accessToken });
      setCollaborators(data?.collaborators || []);
      setCodes(data?.codes || []);
    } catch (e) {
      setErr(e?.data?.error || e?.message || "Failed to load collaborators");
    } finally {
      setLoading(false);
    }
  }, [base, projectId, tool, accessToken]);

  React.useEffect(() => {
    if (open) load();
  }, [open, load]);

  React.useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    if (open) {
      document.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  async function createCode() {
    setCreating(true);
    setErr("");
    try {
      await apiAuthed(base + "/codes", {
        token: accessToken,
        method: "POST",
        body: {
          accessLevel: level,
          label: label.trim(),
          allowedEmails: emails
            .split(/[,\s;]+/)
            .map((s) => s.trim())
            .filter(Boolean),
          maxUses: Number(maxUses) || 0,
        },
      });
      setLabel("");
      setEmails("");
      setMaxUses("");
      await load();
    } catch (e) {
      setErr(e?.data?.error || e?.message || "Failed to create code");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(codeId) {
    setErr("");
    try {
      await apiAuthed(base + "/codes/" + codeId, {
        token: accessToken,
        method: "DELETE",
      });
      await load();
    } catch (e) {
      setErr(e?.data?.error || e?.message || "Failed to revoke code");
    }
  }

  async function changeLevel(userId, accessLevel) {
    setErr("");
    try {
      await apiAuthed(base + "/" + userId, {
        token: accessToken,
        method: "PATCH",
        body: { accessLevel },
      });
      await load();
    } catch (e) {
      setErr(e?.data?.error || e?.message || "Failed to update level");
    }
  }

  async function removePerson(userId) {
    setErr("");
    try {
      await apiAuthed(base + "/" + userId, {
        token: accessToken,
        method: "DELETE",
      });
      await load();
    } catch (e) {
      setErr(e?.data?.error || e?.message || "Failed to remove collaborator");
    }
  }

  function copyCode(c) {
    if (!c?.codePlain || !navigator?.clipboard) return;
    navigator.clipboard
      .writeText(c.codePlain)
      .then(() => {
        setCopiedId(c.id);
        setTimeout(() => setCopiedId(""), 1500);
      })
      .catch(() => {});
  }

  function copyLink(c) {
    const url = joinUrl(c);
    if (!url || !navigator?.clipboard) return;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopiedLinkId(c.id);
        setTimeout(() => setCopiedLinkId(""), 1500);
      })
      .catch(() => {});
  }

  // Download the QR as a PNG (rasterised from the rendered SVG).
  function downloadQr(c) {
    const url = joinUrl(c);
    if (!url) return;
    const svg = document.getElementById(`qr-${c.id}`);
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const size = 512;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `adlm-share-${c.codePlain || c.id}.png`;
      a.click();
    };
    img.src =
      "data:image/svg+xml;base64," +
      window.btoa(unescape(encodeURIComponent(xml)));
  }

  const inputCls =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-adlm-blue-600 dark:border-adlm-dark-border dark:bg-adlm-dark-panel dark:text-adlm-dark-text";

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 my-8 w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-adlm-dark-border dark:bg-adlm-dark-bg">
        {/* Header */}
        <div className="flex items-center justify-between bg-gradient-to-r from-adlm-blue-700 to-adlm-blue-600 px-5 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <FaUserFriends />
            <div>
              <div className="text-sm font-bold">Share with collaborators</div>
              <div className="text-[11px] text-blue-100">
                They must own the matching plugin to open it.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/80 transition hover:bg-white/15 hover:text-white"
            aria-label="Close"
          >
            <FaTimes />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto p-5">
          {err ? (
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300">
              {err}
            </div>
          ) : null}

          {/* Generate a code */}
          <section className="rounded-xl border border-slate-200 p-4 dark:border-adlm-dark-border">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-adlm-dark-text">
              <FaKey className="text-adlm-blue-700" /> Generate a share code
            </div>

            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Access level
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setLevel("view")}
                    className={[
                      "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition",
                      level === "view"
                        ? "border-adlm-blue-600 bg-blue-50 text-adlm-blue-700 dark:bg-adlm-blue-600/10"
                        : "border-slate-200 text-slate-600 dark:border-adlm-dark-border dark:text-adlm-dark-muted",
                    ].join(" ")}
                  >
                    <FaEye /> View only
                  </button>
                  <button
                    type="button"
                    onClick={() => setLevel("full")}
                    className={[
                      "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition",
                      level === "full"
                        ? "border-adlm-blue-600 bg-blue-50 text-adlm-blue-700 dark:bg-adlm-blue-600/10"
                        : "border-slate-200 text-slate-600 dark:border-adlm-dark-border dark:text-adlm-dark-muted",
                    ].join(" ")}
                  >
                    <FaPen /> Full access
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Label (optional)
                </label>
                <input
                  className={inputCls}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. QS firm"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Restrict to emails (optional)
                </label>
                <input
                  className={inputCls}
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  placeholder="comma-separated"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Max uses (0 = unlimited)
                </label>
                <input
                  className={inputCls}
                  type="number"
                  min="0"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={createCode}
              disabled={creating}
              className="btn-3d inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              <FaKey className="text-[12px]" />
              {creating ? "Generating…" : "Generate code"}
            </button>
          </section>

          {/* Active codes */}
          <section>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Active codes
            </div>
            {codes.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400 dark:border-adlm-dark-border">
                No active codes. Generate one above to invite a colleague.
              </div>
            ) : (
              <ul className="space-y-2">
                {codes.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-lg border border-slate-200 px-3 py-2 dark:border-adlm-dark-border"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-sm font-semibold tracking-wider text-slate-800 dark:bg-white/10 dark:text-adlm-dark-text">
                            {c.codePlain || `····${c.codeLast4}`}
                          </code>
                          <span
                            className={[
                              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                              c.accessLevel === "full"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-100 text-slate-600",
                            ].join(" ")}
                          >
                            {c.accessLevel === "full" ? "Full" : "View"}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-slate-400">
                          {c.label ? c.label + " · " : ""}
                          {c.maxUses
                            ? `${c.uses}/${c.maxUses} uses`
                            : `${c.uses} uses`}
                          {c.allowedEmails?.length
                            ? ` · ${c.allowedEmails.length} email(s)`
                            : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => copyCode(c)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-adlm-blue-700 hover:bg-blue-50"
                        >
                          {copiedId === c.id ? (
                            <>
                              <FaCheck /> Copied
                            </>
                          ) : (
                            <>
                              <FaCopy /> Copy
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setQrFor((prev) => (prev === c.id ? "" : c.id))
                          }
                          className={[
                            "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium hover:bg-blue-50",
                            qrFor === c.id
                              ? "bg-blue-50 text-adlm-blue-700"
                              : "text-adlm-blue-700",
                          ].join(" ")}
                          title="Share link & QR code"
                        >
                          <FaQrcode /> Link & QR
                        </button>
                        <button
                          type="button"
                          onClick={() => revoke(c.id)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-50"
                        >
                          <FaTrash /> Revoke
                        </button>
                      </div>
                    </div>

                    {qrFor === c.id && joinUrl(c) ? (
                      <div className="mt-3 flex flex-col items-center gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-start dark:border-white/10">
                        <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
                          <QRCodeSVG
                            id={`qr-${c.id}`}
                            value={joinUrl(c)}
                            size={132}
                            level="M"
                          />
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                            Share link
                          </div>
                          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 dark:border-adlm-dark-border dark:bg-white/5">
                            <FaLink className="shrink-0 text-slate-400" />
                            <input
                              readOnly
                              value={joinUrl(c)}
                              className="min-w-0 flex-1 truncate bg-transparent text-xs text-slate-600 outline-none dark:text-adlm-dark-muted"
                            />
                            <button
                              type="button"
                              onClick={() => copyLink(c)}
                              className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs font-medium text-adlm-blue-700 hover:bg-blue-100"
                            >
                              {copiedLinkId === c.id ? (
                                <>
                                  <FaCheck /> Copied
                                </>
                              ) : (
                                <>
                                  <FaCopy /> Copy
                                </>
                              )}
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => downloadQr(c)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-adlm-dark-border dark:text-adlm-dark-text"
                          >
                            <FaQrcode /> Download QR
                          </button>
                          <p className="text-[10px] text-slate-400">
                            Anyone who opens this link can join — still subject to
                            this code's access level, email and use limits.
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Collaborators */}
          <section>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              People with access
            </div>
            {loading ? (
              <div className="px-3 py-4 text-center text-xs text-slate-400">
                Loading…
              </div>
            ) : collaborators.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400 dark:border-adlm-dark-border">
                No one has joined yet.
              </div>
            ) : (
              <ul className="space-y-2">
                {collaborators.map((p) => (
                  <li
                    key={p.userId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-adlm-dark-border"
                  >
                    <div className="min-w-0 truncate text-sm text-slate-700 dark:text-adlm-dark-text">
                      {p.email || p.userId}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={p.accessLevel}
                        onChange={(e) => changeLevel(p.userId, e.target.value)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 dark:border-adlm-dark-border dark:bg-adlm-dark-panel dark:text-adlm-dark-text"
                      >
                        <option value="view">View only</option>
                        <option value="full">Full access</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => removePerson(p.userId)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-50"
                      >
                        <FaTrash /> Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-[11px] text-slate-400">
            View-only collaborators can't download or edit. Rates stay hidden
            unless the collaborator has an active RateGen subscription.
          </p>
        </div>
      </div>
    </div>
  );
}
