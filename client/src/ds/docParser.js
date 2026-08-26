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
      columns: head.map((c, i) => ({
        label: c,
        align: i ? "right" : "left",
        width: i ? `${Math.floor(46 / (head.length - 1))}%` : "54%",
      })),
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

    const m = l.match(/^(#{1,3})\s+(.*)$/);
    if (m) {
      flushAll();
      out.push({ type: "heading", level: m[1].length === 1 ? 1 : 2, text: m[2].trim() });
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
      out.push({ type: "heading", level: 2, text: titleCase(l) });
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
