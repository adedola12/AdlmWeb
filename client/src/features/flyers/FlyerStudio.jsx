// FlyerStudio — orchestrator for the ADLM Flyer Engine.
// Supports two output formats via a toolbar toggle:
//   Portrait  1080×1350  (Instagram flyer)
//   Thumbnail 1280×720   (YouTube thumbnail)
import React, { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { jsPDF } from "jspdf";
import JSZip from "jszip";

import { apiAuthed } from "../../http.js";
import FlyerCanvas from "./templates/FlyerCanvas.jsx";
import FlyerForm from "./components/FlyerForm.jsx";
import ExportControls from "./components/ExportControls.jsx";
import SavedFlyersList from "./components/SavedFlyersList.jsx";
import { defaultFlyer, normalizeFlyer, TEMPLATES, templatesForFormat } from "./lib/defaults.js";
import { getFormat, FORMATS } from "./lib/formats.js";
import { useFlyerStore } from "./lib/useFlyerStore.js";
import { captureCanvas, canvasToBlob, downloadDataUrl } from "./lib/exportCanvas.js";

const PREVIEW_W = 392; // preview panel display width (always 392px)

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 90)));

export default function FlyerStudio({ accessToken }) {
  const exportRef = useRef(null);
  const [flyer, setFlyer] = useState(() => defaultFlyer("announcement"));
  const [packVariant, setPackVariant] = useState(null);
  const [showSaved, setShowSaved] = useState(false);
  const [busy, setBusy] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const { flyers, deleteFlyer, saveFlyer } = useFlyerStore(accessToken);

  // Derived format
  const fmt = getFormat(flyer.format || "portrait");
  const SCALE = PREVIEW_W / fmt.w;
  const PREVIEW_H = Math.round(fmt.h * SCALE);

  const templateLabel = TEMPLATES.find((t) => t.value === flyer.template)?.label || flyer.template;

  function fileBase() {
    const slug = (flyer.title || "flyer").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "flyer";
    return `ADLM_${flyer.template}_${slug}`;
  }

  // Switch format: keep shared fields, pick the first template in the new format
  function switchFormat(fmtId) {
    if (fmtId === flyer.format) return;
    const first = templatesForFormat(fmtId)[0]?.value || "announcement";
    const next = defaultFlyer(first);
    // carry over shared content so the admin doesn't lose their work
    setFlyer({ ...next, title: flyer.title, subtitle: flyer.subtitle, badge: flyer.badge, accent: flyer.accent, contact: flyer.contact, website: flyer.website, partnerLogo: flyer.partnerLogo });
    setMsg("");
  }

  async function uploadThumbnail(blob) {
    try {
      const fd = new FormData();
      fd.append("file", new File([blob], "thumb.png", { type: "image/png" }));
      fd.append("resourceType", "image");
      fd.append("folder", "adlm/flyers");
      const res = await apiAuthed("/admin/media/upload-file", { token: accessToken, method: "POST", body: fd });
      return res?.secure_url || res?.url || "";
    } catch { return ""; }
  }

  async function handlePNG() {
    setBusy("png"); setMsg("");
    try {
      const canvas = await captureCanvas(exportRef.current);
      downloadDataUrl(canvas.toDataURL("image/png"), `${fileBase()}.png`);
    } catch (e) { setMsg(`Export failed: ${e.message}`); }
    finally { setBusy(null); }
  }

  async function handlePDF() {
    setBusy("pdf"); setMsg("");
    try {
      const canvas = await captureCanvas(exportRef.current);
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: fmt.w > fmt.h ? "landscape" : "portrait", unit: "px", format: [fmt.w, fmt.h] });
      pdf.addImage(img, "PNG", 0, 0, fmt.w, fmt.h);
      pdf.save(`${fileBase()}.pdf`);
    } catch (e) { setMsg(`Export failed: ${e.message}`); }
    finally { setBusy(null); }
  }

  async function handlePack() {
    setBusy("pack"); setMsg("");
    const zip = new JSZip();
    const formatTemplates = templatesForFormat(flyer.format || "portrait");
    let failed = null;
    try {
      for (const t of formatTemplates) {
        flushSync(() => setPackVariant(t.value));
        await nextFrame();
        const canvas = await captureCanvas(exportRef.current);
        const blob = await canvasToBlob(canvas);
        zip.file(`ADLM_${t.value}.png`, blob);
      }
    } catch (e) { failed = e; }
    finally { flushSync(() => setPackVariant(null)); }
    if (failed) { setMsg(`Pack failed: ${failed.message}`); setBusy(null); return; }
    try {
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      downloadDataUrl(url, `${fileBase()}_pack.zip`);
      URL.revokeObjectURL(url);
    } catch (e) { setMsg(`Pack failed: ${e.message}`); }
    finally { setBusy(null); }
  }

  async function handleSaveLibrary() {
    setSaving(true); setMsg("");
    try {
      let thumbnailUrl = "";
      try {
        const canvas = await captureCanvas(exportRef.current);
        thumbnailUrl = await uploadThumbnail(await canvasToBlob(canvas));
      } catch { /* best-effort */ }
      const item = await saveFlyer({ id: flyer.id, title: (flyer.title || "Untitled").trim(), template: flyer.template, data: flyer, thumbnailUrl });
      if (item?._id) setFlyer((f) => ({ ...f, id: item._id }));
      setMsg("Saved to library.");
    } catch (e) { setMsg(e?.message || "Save failed"); }
    finally { setSaving(false); }
  }

  function handleLoad(doc) {
    const f = normalizeFlyer(doc.data || {});
    f.id = doc._id;
    f.title = doc.title || f.title;
    f.template = doc.template || f.template;
    setFlyer(f);
    setShowSaved(false);
    setMsg("");
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this flyer from the library?")) return;
    try {
      await deleteFlyer(id);
      if (flyer.id === id) setFlyer((f) => ({ ...f, id: null }));
    } catch (e) { setMsg(e?.message || "Delete failed"); }
  }

  function handleNew() { setFlyer(defaultFlyer(flyer.template)); setMsg(""); }

  const exportFlyer = packVariant ? { ...flyer, template: packVariant } : flyer;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"calc(100vh - 170px)", minHeight:620, border:"1.5px solid #DDE3F0", borderRadius:14, overflow:"hidden", background:"#fff", fontFamily:"'Lexend',sans-serif" }}>
      {/* Toolbar */}
      <div style={{ height:52, flexShrink:0, background:"#05111f", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 18px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:14, fontWeight:700, color:"#fff", letterSpacing:"0.02em" }}>ADLM Studio</span>
          <span style={{ width:1, height:18, background:"rgba(255,255,255,.2)" }} />

          {/* Format toggle */}
          <div style={{ display:"flex", gap:2, background:"rgba(255,255,255,.1)", borderRadius:6, padding:2 }}>
            {FORMATS.map((f) => (
              <button key={f.id} type="button" onClick={() => switchFormat(f.id)}
                style={{ padding:"4px 12px", borderRadius:5, border:"none", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"'Lexend',sans-serif", background: flyer.format === f.id ? "#fff" : "transparent", color: flyer.format === f.id ? "#05111f" : "rgba(255,255,255,.7)", transition:"all .15s" }}>
                {f.label}
              </button>
            ))}
          </div>

          <span style={{ width:1, height:18, background:"rgba(255,255,255,.2)" }} />
          <span style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,.6)", letterSpacing:"0.1em", textTransform:"uppercase" }}>
            {templateLabel} · {fmt.sub}
          </span>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={handleNew} style={toolBtn(false)}>+ New</button>
          <button onClick={() => setShowSaved((v) => !v)} style={toolBtn(true)}>Saved ({flyers.length})</button>
        </div>
      </div>

      {/* Body */}
      <div style={{ display:"flex", flex:1, minHeight:0 }}>
        {/* Form */}
        <div style={{ width:404, flexShrink:0, overflowY:"auto", background:"#fff", borderRight:"1.5px solid #DDE3F0", padding:"18px 18px 40px" }}>
          <FlyerForm flyer={flyer} onChange={setFlyer} accessToken={accessToken} />
        </div>

        {/* Preview */}
        <div style={{ flex:1, overflowY:"auto", background:"#ECEEF5", display:"flex", flexDirection:"column", alignItems:"center", padding:"24px 24px 40px", gap:18 }}>
          <span style={{ fontSize:10, fontWeight:700, color:"#5A6485", letterSpacing:"0.12em", textTransform:"uppercase" }}>
            Live preview · {templateLabel} · {fmt.w} × {fmt.h}
          </span>

          <div style={{ width:PREVIEW_W, height:PREVIEW_H, position:"relative", flexShrink:0, borderRadius:10, boxShadow:"0 8px 32px rgba(5,17,31,.18)", overflow:"hidden" }}>
            <div style={{ position:"absolute", top:0, left:0, transform:`scale(${SCALE})`, transformOrigin:"top left", width:fmt.w, height:fmt.h }}>
              <FlyerCanvas flyer={flyer} />
            </div>
          </div>

          <ExportControls onPNG={handlePNG} onPDF={handlePDF} onPack={handlePack} onSave={handleSaveLibrary} busy={busy} saving={saving} isSaved={!!flyer.id} />
          {msg && <p style={{ fontSize:12, color:"#1a1a2e", margin:0 }}>{msg}</p>}
          <p style={{ fontSize:11, color:"#8892B0", textAlign:"center", margin:0, maxWidth:360 }}>
            Edit the form to update the preview live.{" "}
            <strong>Save to library</strong> stores the {fmt.id === "thumbnail" ? "thumbnail" : "flyer"} on the server.
          </p>
        </div>
      </div>

      {/* Offscreen native-size export node */}
      <div aria-hidden="true" style={{ position:"fixed", top:0, left:-99999, width:fmt.w, height:fmt.h, pointerEvents:"none", zIndex:-1 }}>
        <FlyerCanvas ref={exportRef} flyer={exportFlyer} />
      </div>

      {/* Saved flyers drawer */}
      {showSaved && (
        <>
          <div style={{ position:"fixed", inset:0, background:"rgba(5,17,31,.18)", zIndex:99 }} onClick={() => setShowSaved(false)} />
          <SavedFlyersList flyers={flyers} currentId={flyer.id} onLoad={handleLoad} onDelete={handleDelete} onClose={() => setShowSaved(false)} />
        </>
      )}
    </div>
  );
}

function toolBtn(solid) {
  return { padding:"6px 14px", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"'Lexend',sans-serif", background:solid?"#E86A27":"rgba(255,255,255,.1)", color:solid?"#fff":"rgba(255,255,255,.9)", border:solid?"none":"1px solid rgba(255,255,255,.2)" };
}
