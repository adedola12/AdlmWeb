// The document composer — his /admin/documents, on our document engine.
//
// The document engine has two halves, and this is the ADLM one. The product
// side is GENERATED: a bill of quantities comes out of a project and nobody
// types it. This side is WRITTEN: somebody has a letter, a proposal or a fee
// note in their head or in a Word file, and needs it to come out looking like
// the same firm as the invoice. Both go through adlmDoc, which is the whole
// point — one renderer, or a client receives two things from us that do not
// look like they came from the same place.
//
// His parser is ported rule for rule, because every rule in it is a judgement
// about what a person meant rather than a syntax:
//
//   * A single separator line is NOT a table. One row with a pipe in it is a
//     sentence that happens to contain a pipe, and promoting it to a one-row
//     table is the kind of guess that makes a parser untrustworthy.
//   * A SHORT LINE IN CAPITALS is a heading, because that is how people write
//     headings when they are not writing markdown — which is most of the time.
//   * Short rows are padded, never dropped. A missing cell is a visible gap; a
//     dropped row is silent data loss.
//
// Held back deliberately: his click-to-edit-any-block-in-place. It is genuinely
// useful, but editing the rendered DOM fights our pagination — paginate()
// destroys and rebuilds every sheet, so an edit committed into a node that is
// about to be replaced is an edit thrown away. The source text is editable and
// re-renders live, which reaches the same place by a road that cannot lose
// work. Worth revisiting with a block-level editor that writes back to the
// spec rather than to the DOM.

import React from "react";
import { mount } from "./adlmDoc.js";
import "../styles/ds-admin.css";
import "../styles/ds-doc.css";
import { parseDocument } from "./docParser.js";

const KEEP_KEY = "adlm-admin-docs";
const KEEP_MAX = 12;

// His set, in his order. `tax` templates get the totals treatment; the rest
// are prose documents on the letterhead.
const TEMPLATES = [
  { id: "letter", name: "Letter", hint: "Correspondence on the letterhead" },
  { id: "report", name: "Report", hint: "Numbered sections and tables" },
  { id: "statement", name: "Statement", hint: "An account, with a balance" },
  { id: "invoice", name: "Invoice", hint: "Title right, totals, payment block" },
  { id: "receipt", name: "Receipt", hint: "An invoice marked paid" },
  { id: "boq", name: "Bill of quantities", hint: "Priced items under headings" },
  { id: "valuation", name: "Valuation", hint: "Work done to date" },
];

const SAMPLE = `PROPOSAL FOR QUANTITY SURVEYING SOFTWARE

Thank you for the meeting on Tuesday. This sets out what we discussed, with
the figures against each item so the total is not a surprise.

## What is included

- Six named products, on the machines your team already uses
- Rate libraries priced to the geopolitical zone the project sits in
- Two days of on-site training in Lagos

## The figures

Item | Qty | Amount
QUIV for Revit | 2 | 1,000,000
RateGen | 1 | 70,000
On-site training, Lagos | 1 | 350,000

The prices above hold for thirty days. Nothing is charged until you accept.`;

// ── kept documents ─────────────────────────────────────────────────────────

function readKept() {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(window.localStorage.getItem(KEEP_KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeKept(all) {
  try {
    window.localStorage.setItem(KEEP_KEY, JSON.stringify(all.slice(0, KEEP_MAX)));
  } catch {
    /* storage unavailable — the document itself still renders and prints */
  }
}

const READABLE = /\.(txt|md|markdown|csv|tsv|json|html?)$/i;

// ── the screen ─────────────────────────────────────────────────────────────

export default function DsDocComposer() {
  const [template, setTemplate] = React.useState("letter");
  const [title, setTitle] = React.useState("");
  const [number, setNumber] = React.useState("");
  const [to, setTo] = React.useState("");
  const [source, setSource] = React.useState(SAMPLE);
  const [kept, setKept] = React.useState(() => readKept());
  const [dropping, setDropping] = React.useState(false);
  const [problem, setProblem] = React.useState("");

  const host = React.useRef(null);

  const blocks = React.useMemo(() => parseDocument(source), [source]);

  const spec = React.useMemo(
    () => ({
      template,
      title: title.trim(),
      number: number.trim(),
      date: new Date().toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
      // An array of address lines, not a string — the engine renders one <div>
      // per line. Commas are how people type an address on one line.
      to: to
        .split(/\n|,/)
        .map((s) => s.trim())
        .filter(Boolean),
      toLabel: template === "invoice" || template === "receipt" ? "INVOICE TO:" : "TO:",
      blocks,
    }),
    [template, title, number, to, blocks],
  );

  // Re-render the document whenever anything it is made of changes. mount()
  // replaces the host's contents, so there is nothing to tear down.
  React.useEffect(() => {
    if (!host.current) return;
    try {
      mount(host.current, spec);
      setProblem("");
    } catch (e) {
      setProblem(e?.message || "That document could not be drawn.");
    }
  }, [spec]);

  const loadFile = React.useCallback((file) => {
    if (!file) return;
    if (!READABLE.test(file.name)) {
      setProblem(
        `${file.name} is not a text file. Paste the text instead, or save it as .txt, .md or .csv first.`,
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      let text = String(reader.result || "");
      // A .json export and a saved .html page both hold prose we can use, but
      // neither is prose yet.
      if (/\.json$/i.test(file.name)) {
        try {
          const v = JSON.parse(text);
          text = Array.isArray(v)
            ? v.map((r) => Object.values(r).join("\t")).join("\n")
            : JSON.stringify(v, null, 2);
        } catch {
          /* not valid JSON — treat what is there as text */
        }
      } else if (/\.html?$/i.test(file.name)) {
        const el = document.createElement("div");
        el.innerHTML = text;
        el.querySelectorAll("script,style").forEach((n) => n.remove());
        text = el.innerText;
      }
      setSource(text);
      if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
      setProblem("");
    };
    reader.onerror = () => setProblem(`${file.name} could not be read.`);
    reader.readAsText(file);
  }, [title]);

  const keep = React.useCallback(() => {
    const stamp = new Date();
    const rec = {
      id: `${stamp.toISOString()}-${Math.round(source.length)}`,
      made: stamp.toISOString(),
      template,
      title: title.trim() || "Untitled",
      number: number.trim(),
      to: to.trim(),
      source,
      blocks: blocks.length,
    };
    setKept((prev) => {
      const all = [rec, ...prev];
      writeKept(all);
      return all.slice(0, KEEP_MAX);
    });
  }, [source, template, title, number, to, blocks]);

  const open = React.useCallback((rec) => {
    setTemplate(rec.template || "letter");
    setTitle(rec.title === "Untitled" ? "" : rec.title || "");
    setNumber(rec.number || "");
    setTo(rec.to || "");
    setSource(rec.source || "");
  }, []);

  const drop = React.useCallback((id) => {
    setKept((prev) => {
      const all = prev.filter((r) => r.id !== id);
      writeKept(all);
      return all;
    });
  }, []);

  const counts = React.useMemo(() => {
    const n = { heading: 0, para: 0, bullets: 0, table: 0 };
    blocks.forEach((b) => {
      if (n[b.type] !== undefined) n[b.type] += 1;
    });
    const words = source.trim() ? source.trim().split(/\s+/).length : 0;
    return { ...n, words };
  }, [blocks, source]);

  return (
    <div className="ds">
      <div className="adm">
        <div className="adm-bar">
          <div>
            <h1>Documents</h1>
            <p className="adm-sub">
              Paste what you have written, or drop a file, and it comes out in the house style.
              The same renderer draws the invoices and the bills of quantities, which is why an
              ADLM letter and an ADLM invoice look like the same firm.
            </p>
          </div>
          <div className="adm-acts">
            <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={keep}>
              Keep this
            </button>
            <button type="button" className="ds-btn btn-p ds-btn-sm" onClick={() => window.print()}>
              Print or save as PDF
            </button>
          </div>
        </div>

        <div className="adm-split">
          <div className="adm-side">
            <div className="adm-grp">
              <h2>Template</h2>
              <div className="adm-tpls">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={template === t.id ? "adm-tpl on" : "adm-tpl"}
                    onClick={() => setTemplate(t.id)}
                    title={t.hint}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="adm-grp">
              <h2>Heading</h2>
              <div className="adm-fields">
                <label>
                  <span>Title</span>
                  <input
                    type="text"
                    value={title}
                    placeholder="Proposal for quantity surveying software"
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label>
                  <span>Reference</span>
                  <input
                    type="text"
                    value={number}
                    placeholder="ADLM-2026-0142"
                    onChange={(e) => setNumber(e.target.value)}
                  />
                </label>
                <label>
                  <span>Addressed to</span>
                  <input
                    type="text"
                    value={to}
                    placeholder="Adeyemi &amp; Partners, Ikoyi, Lagos"
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="adm-grp">
              <h2>The words</h2>
              <div
                className={dropping ? "adm-file on" : "adm-file"}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropping(true);
                }}
                onDragLeave={() => setDropping(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropping(false);
                  loadFile(e.dataTransfer?.files?.[0]);
                }}
              >
                <input
                  type="file"
                  accept=".txt,.md,.markdown,.csv,.tsv,.json,.html,.htm"
                  onChange={(e) => loadFile(e.target.files?.[0])}
                />
                <span>Drop a .txt, .md, .csv or .json here, or choose one</span>
              </div>

              <textarea
                className="adm-src"
                value={source}
                spellCheck
                onChange={(e) => setSource(e.target.value)}
                aria-label="The document text"
              />

              <div className="adm-src-foot">
                <span>
                  {counts.words} word{counts.words === 1 ? "" : "s"} · {counts.heading} heading
                  {counts.heading === 1 ? "" : "s"} · {counts.table} table
                  {counts.table === 1 ? "" : "s"} · {counts.bullets} list
                  {counts.bullets === 1 ? "" : "s"}
                </span>
                <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => setSource("")}>
                  Clear
                </button>
              </div>

              {problem && <p className="adm-note">{problem}</p>}
            </div>

            <div className="adm-grp">
              <h2>How it reads what you type</h2>
              <ul className="adm-rules">
                <li>
                  <b># Heading</b> makes a heading. So does A SHORT LINE IN CAPITALS.
                </li>
                <li>
                  <b>- item</b> makes a list.
                </li>
                <li>
                  Lines split by <b>|</b> or a tab make a table, first row the header. One row on
                  its own stays a sentence.
                </li>
                <li>A blank line ends whatever was running.</li>
              </ul>
            </div>

            {kept.length > 0 && (
              <div className="adm-grp">
                <h2>Kept on this machine</h2>
                <div className="adm-kept">
                  {kept.map((r) => (
                    <div className="adm-kept-row" key={r.id}>
                      <div>
                        <b>{r.title}</b>
                        <span>
                          {new Date(r.made).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                          })}
                          {" · "}
                          {TEMPLATES.find((t) => t.id === r.template)?.name || r.template}
                        </span>
                      </div>
                      <div>
                        <button
                          type="button"
                          className="ds-btn btn-o ds-btn-sm"
                          onClick={() => open(r)}
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          className="adm-x"
                          aria-label={`Remove ${r.title}`}
                          onClick={() => drop(r.id)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="adm-hint">
                  These live in this browser only. Nothing stores a document against the
                  account yet, so print or save the PDF for anything that matters.
                </p>
              </div>
            )}
          </div>

          <div className="adm-main">
            <div className="adm-out-bar">
              <span>Preview</span>
              <span className="adm-hint">A4 · what prints is what you see</span>
            </div>
            <div className="adm-out" ref={host} />
          </div>
        </div>
      </div>
    </div>
  );
}
