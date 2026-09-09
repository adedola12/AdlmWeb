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
import { sampleFor, ALL_SAMPLES } from "./docSamples.js";

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
  { id: "proposal", name: "Proposal", hint: "A cover line and a validity date" },
];


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
  const [source, setSource] = React.useState(() => sampleFor("letter"));
  const [kept, setKept] = React.useState([]);
  const [dropping, setDropping] = React.useState(false);
  const [problem, setProblem] = React.useState("");

  // The saved document being edited, if any. Saving with this set updates it
  // rather than making a second copy — otherwise a morning's editing leaves
  // twelve near-identical rows and no way to tell which one is current.
  const [editingId, setEditingId] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [showSource, setShowSource] = React.useState(true);

  // His PAPER toggle, and it is real rather than decorative: adlmDoc's
  // brandOf() strips our logo, site, socials and bank block and drops to a
  // neutral graphite palette the moment a firm name is given, so a practice's
  // bill of quantities carries their name and nothing of ours.
  const [paper, setPaper] = React.useState("adlm");
  const [firm, setFirm] = React.useState("");

  // The date on the sheet. It was hardcoded to today, which is wrong for a
  // document being written up after the fact or dated ahead of a meeting.
  const [docDate, setDocDate] = React.useState(() =>
    new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
  );

  // "Subject or reference" — the engine already renders it as a keyvalue row
  // beside the address, and nothing was filling it in.
  const [subject, setSubject] = React.useState("");
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

  /**
   * Choose a template.
   *
   * Each one now carries a worked example — a bill of quantities looks like a
   * bill of quantities, a receipt like a receipt — which is the only way the
   * picker teaches anything. But a template is also just the paper somebody
   * prints on, and switching it must never eat what they have written.
   *
   * So the example is swapped only while the box still holds an untouched
   * example. The moment a word is changed it is that person's document and
   * the template switch changes the paper alone.
   */
  const pickTemplate = React.useCallback(
    (id) => {
      setTemplate(id);
      setSource((cur) => (ALL_SAMPLES.includes(cur) || !cur.trim() ? sampleFor(id) : cur));
    },
    [],
  );

  /** Put the example back, on purpose. */
  const loadSample = React.useCallback(() => {
    setSource(sampleFor(template));
    setNote("The example is back. Editing it makes it yours.");
  }, [template]);

  // The crash net. Debounced, because writing to localStorage on every
  // keystroke of a long document is real work for no benefit.
  React.useEffect(() => {
    const t = setTimeout(() => {
      if (source && !ALL_SAMPLES.includes(source)) {
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
      date: docDate.trim(),
      // Null means ADLM's own stationery. A name means somebody else's, and
      // brandOf() takes our identity off rather than layering theirs over it.
      brand: paper === "practice" ? { name: firm.trim() || "Your practice" } : null,
      meta: subject.trim() ? subject.trim().split(/\n/).filter(Boolean) : null,
      metaLabel: "SUBJECT:",
      // An array of address lines, not a string — the engine renders one <div>
      // per line. Commas are how people type an address on one line.
      to: to
        .split(/\n|,/)
        .map((s) => s.trim())
        .filter(Boolean),
      toLabel: template === "invoice" || template === "receipt" ? "INVOICE TO:" : "TO:",
      blocks,
    }),
    [template, title, number, to, blocks, docDate, paper, firm, subject],
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
      {/*
        HIS SHELL IS NOT OUR SHELL

        This used to render <div className="adm">, which is his STANDALONE
        page: height:100dvh and a 296px | 1fr grid, because in his build the
        composer is the whole window and that grid is the nav beside it. Ours
        already has a rail and a top bar from DsAdminShell, so dropping his
        full-page shell inside our page shell put .adm-bar into a 296px column
        and pushed the rest off the edge — which is why the screen came up
        almost empty.

        This wrapper is ours: the composer's own three regions, sized to what
        is left of the viewport under the admin's top bar. Everything inside
        it is his — .adm-main, .adm-bar, .adm-split, .adm-src, .adm-out,
        .adm-side and the groups within them are styled by his admin.css.
      */}
      <div className="adm-compose">
        <div className="adm-main">
          <div className="adm-bar">
            <div>
              <b>
                {blocks.length} block{blocks.length === 1 ? "" : "s"} · {counts.words} word
                {counts.words === 1 ? "" : "s"}
                {counts.table ? ` · ${counts.table} table${counts.table === 1 ? "" : "s"}` : ""}
              </b>
              <span>
                {editingId ? "Editing a saved document — saving updates it" : "A new document"}
              </span>
            </div>
            <div className="adm-acts">
              <button
                type="button"
                className="ds-btn btn-o ds-btn-sm"
                onClick={() => setShowSource((v) => !v)}
              >
                {showSource ? "Hide source" : "Show source"}
              </button>
              {editingId || source.trim() ? (
                <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={fresh}>
                  New
                </button>
              ) : null}
              <button
                type="button"
                className="ds-btn btn-o ds-btn-sm"
                onClick={() => setSource("")}
              >
                Clear
              </button>
              <button
                type="button"
                className="ds-btn btn-o ds-btn-sm"
                disabled={saving}
                onClick={keep}
              >
                {saving ? "Saving…" : editingId ? "Save changes" : "Save"}
              </button>
              <button
                type="button"
                className="ds-btn btn-p ds-btn-sm"
                onClick={() => window.print()}
              >
                Print or save as PDF
              </button>
            </div>
          </div>

          <div className={showSource ? "adm-split" : "adm-split is-solo"}>
            {showSource ? (
              <div className={dropping ? "adm-src over" : "adm-src"}>
                <h3>What goes in</h3>
                <p className="adm-sub">
                  Paste the text, or drop a file anywhere on this panel. Plain text, Markdown,
                  CSV, TSV, JSON and HTML are all read here in the browser — the house style is
                  applied on the right.
                </p>

                <div
                  className="adm-file"
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
                  <span>or drop it here</span>
                </div>

                {/* id, not just a class: his rule is #adm-text, and it is what
                    gives the box its height, its monospace face and its
                    flex:1. Without the id the textarea collapsed to two rows. */}
                <textarea
                  id="adm-text"
                  value={source}
                  spellCheck
                  onChange={(e) => setSource(e.target.value)}
                  aria-label="The document text"
                />

                {problem && <p className="adm-note adm-bad">{problem}</p>}
                {note && !problem && <p className="adm-note">{note}</p>}

                <p className="adm-grp">What the formatter looks for</p>
                <ul className="adm-rules">
                    <li>
                      <b># Heading</b> makes a heading. So does A SHORT LINE IN CAPITALS.
                    </li>
                    <li>
                      <b>- item</b> makes a list.
                    </li>
                    <li>
                      Lines split by <b>|</b> or a tab make a table, first row the header. One row
                      on its own stays a sentence.
                    </li>
                  <li>
                    <b>![caption](url)</b> places a picture. So does{" "}
                    <b>!image url | caption</b>.
                  </li>
                  <li>A blank line ends whatever was running.</li>
                </ul>
              </div>
            ) : null}

            <div className="adm-out">
              <div className="adm-out-bar">
                <span>Preview</span>
                <span className="adm-hint">A4 · what prints is what you see</span>
              </div>
              {/* .adm-out .doc-stage is his rule for the scrolling sheet. */}
              <div className="doc-stage" ref={host} />
            </div>
          </div>
        </div>

        <aside className="adm-side">
          <p className="adm-grp">Paper</p>
          <div className="adm-seg">
            <button
              type="button"
              className={paper === "adlm" ? "on" : undefined}
              onClick={() => setPaper("adlm")}
            >
              ADLM
            </button>
            <button
              type="button"
              className={paper === "practice" ? "on" : undefined}
              onClick={() => setPaper("practice")}
            >
              A practice
            </button>
          </div>
          <p className="adm-hint">
            ADLM documents carry our mark and colour. A practice&rsquo;s carry theirs, with one
            line of credit in the footer — never our letterhead on their professional work.
          </p>
          {paper === "practice" ? (
            <div className="adm-fields" style={{ marginTop: 10 }}>
              <label>
                <span>The practice&rsquo;s name</span>
                <input
                  type="text"
                  value={firm}
                  placeholder="Adeyemi &amp; Partners"
                  onChange={(e) => setFirm(e.target.value)}
                />
              </label>
            </div>
          ) : null}

          <p className="adm-grp">Template</p>
          <div className="adm-tpls">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={template === t.id ? "adm-tpl on" : "adm-tpl"}
                  onClick={() => pickTemplate(t.id)}
                >
                  <b>{t.name}</b>
                  <span>{t.hint}</span>
                </button>
            ))}
          </div>

          <p className="adm-hint">
            Each template starts from a worked example — real products, real
            rates, real units. Change a word and it becomes your document.{" "}
            <button type="button" className="adm-linkish" onClick={loadSample}>
              Put the example back
            </button>
          </p>

          <p className="adm-grp">The document</p>
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
                <span>Number</span>
                <input
                  type="text"
                  value={number}
                  placeholder="Leave blank for none"
                  onChange={(e) => setNumber(e.target.value)}
                />
              </label>
            <label>
              <span>Date</span>
              <input
                type="text"
                value={docDate}
                placeholder="8 September 2026"
                onChange={(e) => setDocDate(e.target.value)}
              />
            </label>
            <label>
              <span>Addressed to</span>
              {/* A textarea, not an input: an address is three or four lines
                  and the engine renders one div per line. */}
              <textarea
                rows={3}
                value={to}
                placeholder={"The Managing Partner,\nAdeyemi & Partners,\nIkoyi, Lagos"}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <label>
              <span>Subject or reference</span>
              <textarea
                rows={2}
                value={subject}
                placeholder="BIM implementation across six workstations"
                onChange={(e) => setSubject(e.target.value)}
              />
            </label>
          </div>

          <p className="adm-grp">Saved documents</p>
          <div className="adm-saved">
            {kept.length === 0 ? (
              <p className="adm-hint">
                Nothing saved yet. Documents are kept on the server now, not in this browser, so
                one written here opens on any machine you sign in from.
              </p>
            ) : (
              <div className="adm-kept">
                {kept.map((r) => (
                  <div
                    className={editingId === r.id ? "adm-kept-row on" : "adm-kept-row"}
                    key={r.id}
                  >
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
                    <button
                      type="button"
                      className="ds-btn btn-o ds-btn-sm"
                      onClick={() => open(r)}
                    >
                      {editingId === r.id ? "Editing" : "Open"}
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
                ))}
              </div>
            )}

            {kept.length > 0 ? (
              <div className="adm-kept-acts">
                {/* Copy and Sent act on the document currently open, so they
                    are here rather than repeated on every row — four buttons
                    per row is how a list stops being readable. */}
                {editingId ? (
                  <>
                    <button
                      type="button"
                      className="ds-btn btn-o ds-btn-sm"
                      onClick={() => duplicate(editingId)}
                    >
                      Copy this
                    </button>
                    {!kept.find((r) => r.id === editingId)?.sentAt ? (
                      <button
                        type="button"
                        className="ds-btn btn-o ds-btn-sm"
                        onClick={() => send(editingId)}
                      >
                        Record as sent
                      </button>
                    ) : null}
                  </>
                ) : null}
                <a className="adm-kept-all" href="/admin/documents/saved">
                  See all saved documents
                </a>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
