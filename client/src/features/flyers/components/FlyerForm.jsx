// The admin-facing flyer form. Light-themed, self-contained inline styles.
// Edits the single `flyer` object (see lib/defaults.js) and calls
// onChange(nextFlyer) on every change. The look is driven by a curated Style
// (one click sets theme+background+accent); the rest is just content. Images
// upload through /admin/media/upload-file (Cloudinary) and we store the URL.
import React, { useRef, useState } from "react";
import { apiAuthed } from "../../../http.js";
import { TEMPLATES, PLATFORM_OPTIONS } from "../lib/defaults.js";
import { STYLES, applyStyle } from "../lib/styles.js";

const NAVY = "#05111f";

/* ── upload helper ───────────────────────────────────────────────────────── */
async function uploadImage(file, accessToken) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("resourceType", "image");
  const res = await apiAuthed("/admin/media/upload-file", { token: accessToken, method: "POST", body: fd });
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
const labelStyle = { display: "block", fontSize: 11, fontWeight: 700, color: "#374151", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 5 };

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
  return <textarea style={{ ...inputStyle, minHeight: 64, resize: "vertical", lineHeight: 1.5 }} value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...props} />;
}
function Select({ value, onChange, options, ...props }) {
  return (
    <select style={{ ...inputStyle, cursor: "pointer" }} value={value} onChange={(e) => onChange(e.target.value)} {...props}>
      {options.map((o) => (
        <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
      ))}
    </select>
  );
}
function Row({ children }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(${React.Children.count(children)}, 1fr)`, gap: 10 }}>{children}</div>;
}
function Toggle({ on, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!on)} style={{ width: 36, height: 20, borderRadius: 10, border: "none", background: on ? NAVY : "#CBD2E0", position: "relative", cursor: "pointer", flexShrink: 0 }}>
      <span style={{ position: "absolute", top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
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
    <button type="button" onClick={onToggle} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", background: "none", border: "none", borderBottom: "1.5px solid #DDE3F0", cursor: "pointer", marginBottom: open ? 14 : 0 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: NAVY, letterSpacing: "0.06em", textTransform: "uppercase" }}>{title}</span>
      <span style={{ fontSize: 13, color: "#5A6485", transform: open ? "rotate(180deg)" : "none" }}>▾</span>
    </button>
  );
}

const miniBtn = { fontSize: 11, fontWeight: 600, color: NAVY, background: "none", border: `1px solid ${NAVY}`, borderRadius: 5, padding: "4px 10px", cursor: "pointer", fontFamily: "'Lexend', sans-serif" };

/* ── Style picker (the single look control) ──────────────────────────────── */
function StylePicker({ value, onPick }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
      {STYLES.map((s) => {
        const sel = s.id === value;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s.id)}
            title={s.name}
            style={{ display: "flex", flexDirection: "column", gap: 5, padding: 5, borderRadius: 8, cursor: "pointer", textAlign: "left", border: sel ? "2px solid #05111f" : "1.5px solid #DDE3F0", background: sel ? "#EEF2FB" : "#fff" }}
          >
            <div style={{ height: 46, borderRadius: 6, border: "1px solid #DDE3F0", background: s.swatch }} />
            <span style={{ fontSize: 10.5, fontWeight: 600, color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
          </button>
        );
      })}
    </div>
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
    const reader = new FileReader();
    reader.onload = (ev) => onChange(ev.target.result);
    reader.readAsDataURL(file);
    try {
      const url = await uploadImage(file, accessToken);
      if (url) onChange(url);
    } catch {
      /* keep data-URL fallback */
    } finally {
      setBusy(false);
    }
  }
  const dim = small ? 52 : 72;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <button type="button" onClick={() => fileRef.current.click()} style={{ width: dim, height: dim, borderRadius: 8, flexShrink: 0, border: "1.5px dashed #DDE3F0", background: "#F6F7FB", cursor: "pointer", overflow: "hidden", padding: 0 }}>
        {value ? <img src={value} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 10, color: "#5A6485" }}>{busy ? "…" : "Upload"}</span>}
      </button>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handle} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <button type="button" onClick={() => fileRef.current.click()} style={{ ...miniBtn, opacity: busy ? 0.6 : 1 }} disabled={busy}>
          {busy ? "Uploading…" : value ? "Replace" : "Upload image"}
        </button>
        {value && <button type="button" onClick={() => onChange(null)} style={{ ...miniBtn, color: "#C9302C", borderColor: "#C9302C" }}>Remove</button>}
      </div>
    </div>
  );
}

/* ── speaker editor ──────────────────────────────────────────────────────── */
function SpeakerRow({ speaker, index, onChange, onRemove, accessToken }) {
  const update = (key, val) => onChange({ ...speaker, [key]: val });
  return (
    <div style={{ border: "1.5px solid #DDE3F0", borderRadius: 8, padding: 12, marginBottom: 10, background: "#FAFBFF" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>SPEAKER {index + 1}</span>
        <button type="button" onClick={onRemove} style={{ fontSize: 11, color: "#C9302C", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Remove</button>
      </div>
      <div style={{ marginBottom: 10 }}>
        <ImageUpload value={speaker.photo} onChange={(v) => update("photo", v)} accessToken={accessToken} small />
      </div>
      <Field><Input placeholder="Full name (e.g. QS Dr Jane Doe)" value={speaker.name} onChange={(v) => update("name", v)} /></Field>
      <Row>
        <Input placeholder="Role (e.g. Keynote)" value={speaker.role} onChange={(v) => update("role", v)} />
        <Input placeholder="Topic" value={speaker.topic} onChange={(v) => update("topic", v)} maxLength={80} />
      </Row>
    </div>
  );
}

/* ── main form ───────────────────────────────────────────────────────────── */
export default function FlyerForm({ flyer, onChange, accessToken }) {
  const [open, setOpen] = useState({ style: true, content: true, pricing: true, event: true, branding: false, footer: false, sections: false });
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const set = (key, val) => onChange({ ...flyer, [key]: val });

  function switchTemplate(t) {
    if (t === flyer.template) return;
    onChange({ ...flyer, template: t });
  }

  const titleWords = (flyer.title || "").split(" ");
  const enquiries = flyer.enquiries || [""];
  const tiers = flyer.tiers || [];

  function setTier(i, key, val) {
    set("tiers", tiers.map((t, idx) => (idx === i ? { ...t, [key]: val } : t)));
  }
  function addTier() {
    if (tiers.length >= 3) return;
    set("tiers", [...tiers, { id: `t${Date.now()}`, label: "", price: "", period: "", note: "" }]);
  }
  function addSpeaker() {
    if ((flyer.speakers || []).length >= 4) return;
    set("speakers", [...(flyer.speakers || []), { id: `s${Date.now()}`, name: "", role: "", topic: "", photo: null }]);
  }

  const t = flyer.template;
  const isEvent = t === "event";
  const isCountdown = t === "countdown";
  const isLaunch = t === "launch";
  const isSubscription = t === "subscription";
  const isTicket = t === "ticket";

  return (
    <div style={{ fontFamily: "'Lexend', sans-serif" }}>
      {/* Template switcher */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3, background: "#ECEEF5", borderRadius: 8, padding: 3, marginBottom: 18 }}>
        {TEMPLATES.map((tp) => (
          <button
            key={tp.value}
            type="button"
            onClick={() => switchTemplate(tp.value)}
            title={tp.hint}
            style={{ padding: "8px 2px", borderRadius: 6, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Lexend', sans-serif", background: flyer.template === tp.value ? NAVY : "transparent", color: flyer.template === tp.value ? "#fff" : "#5A6485" }}
          >
            {tp.label}
          </button>
        ))}
      </div>

      {/* Style */}
      <div style={{ marginBottom: 18 }}>
        <SectionHeader title="Style" open={open.style} onToggle={() => toggle("style")} />
        {open.style && (
          <Field hint="One click sets the background, theme and accent.">
            <StylePicker value={flyer.style} onPick={(id) => onChange(applyStyle(flyer, id))} />
          </Field>
        )}
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
              <Select value={flyer.highlightWordIndex} onChange={(v) => set("highlightWordIndex", Number(v))} options={titleWords.map((w, i) => ({ value: i, label: `${i + 1}. "${w}"` }))} />
            </Field>
            {!isSubscription && (
              <Field label="Subtitle" hint="Optional">
                <Textarea value={flyer.subtitle} onChange={(v) => set("subtitle", v)} placeholder="Supporting line" maxLength={180} />
              </Field>
            )}
            <Row>
              <Field label="Badge text"><Input value={flyer.badge} onChange={(v) => set("badge", v)} placeholder="e.g. BIM COURSE" maxLength={28} /></Field>
              <Field label="Show badge"><Toggle on={flyer.showBadge} onChange={(v) => set("showBadge", v)} /></Field>
            </Row>

            {isCountdown && (
              <Row>
                <Field label="Launch date" hint="Drives the day count"><Input type="date" value={flyer.launchDate} onChange={(v) => set("launchDate", v)} /></Field>
                <Field label="Count label"><Input value={flyer.countdownLabel} onChange={(v) => set("countdownLabel", v)} placeholder="days to go" /></Field>
              </Row>
            )}
            {isLaunch && (
              <>
                <Field label="Hero / screenshot"><ImageUpload value={flyer.heroImage} onChange={(v) => set("heroImage", v)} accessToken={accessToken} /></Field>
                <Field label="Hero frame">
                  <Select value={flyer.heroFrame} onChange={(v) => set("heroFrame", v)} options={[{ value: "browser", label: "Browser window" }, { value: "laptop", label: "Laptop" }, { value: "none", label: "Plain" }]} />
                </Field>
              </>
            )}
            {isTicket && (
              <>
                <Field label="Ticket title"><Input value={flyer.ticketTitle} onChange={(v) => set("ticketTitle", v)} placeholder="Course / product on the ticket" /></Field>
                <Field label="Ticket meta"><Input value={flyer.ticketMeta} onChange={(v) => set("ticketMeta", v)} placeholder="e.g. 6-week training · Fri–Sun" /></Field>
                <Row>
                  <Field label="Currency"><Input value={flyer.currency} onChange={(v) => set("currency", v)} placeholder="NGN" /></Field>
                  <Field label="Price"><Input value={flyer.ticketPrice} onChange={(v) => set("ticketPrice", v)} placeholder="90k" /></Field>
                </Row>
                <Field label="CTA line"><Textarea value={flyer.ticketCta} onChange={(v) => set("ticketCta", v)} placeholder="You don't want to miss this…" maxLength={160} /></Field>
              </>
            )}
          </>
        )}
      </div>

      {/* Pricing tiers (subscription) */}
      {isSubscription && (
        <div style={{ marginBottom: 18 }}>
          <SectionHeader title="Pricing packages" open={open.pricing} onToggle={() => toggle("pricing")} />
          {open.pricing && (
            <>
              <Row>
                <Field label="Packages heading"><Input value={flyer.packagesHeading} onChange={(v) => set("packagesHeading", v)} placeholder="Subscription Packages" /></Field>
                <Field label="Currency"><Input value={flyer.currency} onChange={(v) => set("currency", v)} placeholder="NGN" /></Field>
              </Row>
              <Row>
                <Field label="Initial installation" hint="Optional"><Input value={flyer.installation} onChange={(v) => set("installation", v)} placeholder="e.g. NGN 25,000" /></Field>
                <Field label="Tier style">
                  <Select
                    value={flyer.tierStyle || "ribbon"}
                    onChange={(v) => set("tierStyle", v)}
                    options={[
                      { value: "ribbon", label: "Ribbon / pennant" },
                      { value: "stacked", label: "Stacked tiers" },
                      { value: "minimal", label: "Minimal tiles" },
                    ]}
                  />
                </Field>
              </Row>
              <label style={labelStyle}>Tiers ({tiers.length}/3)</label>
              {tiers.map((tier, i) => (
                <div key={tier.id || i} style={{ border: "1.5px solid #DDE3F0", borderRadius: 8, padding: 12, marginBottom: 10, background: "#FAFBFF" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>TIER {i + 1}{i === Math.floor(tiers.length / 2) ? " · featured" : ""}</span>
                    {tiers.length > 1 && <button type="button" onClick={() => set("tiers", tiers.filter((_, idx) => idx !== i))} style={{ fontSize: 11, color: "#C9302C", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Remove</button>}
                  </div>
                  <Row>
                    <Input placeholder="Label (e.g. Monthly)" value={tier.label} onChange={(v) => setTier(i, "label", v)} />
                    <Input placeholder="Price (e.g. 10,000)" value={tier.price} onChange={(v) => setTier(i, "price", v)} />
                  </Row>
                  <div style={{ marginTop: 8 }}>
                    <Row>
                      <Input placeholder="Period (e.g. monthly)" value={tier.period} onChange={(v) => setTier(i, "period", v)} />
                      <Input placeholder="Note (e.g. Save NGN 9,000)" value={tier.note} onChange={(v) => setTier(i, "note", v)} />
                    </Row>
                  </div>
                </div>
              ))}
              {tiers.length < 3 && <button type="button" onClick={addTier} style={{ ...miniBtn, width: "100%", padding: "8px", borderStyle: "dashed" }}>+ Add tier</button>}
            </>
          )}
        </div>
      )}

      {/* Event details */}
      {isEvent && (
        <div style={{ marginBottom: 18 }}>
          <SectionHeader title="Event details" open={open.event} onToggle={() => toggle("event")} />
          {open.event && (
            <>
              <Row>
                <Field label="Category"><Select value={flyer.eventCategory} onChange={(v) => set("eventCategory", v)} options={["Training", "Webinar"]} /></Field>
                <Field label="Register URL" hint="Shows a QR"><Input value={flyer.registrationUrl} onChange={(v) => set("registrationUrl", v)} placeholder="adlmstudio.net/trainings" /></Field>
              </Row>
              <Row>
                <Field label="Start date"><Input type="date" value={flyer.dateStart} onChange={(v) => set("dateStart", v)} /></Field>
                <Field label="End date" hint="Optional"><Input type="date" value={flyer.dateEnd} onChange={(v) => set("dateEnd", v)} /></Field>
              </Row>
              <Row>
                <Field label="Time"><Input value={flyer.time} onChange={(v) => set("time", v)} placeholder="9:00 AM daily" /></Field>
                <Field label="Zone"><Select value={flyer.timeZone} onChange={(v) => set("timeZone", v)} options={["WAT", "GMT", "UTC", "CAT", "EAT"]} /></Field>
              </Row>
              <Field label="Format"><Select value={flyer.venueType} onChange={(v) => set("venueType", v)} options={["In-Person", "Virtual", "Hybrid"]} /></Field>
              {flyer.venueType !== "Virtual" && (
                <Row>
                  <Field label="Venue"><Input value={flyer.venuePhysical} onChange={(v) => set("venuePhysical", v)} placeholder="Eko Hotel" /></Field>
                  <Field label="City"><Input value={flyer.venueCity} onChange={(v) => set("venueCity", v)} placeholder="Lagos" /></Field>
                </Row>
              )}
              {flyer.venueType !== "In-Person" && (
                <Row>
                  <Field label="Platform"><Select value={flyer.platform} onChange={(v) => set("platform", v)} options={PLATFORM_OPTIONS} /></Field>
                  <Field label="Platform note"><Input value={flyer.platformNote} onChange={(v) => set("platformNote", v)} placeholder="Link via email" /></Field>
                </Row>
              )}
              <label style={labelStyle}>Speakers ({(flyer.speakers || []).length}/4)</label>
              {(flyer.speakers || []).map((s, i) => (
                <SpeakerRow key={s.id || i} speaker={s} index={i} onChange={(u) => set("speakers", flyer.speakers.map((sp, idx) => (idx === i ? u : sp)))} onRemove={() => set("speakers", flyer.speakers.filter((_, idx) => idx !== i))} accessToken={accessToken} />
              ))}
              {(flyer.speakers || []).length < 4 && <button type="button" onClick={addSpeaker} style={{ ...miniBtn, width: "100%", padding: "8px", borderStyle: "dashed" }}>+ Add speaker</button>}
            </>
          )}
        </div>
      )}

      {/* Co-branding */}
      <div style={{ marginBottom: 18 }}>
        <SectionHeader title="Co-branding" open={open.branding} onToggle={() => toggle("branding")} />
        {open.branding && (
          <Field label="Partner logo" hint="Optional — sits beside the ADLM logo">
            <ImageUpload value={flyer.partnerLogo} onChange={(v) => set("partnerLogo", v)} accessToken={accessToken} />
          </Field>
        )}
      </div>

      {/* Footer / contact */}
      <div style={{ marginBottom: 18 }}>
        <SectionHeader title="Footer / contact" open={open.footer} onToggle={() => toggle("footer")} />
        {open.footer && (
          <>
            <Field label="Contact line"><Input value={flyer.contact} onChange={(v) => set("contact", v)} placeholder="For more details, contact: …" /></Field>
            <Row>
              <Field label="Website"><Input value={flyer.website} onChange={(v) => set("website", v)} placeholder="adlmstudio.net" /></Field>
              <Field label="Show website"><Toggle on={flyer.showWebsite} onChange={(v) => set("showWebsite", v)} /></Field>
            </Row>
            {isEvent && (
              <Field label="Enquiries (phone)">
                {enquiries.map((n, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <Input value={n} onChange={(v) => set("enquiries", enquiries.map((x, idx) => (idx === i ? v : x)))} placeholder="Phone number" />
                    {enquiries.length > 1 && <button type="button" onClick={() => set("enquiries", enquiries.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", color: "#C9302C", cursor: "pointer", fontSize: 16 }}>×</button>}
                  </div>
                ))}
                {enquiries.length < 4 && <button type="button" onClick={() => set("enquiries", [...enquiries, ""])} style={miniBtn}>+ Add number</button>}
              </Field>
            )}
          </>
        )}
      </div>

      {/* Show / hide */}
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
