// ADLM preset backgrounds for flyers. Net-new (no NIQS assets reused).
//
// Each entry is { id, name, type, ... }:
//   - solid    → { color }
//   - gradient → { value }  (any CSS background-image string)
//   - image    → { path }   (served from /public or a remote URL)
//
// resolveBackground() turns an id (or an uploaded image data-URL/URL) into an
// inline-style object the canvas can spread directly.

import { NAVY, NAVY_DEEP, NAVY_MID } from "./brand.js";

export const BACKGROUNDS = [
  {
    id: "navy-glow",
    name: "Navy + Orange Glow",
    type: "gradient",
    value:
      "radial-gradient(ellipse at 78% 88%, rgba(232,106,39,0.20) 0%, transparent 55%), linear-gradient(160deg, #05111f 0%, #040d18 100%)",
  },
  {
    id: "navy-blue-glow",
    name: "Navy + Blue Glow",
    type: "gradient",
    value:
      "radial-gradient(ellipse at 22% 12%, rgba(54,163,255,0.20) 0%, transparent 55%), linear-gradient(160deg, #061528 0%, #040d18 100%)",
  },
  {
    id: "navy-gradient",
    name: "Navy Fade",
    type: "gradient",
    value: "linear-gradient(160deg, #061528 0%, #05111f 60%, #040d18 100%)",
  },
  { id: "navy-solid", name: "Navy", type: "solid", color: NAVY },
  { id: "navy-deep-solid", name: "Navy Deep", type: "solid", color: NAVY_DEEP },
  { id: "navy-mid-solid", name: "Navy Mid", type: "solid", color: NAVY_MID },
  {
    id: "blue-band",
    name: "Electric Blue",
    type: "gradient",
    value: "linear-gradient(155deg, #0b3a8f 0%, #061528 70%, #040d18 100%)",
  },
  {
    id: "orange-ember",
    name: "Orange Ember",
    type: "gradient",
    value: "linear-gradient(150deg, #7a2d0c 0%, #1a1410 55%, #05111f 100%)",
  },
];

export function findBackground(id) {
  return BACKGROUNDS.find((b) => b.id === id) || BACKGROUNDS[0];
}

// Build the inline style for a background. `uploaded` (a data-URL or https URL)
// always wins so an admin can drop in a custom image without registering it.
export function resolveBackground(id, uploaded) {
  if (uploaded) {
    return {
      backgroundImage: `url("${uploaded}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  const bg = findBackground(id);
  if (!bg) return { background: NAVY };
  if (bg.type === "solid") return { background: bg.color };
  if (bg.type === "gradient") return { backgroundImage: bg.value };
  if (bg.type === "image") {
    return {
      backgroundImage: `url("${bg.path}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  return { background: NAVY };
}

// Small CSS preview string for the swatch grid in the picker.
export function backgroundPreviewStyle(bg) {
  if (bg.type === "solid") return { background: bg.color };
  if (bg.type === "gradient") return { backgroundImage: bg.value };
  if (bg.type === "image") {
    return {
      backgroundImage: `url("${bg.path}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  return {};
}
