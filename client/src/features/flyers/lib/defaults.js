// ──────────────────────────────────────────────────────────────────────────
// THE FLYER DATA CONTRACT
// ──────────────────────────────────────────────────────────────────────────
// Single source of truth for the shape of a `flyer`. The form, the renderer
// (FlyerCanvas + template bodies), export, and the server `Flyer.data` blob all
// conform to this. A flyer is one flat object carrying the full superset of
// fields; the active layout is `flyer.template`, and the look is driven by a
// curated Style (see styles.js) which sets theme/background/accent together.
//
//   LOOK (set by a Style — see styles.js)
//     style               style id (e.g. 'podium', 'navy-glow')
//     theme               'light' | 'dark'  → palette (white-on-dark vs navy-on-light)
//     background          background id (a branded plate or gradient)
//     accent              accent colour hex
//     backgroundImage     optional uploaded plate (data-URL/https) — overrides background
//
//   SHARED
//     template            'announcement'|'countdown'|'launch'|'event'|'subscription'|'ticket'
//     title               headline; highlightWordIndex picks the accent word
//     subtitle            supporting line
//     badge / showBadge   eyebrow pill text + visibility
//     partnerLogo         co-brand logo (data-URL/https) beside the ADLM logo
//     contact / website   bottom contact bar text
//     showContactBar / showWebsite
//
//   COUNTDOWN     launchDate (YYYY-MM-DD), countdownLabel
//   LAUNCH        heroImage, heroFrame ('browser'|'laptop'|'none')
//   EVENT         eventCategory, dateStart/dateEnd, time, timeZone, venueType,
//                 venuePhysical, venueCity, platform, platformNote,
//                 registrationUrl, speakers[{id,name,role,topic,photo}], enquiries[]
//   SUBSCRIPTION  packagesHeading, currency, installation,
//                 tiers[{id,label,price,period,note}]   (1–3 cards)
//   TICKET        ticketTitle, ticketMeta, currency, ticketPrice, ticketCta
// ──────────────────────────────────────────────────────────────────────────

import { ORANGE } from "./brand.js";
import { applyStyle, getStyle } from "./styles.js";

export const TEMPLATES = [
  { value: "announcement", label: "Coming Soon",  hint: "Teaser / announcement" },
  { value: "countdown",    label: "Countdown",    hint: "N days to go" },
  { value: "launch",       label: "Launch",       hint: "Product / website showcase" },
  { value: "event",        label: "Event",        hint: "Training / webinar promo" },
  { value: "subscription", label: "Pricing",      hint: "Subscription packages (3 tiers)" },
  { value: "ticket",       label: "Ticket",       hint: "Promo ticket with price seal" },
];

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

  // launch
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
  tiers: newTiers(),

  // ticket
  ticketTitle: "Integration of BIM, AI & Data analytical tools",
  ticketMeta: "6-week training · Fri–Sun evenings · ADLM Platforms",
  ticketPrice: "90k",
  ticketCta: "You don't want to miss this — contact us to purchase today!",
};

// Per-template overrides: believable ADLM copy + a sensible default Style.
const PRESETS = {
  announcement: {
    style: "navy-glow",
    title: "Integrating AI & Data Analytical Tools",
    highlightWordIndex: 1,
    subtitle: "tools on MEP & HVAC works cost management workflow",
    badge: "BIM COURSE",
  },
  countdown: {
    style: "blue-tech",
    title: "Website Launch",
    highlightWordIndex: 1,
    subtitle: "We design construction-focused digital products that improve workflows and empower professionals.",
    badge: "COUNTDOWN",
    countdownLabel: "days to go",
  },
  launch: {
    style: "hex-light",
    title: "Website Launch",
    highlightWordIndex: 1,
    subtitle: "We design construction-focused digital products that improve workflows and empower professionals.",
    badge: "NOW LIVE",
    heroFrame: "browser",
  },
  event: {
    style: "hex-light",
    title: "Advancing Digital Cost Management",
    highlightWordIndex: 2,
    subtitle: "Hands-on BIM-driven quantity surveying & estimation workflows",
    badge: "CPD TRAINING",
    eventCategory: "Training",
    registrationUrl: "adlmstudio.net/trainings",
    speakers: [
      { id: "s1", name: "QS Adedolapo", role: "Lead Facilitator", topic: "BIM cost workflows", photo: null },
    ],
  },
  subscription: {
    style: "podium",
    title: "ADLM Revit Plugin",
    highlightWordIndex: 1,
    subtitle: "",
    badge: "PLUGIN",
    packagesHeading: "Subscription Packages",
    installation: "NGN 25,000",
    tiers: newTiers(),
  },
  ticket: {
    style: "hex-light",
    title: "Missed the live classes?",
    highlightWordIndex: 1,
    subtitle: "The training is now available for you to go through at your own pace!",
    badge: "BIM TRAINING",
    ticketTitle: "Integration of BIM, AI & Data analytical tools",
    ticketMeta: "6-week training · Fri–Sun evenings · ADLM Platforms",
    ticketPrice: "90k",
  },
};

// Build a fresh flyer for a template: BASE + preset + the preset's Style.
export function defaultFlyer(template = "announcement") {
  const preset = PRESETS[template] || {};
  const base = {
    ...BASE,
    ...preset,
    template,
    id: null,
    speakers: (preset.speakers || BASE.speakers).map((s) => ({ ...s })),
    enquiries: [...(preset.enquiries || BASE.enquiries)],
    tiers: (preset.tiers || BASE.tiers).map((t) => ({ ...t })),
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
    speakers: Array.isArray(obj.speakers)
      ? obj.speakers.map((s, i) => ({
          id: s.id || `s${i + 1}`,
          name: s.name || "",
          role: s.role || "",
          topic: s.topic || "",
          photo: s.photo || null,
        }))
      : base.speakers,
    enquiries: Array.isArray(obj.enquiries) && obj.enquiries.length ? [...obj.enquiries] : base.enquiries,
    tiers: Array.isArray(obj.tiers) && obj.tiers.length
      ? obj.tiers.map((t, i) => ({
          id: t.id || `t${i + 1}`,
          label: t.label || "",
          price: t.price || "",
          period: t.period || "",
          note: t.note || "",
        }))
      : base.tiers,
  };
  // Backfill theme/background/accent for older docs that only stored a style.
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
