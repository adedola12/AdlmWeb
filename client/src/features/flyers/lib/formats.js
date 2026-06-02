// Output formats for the studio. The engine renders the same brand system at
// two sizes: a portrait flyer (Instagram 4:5) and a landscape YouTube thumbnail
// (16:9). The active format drives the canvas size, which templates are
// available (see templatesForFormat in defaults.js), and the export dimensions.
export const FORMATS = [
  { id: "portrait", label: "Flyer", sub: "1080 × 1350", w: 1080, h: 1350 },
  { id: "thumbnail", label: "YouTube", sub: "1280 × 720", w: 1280, h: 720 },
];

export function getFormat(id) {
  return FORMATS.find((f) => f.id === id) || FORMATS[0];
}
