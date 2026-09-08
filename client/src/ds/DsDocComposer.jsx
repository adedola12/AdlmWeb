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
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { mount } from "./adlmDoc.js";
import "../styles/ds-admin.css";
import "../styles/ds-doc.css";
import { parseDocument } from "./docParser.js";

// The in-progress document, so a refresh does not lose it. NOT the library —
// that is on the server. See the note above readDraft.
const DRAFT_KEY = "adlm-doc-draft";

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

// ── where a document lives ─────────────────────────────────────────────────
//
// TWO STORES, DOING TWO DIFFERENT JOBS
//
// Saved documents live on the server. They used to live in localStorage,
// which meant one browser, one machine, one person: a quotation written on
// the office desktop could not be opened from a laptop, a colleague could not
// pick it up, and clearing site data threw work away silently.
//
// localStorage keeps ONE thing now — the document currently being typed, so a
// refresh or a closed tab does not lose an hour's work before anybody has
// pressed Save. That is a crash net, not a library, and the difference is
// worth keeping straight: the draft is private to this browser and is cleared
// the moment the document is saved properly.

function readDraft() {
  if (typeof window === "undefined") return null;
  try {
    const v = JSON.parse(window.localStorage.getItem(DRAFT_KEY));
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

function writeDraft(d) {
  try {
    if (d) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* storage unavailable — the document itself still renders and prints */
  }
}

const READABLE = /\.(txt|md|markdown|csv|tsv|json|html?)$/i;

// ── the screen ─────────────────────────────────────────────────────────────

export default function DsDocComposer() {
  const { accessToken } = useAuth();
  const [template, setTemplate] = React.useState("letter");
  const [title, setTitle] = React.useState("");
  const [number, setNumber] = React.useState("");
  const [to, setTo] = React.useState("");
  const [source, setSource] = React.useState(SAMPLE);
  const [kept, setKept] = React.useState([]);
  const [dropping, setDropping] = React.useState(false);
  const [problem, setProblem] = React.useState("");

  // The saved document being edited, if any. Saving with this set updates it
  // rather than making a second copy — otherwise a morning's editing leaves
  // twelve near-identical rows and no way to tell which one is current.
  const [editingId, setEditingId] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [note, setNote] = React.useState("");

  const host = React.useRef(null);

  // Restore whatever was being typed when the tab last closed. Runs once, and
  // only when there is something to restore that is not just the sample.
  React.useEffect(() => {
    const d = readDraft();
    if (!d || !d.source) return;
    setTemplate(d.template || "letter");
    setTitle(d.title || "");
    setNumber(d.number || "");
    setTo(d.to || "");
    setSource(d.source);
    setEditingId(d.editingId || null);
    setNote("Picked up where you left off.");
  }, []);

  const blocks = React.useMemo(() => parseDocument(source), [source]);

  // The crash net. Debounced, because writing to localStorage on every
  // keystroke of a long document is real work for no benefit.
  React.useEffect(() => {
    const t = setTimeout(() => {
      if (source && source !== SAMPLE) {
        writeDraft({ template, title, number, to, source, editingId });
      }
    }, 600);
    return () => clearTimeout(t);
  }, [template, title, number, to, source, editingId]);

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

  /** The library, from the server. */
  const refresh = React.useCallback(async () => {
    if (!accessToken) return;
    try {
      const r = await apiAuthed("/admin/docs/saved", { token: accessToken });
      setKept(r?.items || []);
    } catch {
      // A library that cannot be read is not a reason to stop writing, so the
      // composer carries on and says so quietly rather than blocking.
      setNote("Saved documents could not be listed just now.");
    }
  }, [accessToken]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const keep = React.useCallback(async () => {
    if (!source.trim()) {
      setProblem("There is nothing in it yet.");
      return;
    }
    setSaving(true);
    setNote("");
    try {
      const r = await apiAuthed("/admin/docs/saved", {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId || undefined,
          template,
          title: title.trim() || "Untitled",
          number: number.trim(),
          to: to.trim(),
          source,
          blocks: blocks.length,
        }),
      });
      setEditingId(r?.id || null);
      // The crash net has done its job the moment the document is really
      // saved, so it is cleared rather than left to shadow the saved version.
      writeDraft(null);
      setNote(r?.updated ? "Saved." : "Saved. It is in Saved documents now.");
      await refresh();
    } catch (err) {
      setProblem(
        err?.status === 401
          ? "Your admin session has expired. Sign in again — your work is still here."
          : "That could not be saved. Your work is still on screen.",
      );
    } finally {
      setSaving(false);
    }
  }, [accessToken, editingId, source, template, title, number, to, blocks, refresh]);

  /** Open one back into the composer, exactly as it was. */
  const open = React.useCallback(
    async (rec) => {
      setNote("");
      try {
        // The list does not carry the source — it would be a megabyte of
        // markup nobody is reading — so the document itself is fetched.
        const full = await apiAuthed(`/admin/docs/saved/${rec.id}`, { token: accessToken });
        setTemplate(full.template || "letter");
        setTitle(full.title === "Untitled" ? "" : full.title || "");
        setNumber(full.number || "");
        setTo(full.to || "");
        setSource(full.source || "");
        setEditingId(full.id);
        setNote(`Editing “${full.title}”. Saving updates it.`);
      } catch {
        setProblem("That document could not be opened.");
      }
    },
    [accessToken],
  );

  const drop = React.useCallback(
    async (id) => {
      try {
        await apiAuthed(`/admin/docs/saved/${id}`, { token: accessToken, method: "DELETE" });
        if (editingId === id) setEditingId(null);
        await refresh();
      } catch {
        setProblem("That could not be removed.");
      }
    },
    [accessToken, editingId, refresh],
  );

  /** A copy to work from, which is how most documents actually get written. */
  const duplicate = React.useCallback(
    async (id) => {
      try {
        const r = await apiAuthed(`/admin/docs/saved/${id}/duplicate`, {
          token: accessToken,
          method: "POST",
        });
        await refresh();
        setNote("Copied. The copy has no reference number of its own yet.");
        return r?.id;
      } catch {
        setProblem("That could not be copied.");
        return null;
      }
    },
    [accessToken, refresh],
  );

  /** Record that it went to somebody — which is what puts it in Issued. */
  const send = React.useCallback(
    async (id) => {
      const who = window.prompt("Who did it go to? A name, a firm or an address.");
      if (!who || !who.trim()) return;
      try {
        await apiAuthed(`/admin/docs/saved/${id}/send`, {
          token: accessToken,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: who.trim() }),
        });
        await refresh();
        setNote(`Recorded as sent to ${who.trim()}. It is in Issued now.`);
      } catch {
        setProblem("That could not be recorded.");
      }
    },
    [accessToken, refresh],
  );

  /** Start again, without carrying the last document's identity into the next. */
  const fresh = React.useCallback(() => {
    setEditingId(null);
    setTitle("");
    setNumber("");
    setTo("");
    setSource("");
    setNote("");
    writeDraft(null);
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
            {/* Only offered once there is a document to start again FROM, so
                the button cannot appear on an empty composer where it would
                do nothing. */}
            {editingId || source.trim() ? (
              <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={fresh}>
                New document
              </button>
            ) : null}
            <button
              type="button"
              className="ds-btn btn-o ds-btn-sm"
              disabled={saving}
              onClick={keep}
            >
              {saving ? "Saving…" : editingId ? "Save changes" : "Save it"}
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
              {note && !problem && <p className="adm-note">{note}</p>}
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
                {/* Not "on this machine" any more. They are on the server, so
                    a document written at the office opens on a laptop and a
                    colleague can pick it up. */}
                <h2>Saved documents</h2>
                <div className="adm-kept">
                  {kept.map((r) => (
                    <div className="adm-kept-row" key={r.id}>
                      <div>
                        <b>{r.title}</b>
                        <span>
                          {new Date(r.at).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                          })}
                          {" · "}
                          {r.templateName || r.template}
                          {r.sentAt ? " · sent" : ""}
                        </span>
                      </div>
                      <div>
                        <button
                          type="button"
                          className="ds-btn btn-o ds-btn-sm"
                          onClick={() => open(r)}
                        >
                          {editingId === r.id ? "Editing" : "Open"}
                        </button>
                        <button
                          type="button"
                          className="ds-btn btn-o ds-btn-sm"
                          title="A copy to work from"
                          onClick={() => duplicate(r.id)}
                        >
                          Copy
                        </button>
                        {/* Recording that it went out is what puts it in the
                            Issued register — including a document printed and
                            handed over, which an email-only log would miss. */}
                        {!r.sentAt ? (
                          <button
                            type="button"
                            className="ds-btn btn-o ds-btn-sm"
                            title="Record that it went to somebody"
                            onClick={() => send(r.id)}
                          >
                            Sent
                          </button>
                        ) : null}
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
