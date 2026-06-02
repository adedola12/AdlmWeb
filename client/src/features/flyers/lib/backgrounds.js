// ADLM background definitions. Most styles use a full-bleed branded SVG "plate"
// (one image baked with gradient + motif → reliable in html2canvas export);
// a few CSS gradients/solids round out the set. Selection happens via Styles
// (see styles.js); resolveBackground turns an id (or an uploaded image) into an
// inline-style object the canvas spreads directly.
import { NAVY, NAVY_DEEP, NAVY_MID } from "./brand.js";

export const BACKGROUNDS = [
  { id: "plate-hex-light",     name: "Light Hexagon", theme: "light", type: "plate", src: "/flyer-bg/bg-hex-light.svg" },
  { id: "plate-triangle-dark", name: "Dark Triangle", theme: "dark",  type: "plate", src: "/flyer-bg/bg-triangle-dark.svg" },
  { id: "plate-podium-light",  name: "Podium",        theme: "light", type: "plate", src: "/flyer-bg/bg-podium-light.svg" },
  { id: "plate-tech-dark",     name: "Blue Tech",     theme: "dark",  type: "plate", src: "/flyer-bg/bg-tech-dark.svg" },
  { id: "plate-clean-light",   name: "Clean White",   theme: "light", type: "plate", src: "/flyer-bg/bg-clean-light.svg" },

  {
    id: "navy-glow",
    name: "Navy + Orange Glow",
    theme: "dark",
    type: "gradient",
    value:
      "radial-gradient(ellipse at 78% 88%, rgba(232,106,39,0.20) 0%, transparent 55%), linear-gradient(160deg, #05111f 0%, #040d18 100%)",
  },
  { id: "navy-solid",  name: "Navy",  theme: "dark",  type: "solid", color: NAVY },
  { id: "white-solid", name: "White", theme: "light", type: "solid", color: "#ffffff" },
];

export function findBackground(id) {
  return BACKGROUNDS.find((b) => b.id === id) || BACKGROUNDS[0];
}

// Build the inline style for a background. An uploaded image (data-URL / https)
// always wins so an admin can drop in a custom plate.
export function resolveBackground(id, uploaded) {
  if (uploaded) {
    return { backgroundImage: `url("${uploaded}")`, backgroundSize: "cover", backgroundPosition: "center" };
  }
  const bg = findBackground(id);
  if (!bg) return { background: NAVY };
  if (bg.type === "solid") return { background: bg.color };
  if (bg.type === "gradient") return { backgroundImage: bg.value };
  if (bg.type === "plate" || bg.type === "image") {
    return {
      backgroundImage: `url("${bg.src || bg.path}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  return { background: NAVY };
}

// CSS preview for swatch grids.
export function backgroundPreviewStyle(bg) {
  if (bg.type === "solid") return { background: bg.color };
  if (bg.type === "gradient") return { backgroundImage: bg.value };
  if (bg.type === "plate" || bg.type === "image") {
    return { backgroundImage: `url("${bg.src || bg.path}")`, backgroundSize: "cover", backgroundPosition: "center" };
  }
  return {};
}
