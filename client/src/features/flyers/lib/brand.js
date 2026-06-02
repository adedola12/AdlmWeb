// ADLM brand tokens for the Flyer Engine.
//
// Ported from the NIQS Flyer Engine (which used navy/gold) and re-skinned to
// the ADLM identity: deep navy + signal orange + bright blue, Lexend type.
// These mirror the values in client/tailwind.config.js so the flyers feel
// native to the rest of the site.

export const NAVY = "#05111f"; // adlm.navy.DEFAULT — page/canvas base
export const NAVY_DEEP = "#040d18"; // adlm.navy.deep
export const NAVY_MID = "#061528"; // adlm.navy.mid
export const NAVY_TERTIARY = "#091e39"; // adlm.navy.tertiary
export const ORANGE = "#E86A27"; // adlm.orange — primary accent (was NIQS gold)
export const BLUE = "#005be3"; // adlm.blue.700
export const BLUE_BRIGHT = "#36a3ff"; // adlm.blue.500
export const WHITE = "#FFFFFF";

// Fonts. Lexend is loaded globally in client/src/index.css. We keep a single
// family (no separate display face) — weight carries the hierarchy instead.
export const FONT = "'Lexend', sans-serif";
export const FONT_DISPLAY = "'Lexend', sans-serif";

// Primary ADLM logo (lives in client/public/Logo.png). Used in the flyer header.
export const LOGO_SRC = "/Logo.png";

// Theme-specific brand lockups (copied into client/public/flyer-assets).
// Light flyers use the dark horizontal lockup; dark flyers use the white one.
export const LOGO_LIGHTBG = "/flyer-assets/adlm-logo-horizontal.png";
export const LOGO_DARKBG = "/flyer-assets/adlm-logo-white.png";

// Default co-brand / contact strings.
export const DEFAULT_WEBSITE = "adlmstudio.net";

// Canvas is a fixed Instagram-portrait 1080×1350 — every export is this size.
export const CANVAS_W = 1080;
export const CANVAS_H = 1350;
