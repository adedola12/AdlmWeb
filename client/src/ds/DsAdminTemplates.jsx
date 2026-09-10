// Templates — what the document engine can produce, and whose paper each one
// prints on.
//
// Ported from his site/assets/js/admin-docs.js, which draws this screen from
// a list of six: the five kinds the composer knows plus a proposal he has
// marked "asked for". Ours reads the same list from the engine and counts
// what has actually been made on each one, so the Used column is a fact
// rather than a number typed into an array.
//
// THE ASK BUTTON IS THE POINT OF THE SCREEN
//
// His note explains it better than a summary would: two of his templates are
// marked "asked for" and nothing on the screen could ask for one, so he added
// the form — "a template is built by a developer, the part that belongs here
// is saying what is needed and what it is for, so the request exists
// somewhere other than a conversation."
//
// Ours writes that request to the server rather than pushing it into an array
// that dies with the page. It appears on this list as "asked for" until the
// block exists in the engine.

import React from "react";
import { useNavigate } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmChip } from "./adminUi.jsx";
import { useAdmToast, checkFields } from "./adminKit.jsx";
import { AdmDrawer, AdmFields } from "./adminForm.jsx";

const num = (n) => new Intl.NumberFormat("en-NG").format(Number(n) || 0);

// His four questions, his labels, his hints, his paper sizes.
const FIELDS = [
  {
    k: "name",
    label: "What it is",
    type: "text",
    required: true,
    wide: true,
    placeholder: "Interim payment certificate",
  },
  {
    k: "what",
    label: "What it is for",
    type: "textarea",
    wide: true,
    rows: 2,
    required: true,
    hint: "One sentence. It is what the list says next to the name.",
  },
  {
    k: "paper",
    label: "Paper",
    type: "select",
    options: ["A4 portrait", "A4 landscape", "A3 landscape"],
  },
  {
    k: "needs",
    label: "What it needs",
    type: "textarea",
    wide: true,
    rows: 3,
    required: true,
    hint:
      "The blocks it cannot do without — a retention table, a signature pair, a running total " +
      "across pages. This is what gets built from.",
  },
];

const BLANK = { name: "", what: "", paper: "A4 portrait", needs: "" };

export default function DsAdminTemplates() {
  const { accessToken } = useAuth();
  const nav = useNavigate();
  const [say, toast] = useAdmToast();

  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [reload, setReload] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(null); // { mode, values, errors }

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    setD(null);
    apiAuthed("/admin/docs/templates", { token: accessToken })
      .then((r) => alive && setD(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken, reload]);

  async function ask() {
    const errs = checkFields(FIELDS, open.values);
    if (Object.keys(errs).length) {
      setOpen((o) => ({ ...o, errors: errs }));
      return;
    }
    setBusy(true);
    try {
      const r = await apiAuthed("/admin/docs/templates/requests", {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(open.values),
      });
      setOpen(null);
      setReload((n) => n + 1);
      say(`${r?.name || open.values.name} is on the list as asked for.`);
    } catch (err) {
      say(err?.message || "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  if (failed) {
    return <p className="adm-note">Templates could not be loaded just now. Please refresh.</p>;
  }

  const items = d?.items || [];

  const cols = [
    { h: "Template", w: "22%", cell: (t) => <AdmTwo top={t.name} under={t.what} /> },
    { h: "Paper", cell: (t) => t.paper },
    {
      // Counted from the documents actually made on it. Zero is information:
      // nobody has needed that one yet.
      h: "Used",
      num: true,
      cell: (t) => (t.used ? num(t.used) : <AdmDim>never</AdmDim>),
    },
    {
      h: "State",
      cell: (t) => (
        <AdmChip tone={t.built ? "ok" : "due"}>{t.built ? "built" : "asked for"}</AdmChip>
      ),
    },
    {
      h: "",
      cell: (t) => (
        <span className="adm-rowacts">
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            onClick={() => {
              // A quotation is built somewhere else — its own numbering, its
              // own share link — so sending it to the composer would be a
              // button that lies about where it goes.
              if (t.external) return nav("/admin/proposals");
              if (t.built) return nav("/admin/documents/compose");
              return say(t.needs || "Nothing was written down about what it needs.");
            }}
          >
            {t.external ? "Open its builder" : t.built ? "Open in the composer" : "What it needs"}
          </button>
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Templates</h1>
          <p className="adm-lede">
            What the engine can produce and whose paper each one prints on. These are the same
            templates a customer&rsquo;s exports come out of, which is why an ADLM invoice and a
            practice&rsquo;s bill of quantities look like the same firm made them.
          </p>
        </div>
        {/* His own hook for the page-level action bar, so "+ Ask for a
            template" sits where every screen of his puts its New button —
            #adm-page-acts carries the 4px that aligns it with the heading. */}
        <div id="adm-page-acts">
          <button
            type="button"
            className="ds-btn btn-p ds-btn-sm"
            onClick={() => setOpen({ mode: "ask", errors: {}, values: { ...BLANK } })}
          >
            + Ask for a template
          </button>
        </div>
      </div>

      {!d ? (
        <p className="adm-note">Reading…</p>
      ) : (
        <>
          <AdmTable
            cols={cols}
            rows={items}
            rowKey={(t) => t.id}
            empty={[
              "No templates",
              "The engine can produce nothing, which should not be possible.",
            ]}
          />

          <div className="adm-merge">
            <b>One renderer, two surfaces.</b>
            <span>
              These templates are the same ones a customer&rsquo;s exports come out of. An ADLM
              invoice and a practice&rsquo;s bill of quantities look like the same firm made them
              because neither side shapes a document itself.
            </span>
          </div>
        </>
      )}

      {open?.mode === "ask" ? (
        <AdmDrawer
          title="Ask for a template"
          intro="The renderer is shared with the customer’s own exports, so a new template is built once and both sides get it. Say what it has to carry."
          note="This records the request. Building it is developer work, and it will appear here as “built” when the block exists in the engine."
          onClose={() => setOpen(null)}
          foot={
            <>
              <button
                type="button"
                className="ds-btn btn-o ds-btn-sm"
                onClick={() => setOpen(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ds-btn btn-p ds-btn-sm"
                disabled={busy}
                onClick={ask}
              >
                {busy ? "Asking…" : "Ask for it"}
              </button>
            </>
          }
        >
          <AdmFields
            fields={FIELDS}
            values={open.values}
            errors={open.errors}
            onChange={(values) => setOpen((o) => ({ ...o, values }))}
          />
        </AdmDrawer>
      ) : null}

      {toast}
    </>
  );
}
