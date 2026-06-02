// ──────────────────────────────────────────────────────────────────────────
// THE FLYER DATA CONTRACT
// ──────────────────────────────────────────────────────────────────────────
// Single source of truth for the shape of a `flyer`. The form, renderer, export
// and the server `Flyer.data` blob all conform to this. One flat object; the
// active layout is `flyer.template`, the output size is `flyer.format`
// ('portrait' flyer 1080×1350 | 'thumbnail' YouTube 1280×720 — see formats.js),
// and the look is a curated Style (styles.js: theme/background/accent).
//
//   LOOK   style, theme, background, accent, backgroundImage
//   SIZE   format ('portrait' | 'thumbnail')
//   SHARED template, title, highlightWordIndex, subtitle, badge, showBadge,
//          partnerLogo, contact, website, showContactBar, showWebsite
//   COUNTDOWN     launchDate, countdownLabel
//   LAUNCH/THUMB  heroImage, heroFrame ('browser'|'laptop'|'none')
//   EVENT         eventCategory, dateStart/dateEnd, time, timeZone, venueType,
//                 venuePhysical, venueCity, platform, platformNote,
//                 registrationUrl, speakers[], enquiries[]
//   SUBSCRIPTION  packagesHeading, currency, installation, tierStyle, tiers[]
//   TICKET        ticketTitle, ticketMeta, currency, ticketPrice, ticketCta
//   THUMBNAIL     bullets[] (ThumbFeatures), reuses heroImage/heroFrame, badge
// ──────────────────────────────────────────────────────────────────────────

import { ORANGE } from "./brand.js";
import { applyStyle, getStyle } from "./styles.js";

// Each template declares the format it belongs to. The form only shows the
// templates that match the currently-selected format.
export const TEMPLATES = [
  { value: "announcement", label: "Coming Soon",  format: "portrait",  hint: "Teaser / announcement" },
  { value: "countdown",    label: "Countdown",    format: "portrait",  hint: "N days to go" },
  { value: "launch",       label: "Launch",       format: "portrait",  hint: "Product / website showcase" },
  { value: "event",        label: "Event",        format: "portrait",  hint: "Training / webinar promo" },
  { value: "subscription", label: "Pricing",      format: "portrait",  hint: "Subscription packages (3 tiers)" },
  { value: "ticket",       label: "Ticket",       format: "portrait",  hint: "Promo ticket with price seal" },
  { value: "thumbBold",    label: "Bold Title",   format: "thumbnail", hint: "Big headline" },
  { value: "thumbTutorial",label: "Tutorial",     format: "thumbnail", hint: "Title + screenshot" },
  { value: "thumbFeatures",label: "Features",     format: "thumbnail", hint: "Title + feature pills" },
  { value: "thumbHook",    label: "Hook",         format: "thumbnail", hint: "Giant phrase / stat" },
];

export const templatesForFormat = (fmt) =>
  TEMPLATES.filter((t) => (t.format || "portrait") === (fmt || "portrait"));

export const PLATFORM_OPTIONS = [
  { value: "Zoom", label: "Zoom" },
  { value: "GoogleMeet", label: "Google Meet" },
  { value: "Teams", label: "Microsoft Teams" },
  { value: "XSpaces", label: "X Spaces" },
  { value: "YouTube", label: "YouTube Live" },
  { value: "WhatsApp", label: "WhatsApp Live" },
];

function newTiers() {
  return [
    { id: "t1", label: "Monthly",  price: "10,000",  period: "monthly",  note: "" },
    { id: "t2", label: "6 Months", price: "50,000",  period: "6 months", note: "Save NGN 10,000" },
    { id: "t3", label: "Yearly",   price: "100,000", period: "yearly",   note: "" },
  ];
}

// Fields shared by every template (look fields filled by applyStyle below).
const BASE = {
  id: null,
  template: "announcement",
  format: "portrait",
  style: "navy-glow",
  theme: "dark",
  background: "navy-glow",
  accent: ORANGE,
  backgroundImage: null,

  title: "Integrating AI & Data Analytical Tools",
  highlightWordIndex: 1,
  subtitle: "tools on MEP & HVAC works cost management workflow",
  badge: "BIM COURSE",
  showBadge: true,
  partnerLogo: null,
  contact: "For more details, contact: 08106503524",
  website: "adlmstudio.net",
  showContactBar: true,
  showWebsite: true,

  // countdown
  launchDate: "",
  countdownLabel: "days to go",

  // launch / thumbnail hero
  heroImage: null,
  heroFrame: "browser",

  // event
  eventCategory: "Training",
  dateStart: "",
  dateEnd: "",
  time: "9:00 AM daily",
  timeZone: "WAT",
  venueType: "Hybrid",
  venuePhysical: "",
  venueCity: "",
  platform: "Zoom",
  platformNote: "Link via email",
  registrationUrl: "",
  speakers: [],
  enquiries: ["08106503524"],

  // subscription / pricing
  packagesHeading: "Subscription Packages",
  currency: "NGN",
  installation: "",
  tierStyle: "ribbon",
  tiers: newTiers(),

  // ticket
  ticketTitle: "Integration of BIM, AI & Data analytical tools",
  ticketMeta: "6-week training · Fri–Sun evenings · ADLM Platforms",
  ticketPrice: "90k",
  ticketCta: "You don't want to miss this — contact us to purchase today!",

  // thumbnail (feature pills)
  bullets: ["Auto rate calculation", "Customizable material prices", "Real-time rate logic"],
};

// Per-template overrides: believable ADLM copy + a sensible default Style.
const PRESETS = {
  announcement: { style: "navy-glow", title: "Integrating AI & Data Analytical Tools", highlightWordIndex: 1, subtitle: "tools on MEP & HVAC works cost management workflow", badge: "BIM COURSE" },
  countdown: { style: "blue-tech", title: "Website Launch", highlightWordIndex: 1, subtitle: "We design construction-focused digital products that improve workflows and empower professionals.", badge: "COUNTDOWN", countdownLabel: "days to go" },
  launch: { style: "hex-light", title: "Website Launch", highlightWordIndex: 1, subtitle: "We design construction-focused digital products that improve workflows and empower professionals.", badge: "NOW LIVE", heroFrame: "browser" },
  event: {
    style: "hex-light", title: "Advancing Digital Cost Management", highlightWordIndex: 2,
    subtitle: "Hands-on BIM-driven quantity surveying & estimation workflows", badge: "CPD TRAINING",
    eventCategory: "Training", registrationUrl: "adlmstudio.net/trainings",
    speakers: [{ id: "s1", name: "QS Adedolapo", role: "Lead Facilitator", topic: "BIM cost workflows", photo: null }],
  },
  subscription: { style: "podium", title: "ADLM Revit Plugin", highlightWordIndex: 1, subtitle: "", badge: "PLUGIN", packagesHeading: "Subscription Packages", installation: "NGN 25,000", tierStyle: "ribbon", tiers: newTiers() },
  ticket: {
    style: "hex-light", title: "Missed the live classes?", highlightWordIndex: 1,
    subtitle: "The training is now available for you to go through at your own pace!", badge: "BIM TRAINING",
    ticketTitle: "Integration of BIM, AI & Data analytical tools", ticketMeta: "6-week training · Fri–Sun evenings · ADLM Platforms", ticketPrice: "90k",
  },

  // thumbnails (landscape 1280×720)
  thumbBold: { format: "thumbnail", style: "navy-glow", title: "Revit MEP → Excel BoQ", highlightWordIndex: 3, subtitle: "1-click quantity takeoff for HVAC, plumbing & electrical", badge: "ADLM PLUGIN" },
  thumbTutorial: { format: "thumbnail", style: "blue-tech", title: "Generate a BoQ in Minutes", highlightWordIndex: 3, subtitle: "Step-by-step with the ADLM Revit plugin", badge: "TUTORIAL", heroFrame: "browser" },
  thumbFeatures: { format: "thumbnail", style: "hex-light", title: "ADLM Rate Generator", highlightWordIndex: 1, subtitle: "Accurate construction rates in seconds", badge: "NEW", bullets: ["Auto rate calculation", "Customizable material prices", "Nigerian & Int'l market", "Real-time rate logic"] },
  thumbHook: { format: "thumbnail", style: "navy-glow", title: "10× Faster Takeoff", highlightWordIndex: 0, subtitle: "BIM-driven quantity surveying with ADLM", badge: "WATCH NOW" },
};

// Build a fresh flyer for a template: BASE + preset + the preset's Style.
export function defaultFlyer(template = "announcement") {
  const preset = PRESETS[template] || {};
  const base = {
    ...BASE,
    ...preset,
    template,
    id: null,
    format: preset.format || "portrait",
    speakers: (preset.speakers || BASE.speakers).map((s) => ({ ...s })),
    enquiries: [...(preset.enquiries || BASE.enquiries)],
    tiers: (preset.tiers || BASE.tiers).map((t) => ({ ...t })),
    bullets: [...(preset.bullets || BASE.bullets)],
  };
  return applyStyle(base, preset.style || BASE.style);
}

// Normalise an arbitrary object (e.g. a saved server doc) into a complete flyer.
export function normalizeFlyer(obj = {}) {
  const template = obj.template || "announcement";
  const base = defaultFlyer(template);
  const merged = {
    ...base,
    ...obj,
    template,
    format: obj.format || base.format,
    speakers: Array.isArray(obj.speakers)
      ? obj.speakers.map((s, i) => ({ id: s.id || `s${i + 1}`, name: s.name || "", role: s.role || "", topic: s.topic || "", photo: s.photo || null }))
      : base.speakers,
    enquiries: Array.isArray(obj.enquiries) && obj.enquiries.length ? [...obj.enquiries] : base.enquiries,
    tiers: Array.isArray(obj.tiers) && obj.tiers.length
      ? obj.tiers.map((t, i) => ({ id: t.id || `t${i + 1}`, label: t.label || "", price: t.price || "", period: t.period || "", note: t.note || "" }))
      : base.tiers,
    bullets: Array.isArray(obj.bullets) ? obj.bullets.filter((x) => x != null) : base.bullets,
  };
  if (!obj.theme || !obj.background) {
    const s = getStyle(obj.style || merged.style);
    merged.style = s.id;
    merged.theme = obj.theme || s.theme;
    merged.background = obj.background || s.background;
    merged.accent = obj.accent || s.accent;
  }
  return merged;
}

export const DEFAULT_FLYER = defaultFlyer("announcement");
