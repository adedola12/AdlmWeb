// Ada's replies, rendered (R17, 2026-09-18).
//
// A small, safe subset of Markdown turned into React elements: no
// dangerouslySetInnerHTML and no new dependency, so nothing in a reply can
// become markup it was not meant to be. Handled: paragraphs and line breaks,
// **bold**, *italics*, bullet and numbered lists, tables, [links](https://…)
// and bare https links. Headings print as a bold line and code as plain text.
// A stray asterisk never shows (the earlier "remove the asterisks" rule).
//
// Links: http(s) opens in a new tab; a site path ("/pricing") goes through
// onNavigate when given. Anything else (javascript:, data:) stays as words.

import React from "react";

const INLINE =
  /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+?)\*\*|__([^_\n]+?)__|`([^`\n]+)`|\*([^*\s\n][^*\n]*?)\*|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

const clean = (s) => s.replace(/\*+/g, "");

function safeHref(href) {
  const h = String(href || "").trim();
  if (/^https?:\/\//i.test(h)) return { href: h, external: true };
  if (/^\/(?!\/)/.test(h)) return { href: h, external: false };
  if (/^mailto:[^\s]+$/i.test(h)) return { href: h, external: true };
  return null;
}

function Anchor({ href, children, onNavigate }) {
  const safe = safeHref(href);
  if (!safe) return <>{children}</>;
  if (safe.external) {
    return (
      <a href={safe.href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return (
    <a
      href={safe.href}
      onClick={(e) => {
        if (!onNavigate || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onNavigate(safe.href);
      }}
    >
      {children}
    </a>
  );
}

/** Inline marks inside one line of text. */
function inline(text, opts = {}, keyBase = "i") {
  const out = [];
  const s = String(text ?? "");
  let last = 0;
  let k = 0;
  // Its own regex per call: the marks nest, and a shared global regex would
  // have the inner call reset the outer one's position.
  const re = new RegExp(INLINE.source, "g");
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push(clean(s.slice(last, m.index)));
    const key = `${keyBase}${k++}`;
    if (m[1] !== undefined) {
      out.push(
        <Anchor key={key} href={m[2]} onNavigate={opts.onNavigate}>
          {inline(m[1], opts, `${key}.`)}
        </Anchor>,
      );
    } else if (m[3] !== undefined || m[4] !== undefined) {
      out.push(<strong key={key}>{inline(m[3] ?? m[4], opts, `${key}.`)}</strong>);
    } else if (m[5] !== undefined) {
      out.push(m[5]);
    } else if (m[6] !== undefined) {
      out.push(<em key={key}>{inline(m[6], opts, `${key}.`)}</em>);
    } else if (m[7] !== undefined) {
      out.push(
        <Anchor key={key} href={m[7]}>
          {m[7].replace(/^https?:\/\//, "")}
        </Anchor>,
      );
    }
    last = re.lastIndex;
  }
  if (last < s.length) out.push(clean(s.slice(last)));
  return out.filter((x) => x !== "");
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBER = /^\s*(\d+)[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const cells = (line) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

/** Split a reply into blocks: paragraphs, lists and tables. */
function blocks(text) {
  const lines = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => !/^\s*```/.test(l));
  const out = [];
  let para = [];
  const flush = () => {
    if (para.length) out.push({ type: "p", lines: para });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      flush();
      continue;
    }
    if (TABLE_ROW.test(line) && TABLE_RULE.test(lines[i + 1] || "")) {
      flush();
      const head = cells(line);
      const rows = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i])) rows.push(cells(lines[i++]));
      i -= 1;
      out.push({ type: "table", head, rows });
      continue;
    }
    const b = line.match(BULLET);
    const n = !b && line.match(NUMBER);
    if (b || n) {
      flush();
      const type = b ? "ul" : "ol";
      const items = [];
      const start = n ? Number(n[1]) : 1;
      while (i < lines.length) {
        const mb = lines[i].match(BULLET);
        const mn = !mb && lines[i].match(NUMBER);
        if (type === "ul" ? mb : mn) items.push(type === "ul" ? mb[1] : mn[2]);
        else break;
        i += 1;
      }
      i -= 1;
      out.push({ type, items, start });
      continue;
    }
    const h = line.match(HEADING);
    if (h) {
      flush();
      out.push({ type: "h", text: h[1] });
      continue;
    }
    para.push(line);
  }
  flush();
  return out;
}

/**
 * @param {object} p
 * @param {string} p.text
 * @param {(path: string) => void} [p.onNavigate]  for links to a page of the site
 */
export default function ChatMarkdown({ text, onNavigate }) {
  const opts = { onNavigate };
  return (
    <div className="ada-md">
      {blocks(text).map((b, i) => {
        if (b.type === "p") {
          return (
            <p key={i}>
              {b.lines.map((l, j) => (
                <React.Fragment key={j}>
                  {j ? <br /> : null}
                  {inline(l, opts, `${i}.${j}.`)}
                </React.Fragment>
              ))}
            </p>
          );
        }
        if (b.type === "h") {
          return (
            <p key={i}>
              <strong>{inline(b.text, opts, `${i}.`)}</strong>
            </p>
          );
        }
        if (b.type === "table") {
          return (
            <div key={i} className="ada-md-tbl">
              <table>
                <thead>
                  <tr>
                    {b.head.map((c, j) => (
                      <th key={j}>{inline(c, opts, `${i}.h${j}.`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr key={j}>
                      {r.map((c, k) => (
                        <td key={k}>{inline(c, opts, `${i}.${j}.${k}.`)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        const List = b.type === "ol" ? "ol" : "ul";
        return (
          <List key={i} start={b.type === "ol" && b.start !== 1 ? b.start : undefined}>
            {b.items.map((it, j) => (
              <li key={j}>{inline(it, opts, `${i}.${j}.`)}</li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
