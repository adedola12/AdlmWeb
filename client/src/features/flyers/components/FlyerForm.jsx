// The admin-facing flyer form. Light-themed (it lives in the white admin page),
// self-contained inline styles (ported & re-skinned from the NIQS AdminForm).
// It edits the single `flyer` object (see lib/defaults.js) and calls
// onChange(nextFlyer) on every change. Images upload through the existing
// /admin/media/upload-file route (Cloudinary) and we store the returned URL.
import React, { useRef, useState } from "react";
import { apiAuthed } from "../../../http.js";
import { TEMPLATES, PLATFORM_OPTIONS, defaultFlyer } from "../lib/defaults.js";
import { ORANGE } from "../lib/brand.js";
import BackgroundPicker from "./BackgroundPicker.jsx";

const NAVY = "#05111f";

/* ── upload helper ───────────────────────────────────────────────────────── */
async function uploadImage(file, accessToken) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("resourceType", "image");
  const res = await apiAuthed("/admin/media/upload-file", {
    token: accessToken,
    method: "POST",
    body: fd,
  });
  return res?.secure_url || res?.url || "";
}

/* ── primitives ──────────────────────────────────────────────────────────── */
const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  border: "1.5px solid #DDE3F0",
  borderRadius: 6,
  fontSize: 13,
  fontFamily: "'Lexend', sans-serif",
  color: "#1a1a2e",
  background: "#fff",
  outline: "none",
  boxSizing: "border-box",
};
const labelStyle = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "#374151",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  marginBottom: 5,
};

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label style={labelStyle}>{label}</label>}
      {hint && <p style={{ fontSize: 10.5, color: "#5A6485", margin: "-3px 0 6px" }}>{hint}</p>}
      {children}
    </div>
  );
}
function Input({ value, onChange, ...props }) {
  return <input style={inputStyle} value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...props} />;
}
function Textarea({ value, onChange, ...props }) {
  return (
    <textarea
      style={{ ...inputStyle, minHeight: 70, resize: "vertical", lineHeight: 1.5 }}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      {...props}
    />
  );
}
function Select({ value, onChange, options, ...props }) {
  return (
    <select style={{ ...inputStyle, cursor: "pointer" }} value={value} onChange={(e) => onChange(e.target.value)} {...props}>
      {options.map((o) => (
        <option key={o.value ?? o} value={o.value ?? o}>
          {o.label ?? o}
        </option>
      ))}
    </select>
  );
}
function Row({ children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${React.Children.count(children)}, 1fr)`, gap: 10 }}>
      {children}
    </div>
  );
}
function Toggle({ on, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        border: "none",
        background: on ? NAVY : "#CBD2E0",
        position: "relative",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.15s",
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}
function ToggleRow({ label, on, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
      <span style={{ fontSize: 12.5, color: "#1a1a2e", fontWeight: 500 }}>{label}</span>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}
function SectionHeader({ title, open, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "9px 0",
        background: "none",
        border: "none",
        borderBottom: "1.5px solid #DDE3F0",
        cursor: "pointer",
        marginBottom: open ? 14 : 0,
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, color: NAVY, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {title}
      </span>
      <span style={{ fontSize: 13, color: "#5A6485", transform: open ? "rotate(180deg)" : "none" }}>▾</span>
    </button>
  );
}

/* ── image upload control ────────────────────────────────────────────────── */
function ImageUpload({ value, onChange, accessToken, small = false }) {
  const fileRef = useRef();
  const [busy, setBusy] = useState(false);
  async function handle(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setBusy(true);
    // instant local preview (data-URL); replaced by the hosted URL on success
    const reader = new FileReader();
    reader.onload = (ev) => onChange(ev.target.result);
    reader.readAsDataURL(file);
    try {
      const url = await uploadImage(file, accessToken);
      if (url) onChange(url);
    } catch {
      /* keep the data-URL fallback so preview/export still work */
    } finally {
      setBusy(false);
    }
  }
  const dim = small ? 52 : 72;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <button
        type="button"
        onClick={() => fileRef.current.click()}
        style={{
          width: dim,
          height: dim,
          borderRadius: 8,
          flexShrink: 0,
          border: "1.5px dashed #DDE3F0",
          background: "#F6F7FB",
          cursor: "pointer",
          overflow: "hidden",
          padding: 0,
        }}
      >
        {value ? (
          <img src={value} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontSize: 10, color: "#5A6485" }}>{busy ? "…" : "Upload"}</span>
        )}
      </button>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handle} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <button
          type="button"
          onClick={() => fileRef.current.click()}
          style={{ ...miniBtn, opacity: busy ? 0.6 : 1 }}
          disabled={busy}
        >
          {busy ? "Uploading…" : value ? "Replace" : "Upload image"}
        </button>
        {value && (
          <button type="button" onClick={() => onChange(null)} style={{ ...miniBtn, color: "#C9302C", borderColor: "#C9302C" }}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

const miniBtn = {
  fontSize: 11,
  fontWeight: 600,
  color: NAVY,
  background: "none",
  border: `1px solid ${NAVY}`,
  borderRadius: 5,
  padding: "4px 10px",
  cursor: "pointer",
  fontFamily: "'Lexend', sans-serif",
};

/* ── speaker editor ──────────────────────────────────────────────────────── */
function SpeakerRow({ speaker, index, onChange, onRemove, accessToken }) {
  function update(key, val) {
    onChange({ ...speaker, [key]: val });
  }
  return (
    <div style={{ border: "1.5px solid #DDE3F0", borderRadius: 8, padding: 12, marginBottom: 10, background: "#FAFBFF" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>SPEAKER {index + 1}</span>
        <button type="button" onClick={onRemove} style={{ fontSize: 11, color: "#C9302C", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
          Remove
        </button>
      </div>
      <div style={{ marginBottom: 10 }}>
        <ImageUpload value={speaker.photo} onChange={(v) => update("photo", v)} accessToken={accessToken} small />
      </div>
      <Field>
        <Input placeholder="Full name (e.g. QS Dr Jane Doe)" value={speaker.name} onChange={(v) => update("name", v)} />
      </Field>
      <Row>
        <Input placeholder="Role (e.g. Keynote)" value={speaker.role} onChange={(v) => update("role", v)} />
        <Input placeholder="Topic" value={speaker.topic} onChange={(v) => update("topic", v)} maxLength={80} />
      </Row>
    </div>
  );
}

/* ── main form ───────────────────────────────────────────────────────────── */
export default function FlyerForm({ flyer, onChange, accessToken }) {
  const [open, setOpen] = useState({
    content: true,
    look: true,
    template: true,
    branding: false,
    footer: false,
    sections: false,
  });
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const set = (key, val) => onChange({ ...flyer, [key]: val });

  function switchTemplate(t) {
    if (t === flyer.template) return;
    // Keep the admin's shared content; only swap template-specific presets that
    // are still empty so we don't clobber their work.
    const preset = defaultFlyer(t);
    const merged = { ...flyer, template: t };
    if (t === "countdown" && !flyer.launchDate) merged.launchDate = preset.launchDate;
    if (t === "event" && (!flyer.speakers || flyer.speakers.length === 0)) merged.speakers = preset.speakers;
    onChange(merged);
  }

  const titleWords = (flyer.title || "").split(" ");
  const enquiries = flyer.enquiries || [""];

  function setEnquiry(i, val) {
    const next = [...enquiries];
    next[i] = val;
    set("enquiries", next);
  }
  function addSpeaker() {
    if ((flyer.speakers || []).length >= 4) return;
    set("speakers", [...(flyer.speakers || []), { id: `s${Date.now()}`, name: "", role: "", topic: "", photo: null }]);
  }
  function setSpeaker(i, updated) {
    set("speakers", flyer.speakers.map((s, idx) => (idx === i ? updated : s)));
  }

  const isEvent = flyer.template === "event";
  const isCountdown = flyer.template === "countdown";
  const isLaunch = flyer.template === "launch";

  return (
    <div style={{ fontFamily: "'Lexend', sans-serif" }}>
      {/* Template switcher */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 3,
          background: "#ECEEF5",
          borderRadius: 8,
          padding: 3,
          marginBottom: 18,
        }}
      >
        {TEMPLATES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => switchTemplate(t.value)}
            title={t.hint}
            style={{
              padding: "8px 2px",
              borderRadius: 6,
              border: "none",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "'Lexend', sans-serif",
              background: flyer.template === t.value ? NAVY : "transparent",
              color: flyer.template === t.value ? "#fff" : "#5A6485",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ marginBottom: 18 }}>
        <SectionHeader title="Content" open={open.content} onToggle={() => toggle("content")} />
        {open.content && (
          <>
            <Field label="Headline" hint="One word renders in the accent colour.">
              <Input value={flyer.title} onChange={(v) => set("title", v)} placeholder="Flyer headline" maxLength={80} />
            </Field>
            <Field label="Accent word">
              <Select
                value={flyer.highlightWordIndex}
                onChange={(v) => set("highlightWordIndex", Number(v))}
                options={titleWords.map((w, i) => ({ value: i, label: `${i + 1}. "${w}"` }))}
              />
            </Field>
            <Field label="Subtitle" hint="Optional">
              <Textarea value={flyer.subtitle} onChange={(v) => set("subtitle", v)} placeholder="Supporting line" maxLength={160} />
            </Field>
            <Row>
              <Field label="Badge text">
                <Input value={flyer.badge} onChange={(v) => set("badge", v)} placeholder="e.g. BIM COURSE" maxLength={28} />
              </Field>
              <Field label="Show badge">
                <Toggle on={flyer.showBadge} onChange={(v) => set("showBadge", v)} />
              </Field>
            </Row>

            {/* Template-specific */}
            {isCountdown && (
              <Row>
                <Field label="Launch date" hint="Drives the day count">
                  <Input type="date" value={flyer.launchDate} onChange={(v) => set("launchDate", v)} />
                </Field>
                <Field label="Count label">
                  <Input value={flyer.countdownLabel} onChange={(v) => set("countdownLabel", v)} placeholder="days to go" />
                </Field>
              </Row>
            )}
            {isLaunch && (
              <>
                <Field label="Hero / screenshot">
                  <ImageUpload value={flyer.heroImage} onChange={(v) => set("heroImage", v)} accessToken={accessToken} />
                </Field>
                <Field label="Hero frame">
                  <Select
                    value={flyer.heroFrame}
                    onChange={(v) => set("heroFrame", v)}
                    options={[
                      { value: "browser", label: "Browser window" },
                      { value: "laptop", label: "Laptop" },
                      { value: "none", label: "Plain" },
                    ]}
                  />
                </Field>
              </>
            )}
          </>
        )}
      </div>

      {/* Event details */}
      {isEvent && (
        <div style={{ marginBottom: 18 }}>
          <SectionHeader title="Event details" open={open.template} onToggle={() => toggle("template")} />
          {open.template && (
            <>
              <Row>
                <Field label="Category">
                  <Select value={flyer.eventCategory} onChange={(v) => set("eventCategory", v)} options={["Training", "Webinar"]} />
                </Field>
                <Field label="Register URL" hint="Shows a QR">
                  <Input value={flyer.registrationUrl} onChange={(v) => set("registrationUrl", v)} placeholder="adlmstudio.net/trainings" />
                </Field>
              </Row>
              <Row>
                <Field label="Start date">
                  <Input type="date" value={flyer.dateStart} onChange={(v) => set("dateStart", v)} />
                </Field>
                <Field label="End date" hint="Optional">
                  <Input type="date" value={flyer.dateEnd} onChange={(v) => set("dateEnd", v)} />
                </Field>
              </Row>
              <Row>
                <Field label="Time">
                  <Input value={flyer.time} onChange={(v) => set("time", v)} placeholder="9:00 AM daily" />
                </Field>
                <Field label="Zone">
                  <Select value={flyer.timeZone} onChange={(v) => set("timeZone", v)} options={["WAT", "GMT", "UTC", "CAT", "EAT"]} />
                </Field>
              </Row>
              <Field label="Format">
                <Select value={flyer.venueType} onChange={(v) => set("venueType", v)} options={["In-Person", "Virtual", "Hybrid"]} />
              </Field>
              {flyer.venueType !== "Virtual" && (
                <Row>
                  <Field label="Venue">
                    <Input value={flyer.venuePhysical} onChange={(v) => set("venuePhysical", v)} placeholder="Eko Hotel" />
                  </Field>
                  <Field label="City">
                    <Input value={flyer.venueCity} onChange={(v) => set("venueCity", v)} placeholder="Lagos" />
                  </Field>
                </Row>
              )}
              {flyer.venueType !== "In-Person" && (
                <Row>
                  <Field label="Platform">
                    <Select value={flyer.platform} onChange={(v) => set("platform", v)} options={PLATFORM_OPTIONS} />
                  </Field>
                  <Field label="Platform note">
                    <Input value={flyer.platformNote} onChange={(v) => set("platformNote", v)} placeholder="Link via email" />
                  </Field>
                </Row>
              )}
              <label style={labelStyle}>Speakers ({(flyer.speakers || []).length}/4)</label>
              {(flyer.speakers || []).map((s, i) => (
                <SpeakerRow
                  key={s.id || i}
                  speaker={s}
                  index={i}
                  onChange={(u) => setSpeaker(i, u)}
                  onRemove={() => set("speakers", flyer.speakers.filter((_, idx) => idx !== i))}
                  accessToken={accessToken}
                />
              ))}
              {(flyer.speakers || []).length < 4 && (
                <button type="button" onClick={addSpeaker} style={{ ...miniBtn, width: "100%", padding: "8px", borderStyle: "dashed" }}>
                  + Add speaker
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Look */}
      <div style={{ marginBottom: 18 }}>
        <SectionHeader title="Look & background" open={open.look} onToggle={() => toggle("look")} />
        {open.look && (
          <>
            <Row>
              <Field label="Accent colour">
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="color"
                    value={flyer.accent || ORANGE}
                    onChange={(e) => set("accent", e.target.value)}
                    style={{ width: 40, height: 34, border: "1.5px solid #DDE3F0", borderRadius: 6, background: "#fff", cursor: "pointer" }}
                  />
                  <button type="button" onClick={() => set("accent", ORANGE)} style={miniBtn}>
                    ADLM orange
                  </button>
                </div>
              </Field>
              <Field label="Custom background">
                <ImageUpload value={flyer.backgroundImage} onChange={(v) => set("backgroundImage", v)} accessToken={accessToken} small />
              </Field>
            </Row>
            <Field label="Preset background" hint={flyer.backgroundImage ? "Clear the custom image to use a preset" : ""}>
              <BackgroundPicker value={flyer.background} onSelect={(id) => onChange({ ...flyer, background: id, backgroundImage: null })} />
            </Field>
          </>
        )}
      </div>

      {/* Branding */}
      <div style={{ marginBottom: 18 }}>
        <SectionHeader title="Co-branding" open={open.branding} onToggle={() => toggle("branding")} />
        {open.branding && (
          <Field label="Partner logo" hint="Optional — sits beside the ADLM logo">
            <ImageUpload value={flyer.partnerLogo} onChange={(v) => set("partnerLogo", v)} accessToken={accessToken} />
          </Field>
        )}
      </div>

      {/* Footer */}
      <div style={{ marginBottom: 18 }}>
        <SectionHeader title="Footer / contact" open={open.footer} onToggle={() => toggle("footer")} />
        {open.footer && (
          <>
            <Field label="Contact line">
              <Input value={flyer.contact} onChange={(v) => set("contact", v)} placeholder="For more details, contact: …" />
            </Field>
            <Row>
              <Field label="Website">
                <Input value={flyer.website} onChange={(v) => set("website", v)} placeholder="adlmstudio.net" />
              </Field>
              <Field label="Show website">
                <Toggle on={flyer.showWebsite} onChange={(v) => set("showWebsite", v)} />
              </Field>
            </Row>
            {isEvent && (
              <Field label="Enquiries (phone)">
                {enquiries.map((n, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <Input value={n} onChange={(v) => setEnquiry(i, v)} placeholder="Phone number" />
                    {enquiries.length > 1 && (
                      <button
                        type="button"
                        onClick={() => set("enquiries", enquiries.filter((_, idx) => idx !== i))}
                        style={{ background: "none", border: "none", color: "#C9302C", cursor: "pointer", fontSize: 16 }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                {enquiries.length < 4 && (
                  <button type="button" onClick={() => set("enquiries", [...enquiries, ""])} style={miniBtn}>
                    + Add number
                  </button>
                )}
              </Field>
            )}
          </>
        )}
      </div>

      {/* Sections */}
      <div style={{ marginBottom: 18 }}>
        <SectionHeader title="Show / hide" open={open.sections} onToggle={() => toggle("sections")} />
        {open.sections && (
          <div style={{ paddingTop: 2 }}>
            <ToggleRow label="Badge pill" on={flyer.showBadge} onChange={(v) => set("showBadge", v)} />
            <ToggleRow label="Contact bar" on={flyer.showContactBar} onChange={(v) => set("showContactBar", v)} />
            <ToggleRow label="Website in bar" on={flyer.showWebsite} onChange={(v) => set("showWebsite", v)} />
          </div>
        )}
      </div>
    </div>
  );
}
