// Richard's document engine, ported from adlm-studio-site assets/js/doc.js.
//
// One renderer produces every document the studio sends — quotation, invoice,
// receipt, bill of quantities, valuation, letter, report, statement — because
// the moment there are two, they drift. A spec is a plain object: a template
// name, an addressee, and a list of typed blocks. This module turns that into
// the HTML his doc.css styles.
//
// Ported rather than rewritten. The structure, the class names and the
// decisions behind them are his, including the ones that look like details and
// are not:
//
//   * A document a practice sends to its own client is NOT an ADLM document.
//     It carries none of our colour and none of our logo, only the structure
//     and a one-line credit. ADLM's identity is one brand among others, never
//     the fallback — see brandOf().
//   * A bill of quantities and a valuation are never ours, whoever generates
//     them: putting them on our letterhead would claim authorship of somebody
//     else's professional work. FIRM_ONLY enforces that.
//   * Nothing that can be computed is typed, and a line the library cannot
//     price is carried through unpriced rather than quietly totalled as free.
//
// The one thing deliberately NOT carried over is his hardcoded VAT constant.
// His engine assumes 7.5%; ours reads the rate from the same setting checkout
// charges against, so a quotation cannot promise a total the cart disagrees
// with. Callers pass the computed rows in.

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ₦, not N. A costing document from a Nigerian practice that says N480,000
// looks like a workaround for a missing glyph.
export function money(n, dp) {
  if (n == null || n === "") return "";
  if (typeof n === "string") return n;
  return `₦${Number(n).toLocaleString("en-NG", {
    minimumFractionDigits: dp || 0,
    maximumFractionDigits: dp || 0,
  })}`;
}

export function num(n) {
  if (n == null || n === "") return "";
  if (typeof n === "string") return n;
  return Number(n).toLocaleString("en-NG", { maximumFractionDigits: 2 });
}

export function when(iso) {
  if (!iso) return "";
  const d = String(iso).split("-");
  if (d.length !== 3) return String(iso);
  return `${Number(d[2])} ${MONTHS[Number(d[1]) - 1]} ${d[0]}`;
}

// ── brand ──────────────────────────────────────────────────────────────────

const ADLM = {
  name: "ADLM Studio",
  logo: "/ds/logo-light.svg",
  mark: "/ds/mark.svg", // icon only — the watermark is never the lockup
  site: "www.adlmstudio.net",
  social: "ADLM Studio",
  bank: { account: "1634998770", name: "ADLM Studio", bank: "Access Bank" },
  ink: "#091E39",
  accent: "#239CFF",
  band: "#E9F5FF",
  bandSoft: "#F6FBFF",
  credit: false, // ADLM does not credit itself on its own paper
  signature: null,
};

// A firm that has filled in nothing but its name still gets a document that
// looks deliberate: graphite rather than ADLM blue, which reads as neutral
// stationery instead of somebody else's brand.
const NEUTRAL = {
  ink: "#22303F",
  accent: "#C3CBD5",
  band: "color-mix(in srgb, #22303F 7%, #fff)",
  bandSoft: "color-mix(in srgb, #22303F 3.5%, #fff)",
};

const FIRM_ONLY = { boq: 1, valuation: 1 };

function brandOf(spec) {
  const given = (spec && spec.brand) || null;
  const firmOnly = spec && FIRM_ONLY[spec.template];
  const isADLM = !firmOnly && (!given || !given.name || given.name === ADLM.name);

  const b = { ...ADLM };

  if (!isADLM) {
    // Strip the identity back to neutral before the firm's own details go on,
    // so nothing of ours survives by being merely unspecified.
    b.logo = null;
    b.mark = null;
    b.site = "";
    b.social = "";
    b.bank = null;
    b.name = (given && given.name) || "Your practice";
    b.ink = NEUTRAL.ink;
    b.accent = NEUTRAL.accent;
    b.band = NEUTRAL.band;
    b.bandSoft = NEUTRAL.bandSoft;
    b.credit = true;
  }
  if (given) Object.assign(b, given);

  if (!isADLM && given && given.ink && given.band === undefined) {
    b.band = `color-mix(in srgb, ${given.ink} 8%, #fff)`;
    b.bandSoft = `color-mix(in srgb, ${given.ink} 4%, #fff)`;
  }
  if (!isADLM && given && given.credit === undefined) b.credit = true;
  return b;
}

const paletteStyle = (brand) =>
  `--doc-navy:${brand.ink};--doc-blue:${brand.accent};` +
  `--doc-band:${brand.band};--doc-band-soft:${brand.bandSoft}`;

// ── numbering ──────────────────────────────────────────────────────────────

const PREFIX = {
  invoice: "INV", receipt: "RCT", boq: "BOQ", valuation: "VAL",
  statement: "STM", letter: "LTR", report: "RPT",
};

export function docNumber(template, seq, year) {
  const p = PREFIX[template] || "DOC";
  const y = year || new Date().getFullYear();
  return `${p}-${y}-${String(seq == null ? 1 : seq).replace(/\D/g, "").padStart(4, "0")}`;
}

// Each template is a thin configuration of one frame: which chrome it carries,
// and whether it uses the wide invoice measure or the indented content measure.
const TEMPLATES = {
  invoice: { cls: "doc-invoice", band: false, tax: true },
  receipt: { cls: "doc-invoice", band: false, tax: true },
  boq: { cls: "doc-content", band: true, tax: false },
  valuation: { cls: "doc-content", band: true, tax: false },
  letter: { cls: "doc-content", band: true, tax: false },
  report: { cls: "doc-content", band: true, tax: false },
  statement: { cls: "doc-content", band: true, tax: false },
};

// ── chrome ─────────────────────────────────────────────────────────────────

const GLOBE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 2c1.6 0 3 2.8 3 6H9c0-3.2 1.4-6 3-6zM4.3 11H7c.1-2 .5-3.8 1.2-5.2A8 8 0 004.3 11zm0 2a8 8 0 003.9 5.2A13 13 0 017 13H4.3zm4.7 0h6c-.1 3.2-1.4 6-3 6s-2.9-2.8-3-6zm7.8 0h2.9a8 8 0 01-3.9 5.2c.6-1.4 1-3.2 1-5.2zm0-2c0-2-.4-3.8-1-5.2a8 8 0 013.9 5.2H16.8z"/></svg>';

const SOCIAL = ["i-in", "i-ig", "i-yt", "i-x"];

const socialDots = () =>
  SOCIAL.map(
    (id) =>
      '<svg viewBox="0 0 24 24" style="width:7.7pt;height:7.7pt;flex:none;' +
      'fill:none;stroke:currentColor;stroke-width:1.8;display:block"><use href="#' +
      `${id}"/></svg>`,
  ).join("");

// A practice that has not uploaded a mark still needs a letterhead. Falling
// back to ADLM's logo would put our brand on their paper, so the name is set
// as a wordmark instead.
function lockup(brand, h) {
  if (brand.logo) {
    return `<img class="doc-logo" src="${esc(brand.logo)}" alt="${esc(brand.name)}" style="height:${h}pt">`;
  }
  return `<span class="doc-word" style="font-size:${h * 0.62}pt">${esc(brand.name)}</span>`;
}

function frame(t, brand, page, pages) {
  let h = '<div class="doc-frame">';
  if (t.band) {
    h += '<div class="doc-band"></div>';
    let contact = "";
    if (brand.site) contact += `<div>${GLOBE}<span>${esc(brand.site)}</span></div>`;
    if (brand.social) {
      contact +=
        `<div><span class="doc-social">${socialDots()}</span>` +
        `<span>${esc(brand.social)}</span></div>`;
    }
    (brand.lines || []).forEach((l) => {
      contact += `<div><span>${esc(l)}</span></div>`;
    });
    h +=
      `<div class="doc-head">${lockup(brand, 26.6)}` +
      (contact ? `<div class="doc-contact">${contact}</div>` : "") +
      "</div>";
  }
  h += '<div class="doc-tab"></div>';
  h +=
    '<div class="doc-mark doc-m-arc"></div>' +
    '<div class="doc-mark doc-m-ring"></div>' +
    '<div class="doc-mark doc-m-dot"></div>' +
    '<div class="doc-mark doc-m-grid"></div>' +
    '<div class="doc-mark doc-m-x"></div>' +
    (brand.mark ? `<div class="doc-mark doc-m-logo"><img src="${esc(brand.mark)}" alt=""></div>` : "");
  h += '<div class="doc-rule"></div>';
  h +=
    '<div class="doc-pagefoot">' +
    `<span class="doc-credit">${brand.credit ? "Powered by ADLM Studio" : ""}</span>` +
    `<span>Page ${page} of ${pages}</span>` +
    "</div>";
  return `${h}</div>`;
}

// ── blocks ─────────────────────────────────────────────────────────────────

const cls = (a) => (a === "left" ? "doc-l" : a === "right" ? "doc-r" : "");

function table(b) {
  const cols = b.columns || [];
  let h =
    '<div class="doc-table-wrap"><table class="doc-table"><colgroup>' +
    cols.map((c) => `<col${c.width ? ` style="width:${c.width}"` : ""}>`).join("") +
    "</colgroup><thead><tr>" +
    cols.map((c) => `<th class="${cls(c.align)}">${esc(c.label)}</th>`).join("") +
    "</tr></thead><tbody>";

  (b.rows || []).forEach((r) => {
    if (r && r.group) {
      h += `<tr class="doc-group"><td class="doc-l" colspan="${cols.length}">${esc(r.group)}</td></tr>`;
      return;
    }
    if (r && r.subtotal) {
      h +=
        '<tr class="doc-sub">' +
        `<td class="doc-l" colspan="${cols.length - 1}">${esc(r.subtotal)}</td>` +
        `<td class="doc-r">${esc(money(r.value))}</td></tr>`;
      return;
    }
    const cells = r && r.cells ? r.cells : r;
    h +=
      `<tr${r && r.unpriced ? ' class="doc-unpriced"' : ""}>` +
      cols
        .map((c, i) => {
          let v = cells[i];
          if (c.money && typeof v === "number") v = money(v);
          else if (c.num && typeof v === "number") v = num(v);
          return `<td class="${cls(c.align)}">${esc(v)}</td>`;
        })
        .join("") +
      "</tr>";
  });
  return `${h}</tbody></table></div>`;
}

function totals(b) {
  const rows = b.rows || [];
  return (
    '<div class="doc-totals">' +
    rows
      .map(([label, value, kind]) =>
        `<div class="doc-bar${kind ? ` doc-${kind}` : ""}">` +
        `<span>${esc(label)}</span>` +
        `<span class="doc-amt">${esc(money(value))}</span></div>`,
      )
      .join("") +
    "</div>"
  );
}

const BLOCKS = {
  heading: (b) =>
    `<h2 class="doc-h${b.level === 1 ? " doc-h-1" : ""}${b.align === "center" ? " doc-c" : ""}">` +
    `${esc(b.text)}</h2>`,
  para: (b) => `<p class="doc-p">${esc(b.text)}</p>`,
  bullets: (b) =>
    `<ul class="doc-ul">${(b.items || []).map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`,
  keyvalue: (b) =>
    `<div class="doc-kv"><span class="doc-k">${esc(b.label)}</span>` +
    `<span class="doc-v">${(b.lines || []).map((l) => `<div>${esc(l)}</div>`).join("")}</span></div>`,
  hr: () => '<div class="doc-hr"></div>',
  spacer: (b) => `<div class="doc-spacer" style="height:${b.size || 12}pt"></div>`,
  table,
  totals,
  payment: (b, ctx) => {
    const bank = b.account ? b : ctx.brand.bank || {};
    return (
      '<div class="doc-pay"><b>Payment details:</b>' +
      `<div>Account no: ${esc(bank.account)}</div>` +
      `<div>Name: ${esc(bank.name)}</div>` +
      `<div>Bank: ${esc(bank.bank)}</div></div>`
    );
  },
  signature: (b, ctx) => {
    const img = b.image || ctx.brand.signature;
    return (
      '<div class="doc-sign">' +
      (img ? `<img src="${esc(img)}" alt="">` : '<div style="height:32.5pt"></div>') +
      '<div class="doc-line"></div>' +
      `<div class="doc-cap">${esc(b.label || "Authorized signature")}</div></div>`
    );
  },
};

// Payment and signature sit on one row pinned to the foot of the sheet.
function footRow(blocks, ctx) {
  let pay = null;
  let sig = null;
  const rest = [];
  const pinned = ctx && ctx.t && ctx.t.cls === "doc-invoice";
  blocks.forEach((b) => {
    if (b.type === "payment") pay = b;
    else if (b.type === "signature" && pinned) sig = b;
    else rest.push(b);
  });
  let row = "";
  if (pay || sig) {
    row =
      '<div class="doc-foot-row">' +
      (pay ? BLOCKS.payment(pay, ctx) : "<div></div>") +
      (sig ? BLOCKS.signature(sig, ctx) : "<div></div>") +
      "</div>";
  }
  return { blocks: rest, row };
}

const renderBlocks = (blocks, ctx) =>
  blocks
    .map((b) => {
      const fn = BLOCKS[b.type];
      return fn ? fn(b, ctx) : "";
    })
    .join("");

// The invoice carries its own head inside the flow rather than in the frame,
// because on that template the title is content: it changes per document.
const invoiceHead = (spec, brand) =>
  '<div class="doc-invhead">' +
  lockup(brand, 24) +
  `<div class="doc-title"><b>${esc(spec.title || "Invoice")}</b>` +
  (spec.number ? `<span>NO: ${esc(spec.number)}</span>` : "") +
  "</div></div>";

// ── render ─────────────────────────────────────────────────────────────────

export function render(spec) {
  spec = spec || {};
  const t = TEMPLATES[spec.template] || TEMPLATES.report;
  const brand = brandOf(spec);
  const ctx = { t, brand, spec };

  const f = footRow((spec.blocks || []).slice(), ctx);
  ctx.footRow = f.row;
  ctx.stamp = spec.stamp ? `<div class="doc-stamp">${esc(spec.stamp)}</div>` : "";

  let inner = "";
  if (t.cls === "doc-invoice") inner += invoiceHead(spec, brand);

  // The address is the one block that leaves the body column and sits on the
  // logo line, with the date opposite it. A document addressed to nobody — a
  // proposal, a report — simply has no address row and opens on its title.
  let addr = "";
  if (spec.to && spec.to.length) {
    addr += BLOCKS.keyvalue({ label: spec.toLabel || "INVOICE TO:", lines: spec.to });
  }
  if (spec.meta && spec.meta.length) {
    addr += BLOCKS.keyvalue({ label: spec.metaLabel || "DATE:", lines: spec.meta });
  }
  if (addr) {
    inner +=
      `<div class="doc-addr"><div>${addr}</div>` +
      (spec.date ? `<div class="doc-date">${esc(when(spec.date))}</div>` : "") +
      "</div>";
  }
  if (t.cls === "doc-invoice") inner += BLOCKS.hr();
  inner += renderBlocks(f.blocks, ctx);
  inner += f.row; // payment and signature, pinned to the foot

  return (
    `<div class="doc-sheet ${t.cls}" style="${paletteStyle(brand)}">` +
    frame(t, brand, 1, 1) +
    `<div class="doc-body">${inner}</div>` +
    ctx.stamp +
    "</div>"
  );
}

// Split one table wrapper into several, each carrying the header row.
function splitTable(wrap, tbl, firstRoom, fullRoom) {
  const head = tbl.querySelector("thead");
  const rows = [...tbl.querySelectorAll("tbody > tr")];
  if (!head || rows.length < 2) return [];
  const headH = head.offsetHeight;
  const out = [];
  let room = firstRoom - headH;
  let bucket = [];

  const flush = () => {
    const w = wrap.cloneNode(false);
    const t = tbl.cloneNode(false);
    const cg = tbl.querySelector("colgroup");
    if (cg) t.appendChild(cg.cloneNode(true));
    t.appendChild(head.cloneNode(true));
    const tb = document.createElement("tbody");
    bucket.forEach((r) => tb.appendChild(r));
    t.appendChild(tb);
    w.appendChild(t);
    out.push(w);
    bucket = [];
  };

  rows.forEach((r) => {
    const h = r.offsetHeight;
    if (h > room && bucket.length) {
      flush();
      room = fullRoom - headH;
    }
    bucket.push(r);
    room -= h;
  });
  if (bucket.length) flush();
  return out.length > 1 ? out : [];
}

// Render into a host element and paginate against the real geometry.
//
// Blocks are measured against the actual content box and distributed across as
// many sheets as they need; a table too tall for what is left is split row by
// row with its header re-emitted, so page 3 reads like page 1. That is the
// whole reason this is done here rather than left to the printer.
function paginate(host, ctx) {
  const sheets = host.querySelectorAll(".doc-sheet");
  if (!sheets.length) return;
  const first = sheets[0];
  const box = first.querySelector(".doc-body");
  if (!box) return;
  const limit = box.clientHeight;
  if (!limit) return;

  const foot = box.querySelector(".doc-foot-row");
  if (foot) foot.parentNode.removeChild(foot);
  const footHTML = ctx.footRow || (foot ? foot.outerHTML : "");

  const pages = [[]];
  let used = 0;

  [...box.children].forEach((el) => {
    const h = el.offsetHeight;
    const margin = parseFloat(getComputedStyle(el).marginBottom) || 0;
    if (used + h <= limit || !pages[pages.length - 1].length) {
      pages[pages.length - 1].push(el);
      used += h + margin;
      return;
    }
    const tbl = el.querySelector ? el.querySelector(".doc-table") : null;
    if (tbl && h > limit - used) {
      const split = splitTable(el, tbl, limit - used, limit);
      if (split.length) {
        pages[pages.length - 1].push(split[0]);
        for (let i = 1; i < split.length; i += 1) pages.push([split[i]]);
        used = split[split.length - 1].offsetHeight;
        return;
      }
    }
    pages.push([el]);
    used = h + margin;
  });

  const wrap = first.parentNode;
  const sheetCls = first.className;
  const made = [];
  pages.forEach((group, i) => {
    const sheet = document.createElement("div");
    sheet.className = sheetCls;
    sheet.setAttribute("style", ctx.palette || "");
    sheet.innerHTML = `${frame(ctx.t, ctx.brand, i + 1, pages.length)}<div class="doc-body"></div>`;
    const body = sheet.querySelector(".doc-body");
    group.forEach((el) => body.appendChild(el));
    if (i === pages.length - 1 && footHTML) body.insertAdjacentHTML("beforeend", footHTML);
    if (i === 0 && ctx.stamp) sheet.insertAdjacentHTML("beforeend", ctx.stamp);
    made.push(sheet);
  });
  [...sheets].forEach((s) => s.parentNode.removeChild(s));
  made.forEach((s) => wrap.appendChild(s));
}

export function mount(host, spec) {
  if (typeof host === "string") host = document.querySelector(host);
  if (!host) return null;
  const t = TEMPLATES[spec.template] || TEMPLATES.report;
  const brand = brandOf(spec);
  // t matters here: footRow only pins payment and signature on invoice-class
  // templates, so leaving it out would unpin the invoice's own foot row.
  const f = footRow((spec.blocks || []).slice(), { brand, t });
  host.innerHTML = render(spec);
  paginate(host, {
    t,
    brand,
    spec,
    footRow: f.row,
    palette: paletteStyle(brand),
    stamp: spec.stamp ? `<div class="doc-stamp">${esc(spec.stamp)}</div>` : "",
  });
  return host;
}

export default { render, mount, docNumber, money, num, when, esc };
