// scripts/lib/guide-md.mjs
//
// Turns one user guide (src/content/guides/<id>.md) into HTML, a table of
// contents and plain text for search. Shared by the PDF builder
// (scripts/build-guide-pdfs.mjs) so the PDFs and anything else built from the
// guides read the same words.
//
// Pure Node, no dependencies, like gen-changelogs.mjs. It handles only the
// Markdown the guide spec allows: ## and ### headings, paragraphs, numbered and
// bulleted lists (nested by indent), > callouts, pipe tables, fenced code,
// images written as ![alt](shot:file.png), links, **bold**, *italic*, `code`
// and <kbd>. Anything else is shown as text, never as raw HTML.

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_]/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Front matter: `key: value` lines and `[a, b]` arrays. */
export function splitFrontMatter(md) {
  const lines = md.replace(/^\uFEFF/, "").split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (lines[i]?.trim() !== "---") return { meta: {}, body: md };
  const meta = {};
  for (i++; i < lines.length && lines[i].trim() !== "---"; i++) {
    const m = lines[i].match(/^([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*(#.*)?$/);
    if (!m) continue;
    let v = m[2].trim();
    if (/^\[.*\]$/.test(v)) {
      v = v
        .slice(1, -1)
        .split(",")
        .map((x) => x.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      v = v.replace(/^["']|["']$/g, "");
      if (/^\d+$/.test(v)) v = Number(v);
    }
    meta[m[1]] = v;
  }
  return { meta, body: lines.slice(i + 1).join("\n") };
}

/**
 * Inline Markdown. `opts.image(file, alt)` returns the src for a shot: image
 * (or null to drop it); `opts.link(href)` can rewrite links.
 */
function inline(text, opts) {
  const kbd = [];
  // Keep <kbd>…</kbd> through the escape, everything else is text.
  let s = String(text).replace(/<kbd>(.*?)<\/kbd>/gi, (_, k) => {
    kbd.push(k);
    return `\uE000K${kbd.length - 1}\uE000`;
  });
  const code = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => {
    code.push(c);
    return `\uE000C${code.length - 1}\uE000`;
  });
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => {
    const m = src.match(/^shot:(.+)$/);
    const url = m ? opts.image?.(m[1], alt) : null;
    if (!url) return "";
    return `<img class="g-shot" src="${url}" alt="${alt}" loading="lazy">`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const h = opts.link ? opts.link(href.replace(/&amp;/g, "&")) : href;
    const ext = /^https?:/i.test(h);
    return `<a href="${esc(h)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>");
  s = s.replace(/\uE000C(\d+)\uE000/g, (_, n) => `<code>${esc(code[n])}</code>`);
  s = s.replace(/\uE000K(\d+)\uE000/g, (_, n) => `<kbd>${esc(kbd[n])}</kbd>`);
  return s;
}

const plain = (s) =>
  String(s)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<\/?kbd>/gi, "")
    .replace(/[*`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const CALLOUT = /^\*\*(Tip|Note|Important|Warning)\s*:?\*\*\s*:?\s*/i;

/**
 * Parse a guide body. Returns { html, toc, sections } where sections is
 * [{ id, title, level, text }] for search.
 */
export function renderGuide(body, opts = {}) {
  const lines = body.replace(/\t/g, "    ").split(/\r?\n/);
  const out = [];
  const toc = [];
  const sections = [];
  const used = new Set();
  let cur = { id: "", title: "", level: 1, text: [] };
  sections.push(cur);

  const uniq = (id) => {
    let k = id || "section";
    let n = 2;
    while (used.has(k)) k = `${id}-${n++}`;
    used.add(k);
    return k;
  };
  const addText = (t) => cur.text.push(plain(t));

  let i = 0;
  const isBlank = (l) => l === undefined || l.trim() === "";
  const isListItem = (l) => /^\s*(\d+[.)]|[-*+])\s+/.test(l || "");
  const startsBlock = (l) =>
    /^#{2,3}\s/.test(l) ||
    /^\s*>/.test(l) ||
    /^```/.test(l) ||
    /^\s*\|.*\|\s*$/.test(l) ||
    isListItem(l) ||
    /^\s*(---|\*\*\*)\s*$/.test(l);

  function parseList(baseIndent) {
    const first = lines[i].match(/^(\s*)(\d+[.)]|[-*+])\s+/);
    const ordered = /\d/.test(first[2]);
    const tag = ordered ? "ol" : "ul";
    const items = [];
    while (i < lines.length) {
      const l = lines[i];
      const m = l.match(/^(\s*)(\d+[.)]|[-*+])\s+(.*)$/);
      if (!m || m[1].length < baseIndent) break;
      if (m[1].length > baseIndent) break; // handled by the item above
      i++;
      let text = m[3];
      let nested = "";
      // Continuation lines and nested lists.
      while (i < lines.length) {
        const n = lines[i];
        if (isBlank(n)) {
          // A blank line ends the item unless the list carries on.
          const next = lines[i + 1];
          const nm = next?.match(/^(\s*)(\d+[.)]|[-*+])\s+/);
          if (nm && nm[1].length >= baseIndent) { i++; continue; }
          if (next && /^\s{2,}\S/.test(next) && !isListItem(next)) { i++; text += "<br>"; continue; }
          break;
        }
        const nm = n.match(/^(\s*)(\d+[.)]|[-*+])\s+/);
        if (nm && nm[1].length > baseIndent) { nested += parseList(nm[1].length); continue; }
        if (nm) break;
        if (/^\s*>/.test(n) && /^\s{2,}/.test(n)) {
          text += " " + n.replace(/^\s*>\s?/, "");
          i++;
          continue;
        }
        if (startsBlock(n) && !/^\s{2,}/.test(n)) break;
        text += " " + n.trim();
        i++;
      }
      addText(text);
      items.push(`<li>${inline(text, opts).replace(/&lt;br&gt;/g, "<br>")}${nested}</li>`);
    }
    return `<${tag}>${items.join("")}</${tag}>`;
  }

  while (i < lines.length) {
    const l = lines[i];
    if (isBlank(l)) { i++; continue; }

    const h = l.match(/^(#{2,3})\s+(.+?)\s*#*\s*$/);
    if (h) {
      const level = h[1].length;
      const title = h[2];
      const id = uniq(slugify(title));
      toc.push({ level, id, title: plain(title) });
      cur = { id, title: plain(title), level, text: [] };
      sections.push(cur);
      out.push(`<h${level} id="${id}">${inline(title, opts)}</h${level}>`);
      i++;
      continue;
    }

    if (/^```/.test(l)) {
      const buf = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) buf.push(lines[i]);
      i++;
      addText(buf.join(" "));
      out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }

    if (/^\s*>/.test(l)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      let text = buf.join("\n").trim();
      const m = text.match(CALLOUT);
      const kind = m ? m[1].toLowerCase() : "note";
      const label = m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : "";
      if (m) text = text.slice(m[0].length);
      addText(text);
      const paras = text
        .split(/\n\s*\n/)
        .map((p) => `<p>${inline(p.replace(/\n/g, " "), opts)}</p>`)
        .join("");
      out.push(
        `<aside class="g-callout g-${kind === "warning" ? "important" : kind}">` +
          (label ? `<span class="g-callout-label">${label}</span>` : "") +
          `${paras}</aside>`,
      );
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(lines[i].trim().slice(1, -1).split("|").map((c) => c.trim()));
        i++;
      }
      const isSep = (r) => r.every((c) => /^:?-{2,}:?$/.test(c));
      const head = rows.length > 1 && isSep(rows[1]) ? rows[0] : null;
      const bodyRows = head ? rows.slice(2) : rows.filter((r) => !isSep(r));
      rows.forEach((r) => addText(r.join(" ")));
      out.push(
        `<div class="g-table"><table>` +
          (head ? `<thead><tr>${head.map((c) => `<th>${inline(c, opts)}</th>`).join("")}</tr></thead>` : "") +
          `<tbody>${bodyRows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, opts)}</td>`).join("")}</tr>`).join("")}</tbody>` +
          `</table></div>`,
      );
      continue;
    }

    if (isListItem(l)) {
      out.push(parseList(l.match(/^(\s*)/)[1].length));
      continue;
    }

    if (/^\s*(---|\*\*\*)\s*$/.test(l)) { i++; continue; }
    if (/^#\s/.test(l)) { i++; continue; } // a stray H1: the page title owns it

    // Paragraph.
    const buf = [l.trim()];
    for (i++; i < lines.length && !isBlank(lines[i]) && !startsBlock(lines[i]); i++) {
      buf.push(lines[i].trim());
    }
    const text = buf.join(" ");
    addText(text);
    const html = inline(text, opts);
    // A paragraph that is only an image becomes a figure.
    if (/^<img [^>]+>$/.test(html)) {
      const alt = (html.match(/alt="([^"]*)"/) || [])[1] || "";
      out.push(`<figure class="g-figure">${html}${alt ? `<figcaption>${alt}</figcaption>` : ""}</figure>`);
    } else if (html) {
      out.push(`<p>${html}</p>`);
    }
  }

  return {
    html: out.join("\n"),
    toc,
    sections: sections
      .map((s) => ({ ...s, text: s.text.join(" ").trim() }))
      .filter((s) => s.title || s.text),
  };
}

/** Words in a guide body, for the reading-time line. */
export const wordCount = (body) =>
  plain(body.replace(/^\s*[|>#-]+/gm, " ")).split(/\s+/).filter(Boolean).length;
