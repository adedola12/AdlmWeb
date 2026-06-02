// Curated "Style" presets + light/dark palette.
//
// A Style is the single look-and-feel control in the upgraded engine: picking
// one sets theme + background + accent together, so an admin gets a polished,
// on-brand result without fiddling with individual colours. Each maps to one of
// the branded background plates in /public/flyer-bg (or a CSS gradient).
import { ORANGE, BLUE, BLUE_BRIGHT } from "./brand.js";

export const STYLES = [
  { id: "hex-light",     name: "Light Hexagon", theme: "light", background: "plate-hex-light",     accent: BLUE,        swatch: "linear-gradient(135deg,#ffffff,#e3edfb)" },
  { id: "triangle-dark", name: "Dark Triangle", theme: "dark",  background: "plate-triangle-dark", accent: ORANGE,      swatch: "linear-gradient(135deg,#0b1f3f,#05111f)" },
  { id: "podium",        name: "Podium",        theme: "light", background: "plate-podium-light",  accent: BLUE,        swatch: "radial-gradient(circle at 50% 70%,#cfe0fb,#ffffff)" },
  { id: "blue-tech",     name: "Blue Tech",     theme: "dark",  background: "plate-tech-dark",     accent: BLUE_BRIGHT, swatch: "linear-gradient(135deg,#0a2647,#040d18)" },
  { id: "clean",         name: "Clean White",   theme: "light", background: "plate-clean-light",   accent: ORANGE,      swatch: "linear-gradient(135deg,#ffffff,#eef2fa)" },
  { id: "navy-glow",     name: "Navy Glow",     theme: "dark",  background: "navy-glow",           accent: ORANGE,      swatch: "radial-gradient(circle at 75% 80%,rgba(232,106,39,0.5),#05111f)" },
];

export function getStyle(id) {
  return STYLES.find((s) => s.id === id) || STYLES[0];
}

// Apply a style's theme/background/accent onto a flyer object.
export function applyStyle(flyer, styleId) {
  const s = getStyle(styleId);
  return { ...flyer, style: s.id, theme: s.theme, background: s.background, accent: s.accent };
}

// Theme palette — the colour tokens every template reads so it works on both
// light and dark backgrounds. Templates use palette.text / palette.textSoft
// etc. instead of hard-coding white.
export function getPalette(theme) {
  const light = theme === "light";
  return {
    isLight: light,
    text: light ? "#0a1a30" : "#ffffff",
    textSoft: light ? "rgba(10,26,48,0.64)" : "rgba(255,255,255,0.68)",
    textFaint: light ? "rgba(10,26,48,0.40)" : "rgba(255,255,255,0.45)",
    panel: light ? "rgba(10,26,48,0.045)" : "rgba(255,255,255,0.05)",
    panelStrong: light ? "rgba(10,26,48,0.05)" : "rgba(0,0,20,0.5)",
    border: light ? "rgba(10,26,48,0.10)" : "rgba(255,255,255,0.12)",
    onAccent: "#ffffff",
  };
}
