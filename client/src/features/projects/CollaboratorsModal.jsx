import React from "react";
import { FaCheck, FaCopy, FaEye, FaLink, FaPen, FaQrcode, FaTrash } from "../../components/icons.jsx";
import { QRCodeSVG } from "qrcode.react";
import { apiAuthed } from "../../http.js";
import WkModal from "../../ds/WkModal.jsx";

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

  // Escape and backdrop clicks are handled by WkModal; this keeps the page
  // behind from scrolling while it is open.
  React.useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

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

  // His palettes and a few layout pieces for the modal body.
  const palChip = (pal) => ({
    background: `var(--pal-${pal}-wash)`,
    color: `var(--pal-${pal}-key)`,
    borderColor: `var(--pal-${pal}-line)`,
  });
  const WARN_TEXT = { color: "var(--pal-orange-key)" };
  const GROUP = { padding: 0, margin: "0 0 10px" };
  const CODE = {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 14,
    fontWeight: 500,
    letterSpacing: ".08em",
    color: "var(--ink)",
    background: "var(--bg-alt)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    padding: "2px 8px",
  };

  return (
    <WkModal
      open={open}
      title="Share with collaborators"
      sub="They must own the matching plugin to open it."
      onClose={onClose}
    >
      <div style={{ display: "grid", gap: 22, gridTemplateColumns: "minmax(0, 1fr)", textAlign: "left" }}>
        {err ? (
          <p
            className="mk-note"
            role="alert"
            style={{ margin: 0, ...palChip("orange") }}
          >
            {err}
          </p>
        ) : null}

        {/* Generate a code */}
        <section>
          <p className="wk-grp" style={GROUP}>Generate a share code</p>
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <span style={{ display: "block", fontSize: 12.5, color: "var(--ink-2)", marginBottom: 7 }}>
                Access level
              </span>
              <div className="wk-loc-sw" role="tablist" aria-label="Access level">
                <button
                  type="button"
                  role="tab"
                  aria-selected={level === "view"}
                  onClick={() => setLevel("view")}
                  className={level === "view" ? "on" : ""}
                >
                  <FaEye size={13} style={{ marginRight: 6, verticalAlign: "-2px" }} />
                  View only
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={level === "full"}
                  onClick={() => setLevel("full")}
                  className={level === "full" ? "on" : ""}
                >
                  <FaPen size={13} style={{ marginRight: 6, verticalAlign: "-2px" }} />
                  Full access
                </button>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <label className="wk-f" style={{ flex: "1 1 180px", minWidth: 0 }}>
                <span>Label (optional)</span>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. QS firm"
                />
              </label>
              <label className="wk-f" style={{ flex: "1 1 180px", minWidth: 0 }}>
                <span>Restrict to emails (optional)</span>
                <input
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  placeholder="comma-separated"
                />
              </label>
              <label className="wk-f" style={{ flex: "1 1 180px", minWidth: 0 }}>
                <span>Max uses (0 = unlimited)</span>
                <input
                  type="number"
                  min="0"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  placeholder="0"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={createCode}
              disabled={creating}
              className="wk-modal-go"
              style={{ marginTop: 0, opacity: creating ? 0.6 : 1 }}
            >
              {creating ? "Generating…" : "Generate code"}
            </button>
          </div>
        </section>

        {/* Active codes */}
        <section>
          <p className="wk-grp" style={GROUP}>Active codes</p>
          {codes.length === 0 ? (
            <div className="wk-panel wk-empty" style={{ marginBottom: 0, padding: "22px 18px" }}>
              No active codes. Generate one above to invite a colleague.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {codes.map((c) => (
                <div key={c.id} className="wk-panel" style={{ marginBottom: 0, padding: "12px 14px" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <code style={CODE}>{c.codePlain || `····${c.codeLast4}`}</code>
                        <span
                          className="wk-src sm"
                          style={c.accessLevel === "full" ? palChip("light") : undefined}
                        >
                          {c.accessLevel === "full" ? "Full" : "View"}
                        </span>
                      </div>
                      <div
                        className="wk-locnote"
                        style={{ marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {c.label ? c.label + " · " : ""}
                        {c.maxUses
                          ? `${c.uses}/${c.maxUses} uses`
                          : `${c.uses} uses`}
                        {c.allowedEmails?.length
                          ? ` · ${c.allowedEmails.length} email(s)`
                          : ""}
                      </div>
                    </div>
                    <div className="wk-acts">
                      <button
                        type="button"
                        onClick={() => copyCode(c)}
                        className="ds-btn ds-btn-sm btn-o"
                      >
                        {copiedId === c.id ? (
                          <>
                            <FaCheck size={13} /> Copied
                          </>
                        ) : (
                          <>
                            <FaCopy size={13} /> Copy
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setQrFor((prev) => (prev === c.id ? "" : c.id))
                        }
                        className="ds-btn ds-btn-sm btn-o"
                        style={qrFor === c.id ? palChip("light") : undefined}
                        aria-expanded={qrFor === c.id}
                        title="Share link & QR code"
                      >
                        <FaQrcode size={13} /> Link &amp; QR
                      </button>
                      <button
                        type="button"
                        onClick={() => revoke(c.id)}
                        className="ds-btn ds-btn-sm btn-o"
                        style={WARN_TEXT}
                      >
                        <FaTrash size={13} /> Revoke
                      </button>
                    </div>
                  </div>

                  {qrFor === c.id && joinUrl(c) ? (
                    <div
                      style={{
                        marginTop: 12,
                        paddingTop: 12,
                        borderTop: "1px solid var(--line)",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 14,
                        alignItems: "flex-start",
                      }}
                    >
                      {/* The QR stays on white so every phone can scan it. */}
                      <div style={{ background: "#ffffff", padding: 8, borderRadius: 12, border: "1px solid var(--line)" }}>
                        <QRCodeSVG
                          id={`qr-${c.id}`}
                          value={joinUrl(c)}
                          size={132}
                          level="M"
                        />
                      </div>
                      <div style={{ flex: "1 1 220px", minWidth: 0, display: "grid", gap: 10 }}>
                        <label className="wk-f">
                          <span>Share link</span>
                          <input readOnly value={joinUrl(c)} onFocus={(e) => e.target.select()} />
                        </label>
                        <div className="wk-acts">
                          <button
                            type="button"
                            onClick={() => copyLink(c)}
                            className="ds-btn ds-btn-sm btn-o"
                          >
                            {copiedLinkId === c.id ? (
                              <>
                                <FaCheck size={13} /> Copied
                              </>
                            ) : (
                              <>
                                <FaLink size={13} /> Copy link
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadQr(c)}
                            className="ds-btn ds-btn-sm btn-o"
                          >
                            <FaQrcode size={13} /> Download QR
                          </button>
                        </div>
                        <p className="wk-locnote" style={{ margin: 0 }}>
                          Anyone who opens this link can join, still subject to
                          this code's access level, email and use limits.
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Collaborators */}
        <section>
          <p className="wk-grp" style={GROUP}>People with access</p>
          {loading ? (
            <div className="wk-panel wk-empty" style={{ marginBottom: 0, padding: "22px 18px" }}>
              Loading…
            </div>
          ) : collaborators.length === 0 ? (
            <div className="wk-panel wk-empty" style={{ marginBottom: 0, padding: "22px 18px" }}>
              No one has joined yet.
            </div>
          ) : (
            <div className="wk-panel" style={{ marginBottom: 0 }}>
              <div className="wk-use" style={{ padding: "2px 16px" }}>
                {collaborators.map((p) => (
                  <div
                    key={p.userId}
                    className="wk-useline"
                    style={{ gridTemplateColumns: "minmax(0, 1fr) auto auto", alignItems: "center" }}
                  >
                    <span
                      className="p"
                      style={{ gridColumn: 1, gridRow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {p.email || p.userId}
                    </span>
                    <label className="wk-f" style={{ gridColumn: 2, gridRow: 1, margin: 0 }}>
                      <select
                        value={p.accessLevel}
                        onChange={(e) => changeLevel(p.userId, e.target.value)}
                        aria-label={`Access for ${p.email || p.userId}`}
                        style={{ padding: "7px 10px", fontSize: 13 }}
                      >
                        <option value="view">View only</option>
                        <option value="full">Full access</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => removePerson(p.userId)}
                      className="ds-btn ds-btn-sm btn-o"
                      style={{ gridColumn: 3, gridRow: 1, ...WARN_TEXT }}
                    >
                      <FaTrash size={13} /> Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <p className="wk-locnote" style={{ margin: 0 }}>
          View-only collaborators can't download or edit. Rates stay hidden
          unless the collaborator has an active RateGen subscription.
        </p>
      </div>
    </WkModal>
  );
}
