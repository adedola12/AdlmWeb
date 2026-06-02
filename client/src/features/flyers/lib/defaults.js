// ──────────────────────────────────────────────────────────────────────────
// THE FLYER DATA CONTRACT
// ──────────────────────────────────────────────────────────────────────────
// This is the single source of truth for the shape of a `flyer` object. The
// form (FlyerForm), the renderer (FlyerCanvas + the 4 template bodies), the
// export controls, and the server `Flyer.data` blob all conform to THIS shape.
//
// A flyer is one flat object. Fields are grouped by which template consumes
// them, but every flyer carries the full superset (unused fields are simply
// ignored by templates that don't read them). The currently-selected template
// is `flyer.template`.
//
//   SHARED (all templates)
//     template            'announcement' | 'countdown' | 'launch' | 'event'
//     title               headline string
//     highlightWordIndex  index of the word rendered in `accent` colour
//     subtitle            supporting line under the headline
//     badge               small eyebrow/pill text (e.g. "BIM COURSE")
//     showBadge           bool — render the badge pill
//     accent              accent colour hex (defaults to ADLM orange)
//     background          background id from lib/backgrounds.js
//     backgroundImage     uploaded bg image (data-URL or https URL); wins over `background`
//     partnerLogo         co-brand logo (data-URL or https URL), shown beside ADLM logo
//     contact             contact line text in the bottom bar
//     website             small website string in the bottom bar
//     showContactBar      bool — render the bottom contact bar
//     showWebsite         bool — render the website string
//
//   COUNTDOWN
//     launchDate          ISO YYYY-MM-DD; the big number = days until this date
//     countdownLabel      label under the number (e.g. "days to go")
//
//   LAUNCH / PRODUCT SHOWCASE
//     heroImage           screenshot/hero image (data-URL or https URL)
//     heroFrame           'browser' | 'laptop' | 'none' — how the hero is framed
//
//   EVENT / TRAINING PROMO
//     eventCategory       'Training' | 'Webinar'
//     dateStart, dateEnd  ISO YYYY-MM-DD
//     time, timeZone      "9:00 AM daily", "WAT"
//     venueType           'In-Person' | 'Virtual' | 'Hybrid'
//     venuePhysical, venueCity
//     platform            'Zoom' | 'GoogleMeet' | 'Teams' | 'XSpaces' | 'YouTube' | 'WhatsApp'
//     platformNote
//     registrationUrl     drives the QR code + register line
//     speakers            [{ id, name, role, topic, photo }]  (photo = data-URL/URL)
//     enquiries           [string] phone numbers
// ──────────────────────────────────────────────────────────────────────────

import { ORANGE, DEFAULT_WEBSITE } from "./brand.js";

export const TEMPLATES = [
  { value: "announcement", label: "Coming Soon", hint: "Teaser / announcement" },
  { value: "countdown", label: "Countdown", hint: "N days to go" },
  { value: "launch", label: "Launch", hint: "Product / website showcase" },
  { value: "event", label: "Event", hint: "Training / webinar promo" },
];

export const PLATFORM_OPTIONS = [
  { value: "Zoom", label: "Zoom" },
  { value: "GoogleMeet", label: "Google Meet" },
  { value: "Teams", label: "Microsoft Teams" },
  { value: "XSpaces", label: "X Spaces" },
  { value: "YouTube", label: "YouTube Live" },
  { value: "WhatsApp", label: "WhatsApp Live" },
];

// Fields shared by every template.
const BASE = {
  id: null, // server _id once saved; null = unsaved draft
  template: "announcement",
  title: "Integrating AI & Data Analytical Tools",
  highlightWordIndex: 1, // "AI & Data Analytical" → highlight word 1
  subtitle: "tools on MEP & HVAC works cost management workflow",
  badge: "BIM COURSE",
  showBadge: true,
  accent: ORANGE,
  background: "navy-glow",
  backgroundImage: null,
  partnerLogo: null,
  contact: "For more details, contact: 08106503524",
  website: DEFAULT_WEBSITE,
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
};

// Per-template overrides applied on top of BASE so each template opens with
// believable ADLM-flavoured placeholder copy.
const PRESETS = {
  announcement: {
    title: "Integrating AI & Data Analytical Tools",
    highlightWordIndex: 1,
    subtitle: "tools on MEP & HVAC works cost management workflow",
    badge: "BIM COURSE",
    background: "navy-glow",
  },
  countdown: {
    title: "Website Launch",
    highlightWordIndex: 1,
    subtitle:
      "We design construction-focused digital products that improve workflows and empower professionals.",
    badge: "COUNTDOWN",
    background: "navy-blue-glow",
    countdownLabel: "days to go",
  },
  launch: {
    title: "Website Launch",
    highlightWordIndex: 1,
    subtitle:
      "We design construction-focused digital products that improve workflows and empower professionals.",
    badge: "NOW LIVE",
    background: "navy-gradient",
    heroFrame: "browser",
  },
  event: {
    title: "Advancing Digital Cost Management",
    highlightWordIndex: 2,
    subtitle: "Hands-on BIM-driven quantity surveying & estimation workflows",
    badge: "CPD TRAINING",
    background: "navy-glow",
    eventCategory: "Training",
    registrationUrl: "adlmstudio.net/trainings",
    speakers: [
      { id: "s1", name: "QS Adedolapo", role: "Lead Facilitator", topic: "BIM cost workflows", photo: null },
    ],
  },
};

// Build a fresh flyer for a given template. Always returns a new object with a
// fresh `speakers`/`enquiries` array so edits never mutate the defaults.
export function defaultFlyer(template = "announcement") {
  const preset = PRESETS[template] || {};
  return {
    ...BASE,
    ...preset,
    template,
    id: null,
    speakers: (preset.speakers || BASE.speakers).map((s) => ({ ...s })),
    enquiries: [...(preset.enquiries || BASE.enquiries)],
  };
}

// Normalise an arbitrary object (e.g. loaded from the server) into a complete
// flyer, filling any missing fields from BASE. Guards against old/partial docs.
export function normalizeFlyer(obj = {}) {
  const template = obj.template || "announcement";
  const base = defaultFlyer(template);
  return {
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
    enquiries: Array.isArray(obj.enquiries) && obj.enquiries.length
      ? [...obj.enquiries]
      : base.enquiries,
  };
}

export const DEFAULT_FLYER = defaultFlyer("announcement");
