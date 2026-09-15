// Reading a Word document in the browser, with nothing on a server.
//
// Ported from his site/assets/js/wordfile.js. A .docx is not a document format
// so much as a ZIP file with an XML document inside it, so the work is in
// three parts, none of which needs a library:
//
//   1. Walk the ZIP central directory to find word/document.xml.
//   2. Inflate it. The browser already has a DEFLATE decoder —
//      DecompressionStream with 'deflate-raw' is exactly the raw stream a ZIP
//      entry stores.
//   3. Read the XML, and turn Word's paragraph styles back into the plain
//      conventions docParser.js already understands: # for a heading, - for a
//      bullet, tabs between table cells.
//
// What this deliberately does not do is try to preserve Word's formatting. The
// whole point of the composer is that the document comes out in the ADLM house
// style; carrying over somebody's Calibri and their 1.15 spacing would defeat
// it. Structure comes across, appearance does not.

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export function docxSupported() {
  return (
    typeof DecompressionStream === "function" &&
    typeof DOMParser === "function" &&
    typeof TextDecoder === "function"
  );
}

/* ------------------------------------------------------------------ the zip */

// The end-of-central-directory record is at the tail, after a comment of
// unknown length, so it is found by scanning backwards for its signature.
function findEOCD(dv) {
  const max = Math.min(dv.byteLength, 66000);
  for (let i = dv.byteLength - 22; i >= dv.byteLength - max && i >= 0; i -= 1) {
    if (dv.getUint32(i, true) === 0x06054b50) return i;
  }
  return -1;
}

function entries(buf) {
  const dv = new DataView(buf);
  const eocd = findEOCD(dv);
  if (eocd < 0) throw new Error("not a zip");
  const count = dv.getUint16(eocd + 10, true);
  const start = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder("utf-8");
  const out = {};
  let p = start;
  for (let n = 0; n < count && p + 46 <= dv.byteLength; n += 1) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const cmtLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    out[name] = { method, csize, local };
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}

// The local header repeats the name and extra fields at their own lengths,
// which is what actually sets where the compressed bytes begin.
function bytesOf(buf, e) {
  const dv = new DataView(buf);
  if (dv.getUint32(e.local, true) !== 0x04034b50) throw new Error("bad local header");
  const nameLen = dv.getUint16(e.local + 26, true);
  const extraLen = dv.getUint16(e.local + 28, true);
  const at = e.local + 30 + nameLen + extraLen;
  return new Uint8Array(buf, at, e.csize);
}

async function inflate(bytes, method) {
  if (method === 0) return bytes;
  if (method !== 8) throw new Error("unsupported compression");
  const ds = new DecompressionStream("deflate-raw");
  const w = ds.writable.getWriter();
  w.write(bytes);
  w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

/* ------------------------------------------------------------------ the xml */

function attr(el, name) {
  return el ? el.getAttributeNS(W, name) || el.getAttribute(`w:${name}`) || "" : "";
}
function kids(el, name) {
  const out = [];
  for (let i = 0; i < el.childNodes.length; i += 1) {
    const c = el.childNodes[i];
    if (c.nodeType === 1 && c.localName === name) out.push(c);
  }
  return out;
}
const first = (el, name) => kids(el, name)[0] || null;
const deep = (el, name) => el.getElementsByTagNameNS(W, name);

/**
 * The text of a run — text, tabs and breaks; in a numbered list, nothing that
 * says what number it is, because Word keeps that in numbering.xml and
 * recomputes it.
 *
 * `edges` keeps the leading and trailing spaces, which matters when the run is
 * one of several being joined back together: Word puts "Delivery:" in a bold
 * run and " Live online…" in the next, and trimming both welds them into
 * **Delivery:**Live online.
 */
function runText(p, edges) {
  let out = "";
  const walk = (node) => {
    for (let i = 0; i < node.childNodes.length; i += 1) {
      const c = node.childNodes[i];
      if (c.nodeType !== 1) continue;
      if (c.localName === "delText") continue; // a tracked deletion
      if (c.localName === "t") out += c.textContent;
      else if (c.localName === "tab") out += " ";
      else if (c.localName === "br" || c.localName === "cr") out += " ";
      else if (c.localName === "noBreakHyphen") out += "-";
      else walk(c);
    }
  };
  walk(p);
  out = out.replace(/\s+/g, " ");
  return edges ? out : out.trim();
}

/* --------------------------------------------------------- what a paragraph IS
 *
 * A .docx says so in two ways, and only one of them is reliable.
 *
 * A person writing in Word applies Heading 1. A generator writing .docx very
 * often applies nothing at all and makes the heading *look* like one — bold, a
 * few points larger. The file this was rebuilt for declares exactly one style
 * in the whole document (ListParagraph, on its bullets) and carries its title,
 * its six section headings and its eleven sub-headings as nothing but bold
 * runs at 17pt, 14pt and 12pt.
 *
 * Reading only the styles on a document like that flattens it completely:
 * every heading arrives as body text, and there is then nothing on the page to
 * make bigger. So when the styles are silent the sizes are read the way a
 * person reads the page — what is bolder and bigger than normal, and by how
 * much — and the ladder of sizes above normal becomes the ladder of levels.
 *
 * Styles still win where they exist. An inferred heading is a fallback, and a
 * fallback that overrode a declaration would be worse than none.
 */

function on(node) {
  if (!node) return false;
  const v = attr(node, "val");
  return v !== "0" && v !== "false" && v !== "off";
}
function sizeOf(rPr, fallback) {
  const n = rPr ? Number(attr(first(rPr, "sz"), "val")) : 0;
  return n > 0 ? n : fallback;
}

// Every run in the paragraph, carrying the weight and size that apply to it
// once the paragraph's own run properties have been inherited.
function runsOf(p) {
  const pr = first(p, "pPr");
  const base = pr ? first(pr, "rPr") : null;
  const baseBold = base ? on(first(base, "b")) : false;
  const baseSize = sizeOf(base, 0);

  const rs = deep(p, "r");
  const out = [];
  for (let i = 0; i < rs.length; i += 1) {
    const rPr = first(rs[i], "rPr");
    out.push({
      text: runText(rs[i], true),
      bold: rPr && first(rPr, "b") ? on(first(rPr, "b")) : baseBold,
      size: sizeOf(rPr, baseSize),
    });
  }
  return out;
}

// The size this document calls normal, in half-points, weighted by how much
// text is set in it — so a long body beats a big title even when the title's
// run count is higher.
function bodySize(body) {
  const tally = {};
  const ps = deep(body, "p");
  for (let i = 0; i < ps.length; i += 1) {
    runsOf(ps[i]).forEach((r) => {
      const t = r.text.trim();
      if (!t || !r.size) return;
      tally[r.size] = (tally[r.size] || 0) + t.length;
    });
  }
  let best = 0;
  let bestN = 0;
  Object.keys(tally).forEach((k) => {
    if (tally[k] > bestN) {
      bestN = tally[k];
      best = Number(k);
    }
  });
  return best || 20; // 10pt, Word's own default
}

function styleOf(p) {
  const pr = first(p, "pPr");
  if (!pr) return { kind: "para" };
  const st = attr(first(pr, "pStyle"), "val").replace(/\s+/g, "").toLowerCase();
  const lvl = attr(first(pr, "outlineLvl"), "val");
  const listed = !!first(pr, "numPr");

  if (st === "title") return { kind: "heading", level: 1 };
  const m = st.match(/^heading(\d)$/);
  if (m) return { kind: "heading", level: Math.min(3, Number(m[1])) };
  if (st === "subtitle") return { kind: "heading", level: 2 };
  if (lvl !== "" && Number(lvl) < 3) return { kind: "heading", level: Number(lvl) + 1 };
  // His test is numPr (what Word writes when somebody clicks the bullet
  // button) or ListParagraph (what a generator writes). Word's own built-in
  // "List Bullet" and "List Number" styles are neither, and a document using
  // them arrived with every bullet flattened into a paragraph — so the test is
  // widened to the family rather than the two members of it he had met.
  if (listed || /^list(paragraph|bullet|number)/.test(st)) return { kind: "bullet" };
  return { kind: "para" };
}

// Reads like a heading even though nothing declared it one: short, entirely
// bold, and either larger than the body or — at body size — with no sentence
// punctuation to end it. The length cap is what keeps a bold *sentence* from
// being promoted; emphasis and structure look identical at one run's remove,
// and the only honest separator between them is how much of it there is.
function looksLikeHeading(runs, text, body) {
  if (!text || text.length > 120) return 0;
  const real = runs.filter((r) => r.text.trim());
  if (!real.length) return 0;
  if (!real.every((r) => r.bold)) return 0;
  const size = Math.max(...real.map((r) => r.size || body));
  if (size > body) return size;
  return text.length <= 60 && !/[.!?;,]$/.test(text) ? body : 0;
}

// The sizes above body size, largest first, become levels 1, 2, 3. Anything
// smaller than the third is a level 3 as well: a document with five sizes of
// heading has more sizes than it has meanings.
function ladder(sizes, body) {
  const uniq = [];
  sizes.forEach((s) => {
    if (s > body && uniq.indexOf(s) < 0) uniq.push(s);
  });
  uniq.sort((x, y) => y - x);
  return (size) => {
    const i = uniq.indexOf(size);
    return i < 0 ? 3 : Math.min(3, i + 1);
  };
}

// Word keeps emphasis in run properties and the composer keeps it in
// asterisks, so bold spans come across as **this**.
function richText(p) {
  const parts = [];
  let cur = null;
  runsOf(p).forEach((r) => {
    if (!r.text) return;
    // Word splits a run wherever it feels like it — sometimes mid-word — so
    // adjacent runs of the same weight are merged before anything is marked.
    // Marking each fragment would produce **De****livery:**.
    if (!cur || cur.bold !== r.bold) {
      cur = { bold: r.bold, text: "" };
      parts.push(cur);
    }
    cur.text += r.text;
  });
  const out = parts
    .map((s) => {
      if (!s.bold) return s.text;
      // The space after "Delivery:" belongs to the sentence, not to the
      // emphasis, so it is pushed outside the marks.
      const m = s.text.match(/^(\s*)([\s\S]*?)(\s*)$/);
      return m[2] ? `${m[1]}**${m[2]}**${m[3]}` : s.text;
    })
    .join("");
  return out.replace(/\s+/g, " ").trim();
}

// Cells are flattened to one line each, because a tab or a pipe inside a cell
// would be read back as another column and quietly shift the row.
function cellText(tc) {
  const ps = deep(tc, "p");
  const out = [];
  for (let i = 0; i < ps.length; i += 1) {
    const t = runText(ps[i]);
    if (t) out.push(t);
  }
  return out.join(" ").replace(/[\t|]/g, " ").trim();
}

function tableLines(tbl) {
  const out = [];
  kids(tbl, "tr").forEach((tr) => {
    const cs = kids(tr, "tc").map(cellText);
    // A row where every cell is empty carries nothing but ruling.
    if (cs.join("")) out.push(cs.join("\t"));
  });
  return out;
}

// Two passes, because the ladder is not known until the whole document has
// been seen: you cannot say a 14pt bold line is a level 2 until you know there
// is a 17pt one above it and a 12pt one below.
function toText(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("bad xml");
  const body = doc.getElementsByTagNameNS(W, "body")[0];
  if (!body) throw new Error("no body");

  const normal = bodySize(body);

  // Pass one — read every top-level paragraph and decide what it is.
  const items = [];
  const sizes = [];
  for (let i = 0; i < body.childNodes.length; i += 1) {
    const el = body.childNodes[i];
    if (el.nodeType !== 1) continue;

    if (el.localName === "p") {
      const runs = runsOf(el);
      const text = runText(el);
      if (!text) continue;
      let st = styleOf(el);
      let size = 0;
      if (st.kind === "para") {
        size = looksLikeHeading(runs, text, normal);
        if (size) {
          st = { kind: "heading", level: 0, size };
          sizes.push(size);
        }
      }
      items.push({ kind: st.kind, level: st.level, size, p: el, text });
    } else if (el.localName === "tbl") {
      items.push({ kind: "tbl", el });
    } else if (el.localName === "sdt") {
      const content = first(el, "sdtContent");
      if (!content) continue;
      const ps = deep(content, "p");
      for (let k = 0; k < ps.length; k += 1) {
        if (runText(ps[k])) items.push({ kind: "para", p: ps[k] });
      }
    }
  }

  const levelOf = ladder(sizes, normal);

  // Pass two — write it out in the conventions the parser reads.
  const lines = [];
  let prev = "";
  const push = (kind, text) => {
    // Runs of bullets and runs of table rows must stay adjacent — a blank line
    // between them is what tells the parser they ended.
    if (lines.length && (kind !== prev || kind === "para" || kind === "heading")) lines.push("");
    lines.push(text);
    prev = kind;
  };

  items.forEach((it) => {
    if (it.kind === "tbl") {
      tableLines(it.el).forEach((r) => push("table", r));
      prev = "table";
      return;
    }
    if (it.kind === "heading") {
      const lvl = it.level || levelOf(it.size);
      // A heading carries no inline emphasis — all of it is emphasis.
      push("heading", `${"#".repeat(lvl)} ${it.text}`);
      return;
    }
    if (it.kind === "bullet") {
      push("bullet", `- ${richText(it.p).replace(/^[-*•·]\s*/, "")}`);
      return;
    }
    push("para", richText(it.p));
  });

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* ----------------------------------------------------------------- the door */

export async function readDocx(file) {
  if (!docxSupported()) {
    throw new Error("This browser has no built-in decompressor.");
  }
  const buf = await file.arrayBuffer();

  let list;
  try {
    list = entries(buf);
  } catch {
    throw new Error(
      "That file is not a .docx — a .doc saved by an older Word is a different format " +
        "entirely. Open it and save as .docx, or paste the text.",
    );
  }

  const e = list["word/document.xml"];
  if (!e) throw new Error("That zip has no Word document inside it.");

  const bytes = await inflate(bytesOf(buf, e), e.method);
  const text = toText(new TextDecoder("utf-8").decode(bytes));
  if (!text) {
    throw new Error(
      "The document read as empty. If the text is inside images or text boxes, it will " +
        "not come across.",
    );
  }
  return text;
}
