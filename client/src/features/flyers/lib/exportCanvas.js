// Shared html2canvas capture for the flyer engine.
//
// Renders the offscreen 1080×1350 export node to a <canvas> at 2× scale. Fonts
// are the usual html2canvas footgun, so we (1) wait for document.fonts.ready,
// (2) explicitly load the Lexend weights we use, and (3) re-inject the Lexend
// stylesheet into the cloned document html2canvas builds. Mirrors the approach
// from the NIQS engine's ExportControls.
import html2canvas from "html2canvas";
import { CANVAS_W, CANVAS_H } from "./brand.js";

const LEXEND_HREF =
  "https://fonts.googleapis.com/css2?family=Lexend:wght@100..900&display=swap";

async function ensureFontsLoaded() {
  try {
    await document.fonts.ready;
    const weights = [300, 400, 500, 600, 700, 800, 900];
    await Promise.allSettled(
      weights.map((w) => document.fonts.load(`${w} 16px Lexend`)),
    );
  } catch {
    /* font loading is best-effort */
  }
}

export async function captureCanvas(node) {
  if (!node) throw new Error("Flyer export node not found");
  await ensureFontsLoaded();
  return html2canvas(node, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    backgroundColor: null,
    width: CANVAS_W,
    height: CANVAS_H,
    logging: false,
    imageTimeout: 8000,
    onclone: async (doc) => {
      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = LEXEND_HREF;
      doc.head.appendChild(link);
      try {
        await doc.fonts.ready;
      } catch {
        /* ignore */
      }
    },
  });
}

export async function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

// Trigger a browser download of a data-URL / object-URL.
export function downloadDataUrl(href, filename) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
