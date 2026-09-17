// src/lib/plainText.js
//
// Ada's replies are shown as plain text, so Markdown the model slips in shows
// up as literal symbols ("**3D model projects**"). This removes the emphasis,
// heading and code marks and turns "* " / "- " list markers into bullets,
// leaving the words alone. Her prompt also asks for plain text; this is the
// guarantee for replies that ignore it.
export function plainText(text) {
  return String(text ?? "")
    .replace(/```[a-z]*\n?/gi, "") // code fences
    .replace(/`([^`]*)`/g, "$1") // inline code
    .replace(/\*\*([^*]+)\*\*/g, "$1") // **bold**
    .replace(/__([^_]+)__/g, "$1") // __bold__
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, "$1$2") // *italic*
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // # headings
    .replace(/^(\s*)[*-]\s+/gm, "$1• ") // list markers
    .replace(/\*{2,}/g, ""); // stray ** left over
}
