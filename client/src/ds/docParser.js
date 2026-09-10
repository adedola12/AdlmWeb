// Turning what somebody typed into document blocks.
//
// Its own module for two reasons. Fast refresh only works when a file exports
// components alone, and the composer exported this beside one; and a parser
// with this many judgement calls in it deserves to be importable on its own
// for testing, which is how the all-caps table-row bug was caught.
//
// Ported from Richard's admin-doc.js rule for rule, because each rule is a
// judgement about what a person MEANT rather than a syntax. See the comments
// on each for what they are protecting against.

const trim = (s) => String(s).trim();

// A row of cells, if this line is one. Tabs win over pipes because a paste out
// of Excel is tab-separated and may legitimately contain a pipe.
function cellsOf(line) {
  if (line.indexOf("\t") >= 0) return line.split("\t").map(trim);
  if (line.indexOf("|") >= 0) return line.replace(/^\||\|$/g, "").split("|").map(trim);
  return null;
}

/* ------------------------------------------------------------- table columns

   These were a guess: 54% to the first column and the rest split evenly, with
   everything but the first right-aligned. That is the shape of an invoice —
   one wide description and a row of figures — and it is wrong for every table
   that is prose. On the programme outline it gave "Week" more room than "What
   participants do", and set five words of description hard against the right
   edge.

   So the table is measured instead. A column's width follows how much text is
   actually in it, damped by a power of 0.7 so that one very long column widens
   without swallowing the others, and clamped so no column is too narrow to
   hold its own heading. Alignment follows the content too: figures right,
   words left, decided by what is in the cells rather than by position.

   This is the piece that has to hold for a document nobody has seen yet, so it
   takes no view about what the table is for.                                */
const NUMLIKE = /^[₦$£€]?\s*[-+]?[\d][\d,.\s]*%?$/;

function measure(head, body) {
  const stat = head.map((label, i) => {
    let total = 0;
    let filled = 0;
    let numeric = 0;
    body.forEach((r) => {
      const v = String(r[i] == null ? "" : r[i]).trim();
      total += v.length;
      if (!v) return;
      filled++;
      if (NUMLIKE.test(v)) numeric++;
    });
    const mean = body.length ? total / body.length : 0;
    return {
      label,
      // The heading counts as content: a column of one-word answers under a
      // three-word heading still has to be wide enough for the heading.
      score: Math.max(String(label).length * 0.85, mean, 3),
      numeric: filled ? numeric / filled : 0,
    };
  });

  const raw = stat.map((c) => Math.pow(c.score, 0.7));
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  let pct = raw.map((x) => (x / sum) * 100);

  // Clamp, then give the difference back to the columns that were not clamped,
  // so the row still adds to 100.
  const MIN = 9;
  const MAX = 46;
  let fixed = 0;
  let free = 0;
  pct = pct.map((x) => {
    if (x < MIN) {
      fixed += MIN;
      return MIN;
    }
    if (x > MAX) {
      fixed += MAX;
      return MAX;
    }
    free += x;
    return x;
  });
  const room = 100 - fixed;
  if (free > 0 && room > 0) {
    pct = pct.map((x) => (x === MIN || x === MAX ? x : (x / free) * room));
  }

  return stat.map((c, i) => ({
    label: c.label,
    align: c.numeric >= 0.7 ? "right" : "left",
    width: `${Math.round(pct[i] * 10) / 10}%`,
  }));
}

function titleCase(s) {
  return String(s)
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

export function parseDocument(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let para = [];
  let bullets = [];
  let table = [];

  const flushPara = () => {
    if (!para.length) return;
    out.push({ type: "para", text: para.join(" ").trim() });
    para = [];
  };
  const flushBullets = () => {
    if (!bullets.length) return;
    out.push({ type: "bullets", items: bullets.slice() });
    bullets = [];
  };
  const flushTable = () => {
    if (table.length < 2) {
      // One row is not a table. Put it back as prose rather than inventing a
      // single-row table around it.
      table.forEach((r) => para.push(r.join(" ")));
      table = [];
      return;
    }
    const head = table[0];
    out.push({
      type: "table",
      columns: measure(head, table.slice(1)),
      rows: table.slice(1).map((r) => {
        const cells = r.slice(0, head.length);
        while (cells.length < head.length) cells.push("");
        return { cells };
      }),
    });
    table = [];
  };
  const flushAll = () => {
    flushTable();
    flushBullets();
    flushPara();
  };

  lines.forEach((raw) => {
    const l = raw.trim();
    if (!l) {
      flushAll();
      return;
    }

    // A markdown table's ---|--- rule carries no data.
    if (/^\|?[\s:-]*\|[\s|:-]*$/.test(l) && l.indexOf("-") >= 0) return;

    // A picture on its own line. Two spellings, because people arrive here
    // from two habits: markdown's ![caption](url), and the plainer
    // "!image url | caption" that reads as an instruction to somebody who has
    // never written markdown. A proposal with a site photograph in it is a
    // different document from one without.
    const img =
      l.match(/^!\[([^\]]*)\]\(([^)]+)\)$/) ||
      (() => {
        const mm = l.match(/^!image\s+(\S+)(?:\s*\|\s*(.*))?$/i);
        return mm ? [mm[0], mm[2] || "", mm[1]] : null;
      })();
    if (img) {
      flushAll();
      out.push({ type: "image", src: img[2].trim(), caption: (img[1] || "").trim() });
      return;
    }

    // Six hashes in, three levels out. Word documents and markdown both go
    // deeper than the sheet has sizes for, and a #### that parsed as nothing
    // used to land in the document as a paragraph beginning with hashes.
    const m = l.match(/^(#{1,6})\s+(.*)$/);
    if (m) {
      flushAll();
      out.push({ type: "heading", level: Math.min(3, m[1].length), text: m[2].trim() });
      return;
    }

    // A SHORT LINE IN CAPITALS is a heading in almost every document somebody
    // types without markdown.
    //
    // ...unless it is a table row. His version tests this before it tests for
    // cells, and "QUIV | 2 | 1,000,000" satisfies every clause of it — short,
    // no lowercase, three consecutive capitals, no closing full stop — so the
    // first row of a priced table became a heading and the rest of the table
    // collapsed into prose around it. Our product names are all capitals, so
    // this fires on the most ordinary document ADLM sends. A line carrying a
    // pipe or a tab is a row; nobody types a heading that way.
    if (
      l.length < 60 &&
      l === l.toUpperCase() &&
      /[A-Z]{3}/.test(l) &&
      !/[.!?]$/.test(l) &&
      !cellsOf(l)
    ) {
      flushAll();
      // The first one is the document's own name; the rest are sections. A
      // document that opens on a line in capitals is naming itself.
      out.push({ type: "heading", level: out.length ? 2 : 1, text: titleCase(l) });
      return;
    }

    const b = l.match(/^[-*•·]\s+(.*)$/);
    if (b) {
      flushTable();
      flushPara();
      bullets.push(b[1].trim());
      return;
    }

    const c = cellsOf(l);
    if (c && c.length > 1) {
      flushBullets();
      flushPara();
      table.push(c);
      return;
    }

    flushTable();
    flushBullets();
    para.push(l);
  });

  flushAll();
  return out;
}
