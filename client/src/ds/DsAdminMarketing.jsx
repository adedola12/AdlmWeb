// Marketing — the things on the website that change often.
//
// His screen exactly: one table for testimonials, free downloads and flyers,
// with a Kind column and — the part ours was missing entirely — a "Shows on"
// column naming where each thing appears.
//
// WHY THIS IS ONE SCREEN WHERE OURS HAD THREE
//
// Ours were three nav entries because they are three collections, which is a
// fact about the database rather than about the work. Somebody adding a
// testimonial and somebody adding a flyer are doing the same thing: putting
// something on the website and saying where it goes.
//
// WHY "SHOWS ON" IS THE COLUMN THAT MATTERS
//
// The panel can fill a table all day, but if the site has no place for the
// thing, a visitor never sees it. Four of our eight slots are not built —
// there is no customer proof on the home page, no public downloads page, and
// nothing renders a flyer — so anything filed against those is stored and
// ready and invisible. The row says so, and Put up refuses rather than
// leaving something marked live that nobody can see.
//
// THE SLOT DECIDES WHICH COLLECTION IT LANDS IN
//
// A testimonial is one of three things on our site — an industry leader's
// logo, a trained company, or a person's quote — and they live in three
// collections. Rather than asking somebody to know that, the slot they pick
// decides it. "Testimonials · industry leaders" writes an IndustryLeader.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmChip, AdmFilters } from "./adminUi.jsx";
import { useAdmToast, checkFields } from "./adminKit.jsx";
import { AdmDrawer, AdmFields } from "./adminForm.jsx";

/** Which collection a slot writes to. See the note at the top. */
const SOURCE_FOR_SLOT = {
  "testimonials-leaders": "leader",
  "testimonials-companies": "company",
  "testimonials-people": "person",
  "home-proof": "person",
  "members-freebies": "freebie",
  "resources-public": "freebie",
  "home-banner": "flyer",
  "events-art": "flyer",
};

const KINDS = [
  ["Testimonial", "Testimonial"],
  ["Freebie", "Freebie"],
  ["Flyer", "Flyer"],
];

/** His thumb: the file named, so a missing one is obvious at a glance. */
const shortFile = (f) => String(f || "").split("/").pop();

export default function DsAdminMarketing() {
  const { accessToken } = useAuth();
  const [say, toast] = useAdmToast();

  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [view, setView] = React.useState("all");
  const [reload, setReload] = React.useState(0);
  const [form, setForm] = React.useState(null);
  const [confirming, setConfirming] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    setD(null);
    apiAuthed("/admin/lc/marketing", { token: accessToken })
      .then((r) => alive && setD(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken, reload]);

  // Memoised because it feeds two other memos: a fresh [] each render would
  // rebuild the slot map and the field spec on every keystroke in the drawer.
  const slots = React.useMemo(() => d?.slots || [], [d]);
  const slotById = React.useMemo(
    () => new Map(slots.map((s) => [s.id, s])),
    [slots],
  );

  async function write(path, { method = "POST", body, ok } = {}) {
    setBusy(true);
    try {
      await apiAuthed(path, {
        token: accessToken,
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      setReload((n) => n + 1);
      if (ok) say(ok);
      return true;
    } catch (err) {
      say(err?.message || "That could not be saved.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  /* ── the drawer's fields, which change with what is being added ────────── */

  const FIELDS = React.useMemo(() => {
    const forKind = (k) => slots.filter((s) => s.takes === k);
    return [
      { k: "kind", label: "What is it", type: "select", wide: true, options: KINDS },
      { k: "title", label: "Name", type: "text", required: true, wide: true },
      {
        k: "quote",
        label: "What it says",
        type: "textarea",
        rows: 3,
        wide: true,
        required: true,
        hint:
          "For a testimonial this is their words, and it sits under their logo. For a freebie " +
          "or a flyer it is the line that makes somebody click.",
      },
      {
        k: "by",
        label: "Said by",
        type: "text",
        wide: true,
        when: (v) => v.kind === "Testimonial",
        placeholder: "QS Babajide Gbajumo, Managing Partner",
        hint: "Name and role. A quote with nobody behind it convinces nobody.",
      },
      {
        k: "file",
        label: (v) => (v?.kind === "Testimonial" ? "Their logo" : "The artwork"),
        type: "file",
        wide: true,
        accept: "image/*",
        hint:
          "SVG or PNG on a transparent background. It sits in a row of logos, so it should read " +
          "at about 120px wide.",
      },
      {
        k: "downloadUrl",
        label: "The file people download",
        type: "text",
        wide: true,
        when: (v) => v.kind === "Freebie",
        hint: "A link to the document itself — this is the thing they came for.",
        check: (v) => (v && !/^https?:\/\//.test(v) ? "That is not a link." : null),
      },
      {
        k: "slot",
        label: "Where it shows on the website",
        type: "select",
        wide: true,
        required: true,
        reqMsg: "Pick where it appears, or nobody will ever see it.",
        options: (v) => [
          ["", "Pick a place"],
          ...forKind(v?.kind || "Testimonial").map((s) => [
            s.id,
            s.built ? s.name : `${s.name} — not built yet`,
          ]),
        ],
      },
    ];
  }, [slots]);

  const openForm = (row) =>
    setForm({
      row,
      errors: {},
      values: row
        ? {
            kind: row.kind,
            title: row.title,
            quote: row.quote,
            by: [row.role, row.company].filter(Boolean).join(", "),
            file: row.file || "",
            downloadUrl: row.downloadUrl || "",
            slot: row.slot || "",
          }
        : { kind: "Testimonial", title: "", quote: "", by: "", file: "", slot: "" },
    });

  async function save() {
    const errs = checkFields(FIELDS, form.values);
    if (Object.keys(errs).length) {
      setForm((f) => ({ ...f, errors: errs }));
      return;
    }
    const v = form.values;
    const [role, ...rest] = String(v.by || "").split(",");
    const body = {
      source: SOURCE_FOR_SLOT[v.slot] || "person",
      title: v.title,
      quote: v.quote,
      role: rest.length ? rest.join(",").trim() : "",
      company: rest.length ? role.trim() : String(v.by || "").trim(),
      file: v.file,
      downloadUrl: v.downloadUrl,
      slot: v.slot,
    };
    const isNew = !form.row;
    const done = await write(
      isNew ? "/admin/lc/marketing" : `/admin/lc/marketing/${form.row.id}`,
      {
        method: isNew ? "POST" : "PUT",
        body,
        ok: isNew
          ? `${v.title} was added. It is not showing yet — put it up when you are ready.`
          : `${v.title} was saved.`,
      },
    );
    if (done) setForm(null);
  }

  if (failed) {
    return <p className="adm-note">Marketing could not be loaded just now. Please refresh.</p>;
  }

  const items = (d?.items || []).filter((m) => view === "all" || m.kind === view);
  const counts = d?.counts || {};

  const cols = [
    { h: "Item", w: "26%", cell: (m) => <AdmTwo top={m.title} under={m.quote} /> },
    { h: "Kind", cell: (m) => m.kind },
    {
      h: "File",
      w: "16%",
      // The thing itself. A flyer with no artwork is not a flyer.
      cell: (m) => {
        if (!m.file) {
          return (
            <span className="adm-warn">
              no {m.kind === "Testimonial" ? "logo" : m.kind === "Flyer" ? "artwork" : "file"}{" "}
              uploaded
            </span>
          );
        }
        // A freebie is a document — there is nothing to look at, so it says
        // what it is rather than pretending to show it.
        if (m.fileKind === "doc") return <AdmTwo top={shortFile(m.file)} under="document" />;
        return (
          <span className="adm-media-cell">
            <span className="adm-thumb">{shortFile(m.file)}</span>
          </span>
        );
      },
    },
    {
      h: "Shows on",
      cell: (m) => {
        const s = slotById.get(m.slot);
        if (!s) return <AdmDim>nowhere</AdmDim>;
        if (!s.built) {
          return (
            <span className="adm-two">
              <b>{s.name}</b>
              <span className="adm-warn">this slot does not exist on the site yet</span>
            </span>
          );
        }
        return <AdmTwo top={s.name} under={s.where} />;
      },
    },
    {
      h: "State",
      cell: (m) => (
        <AdmChip tone={m.live ? "ok" : "calm"}>{m.live ? "on the site" : "not showing"}</AdmChip>
      ),
    },
    {
      h: "",
      cell: (m) => {
        if (confirming === m.id) {
          return (
            <span className="adm-log">
              <b>Delete {m.title}?</b>
              <button
                type="button"
                className="ds-btn ds-btn-sm btn-o adm-danger"
                disabled={busy}
                onClick={async () => {
                  const done = await write(`/admin/lc/marketing/${m.id}`, {
                    method: "DELETE",
                    ok: `${m.title} was deleted.`,
                  });
                  if (done) setConfirming(null);
                }}
              >
                Delete it
              </button>
              <button type="button" className="adm-b" onClick={() => setConfirming(null)}>
                Keep it
              </button>
            </span>
          );
        }
        return (
          <span className="adm-rowacts">
            <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => openForm(m)}>
              Edit
            </button>
            <button
              type="button"
              className={`ds-btn ds-btn-sm ${m.live ? "btn-o adm-danger" : "btn-p"}`}
              disabled={busy}
              onClick={() =>
                write(`/admin/lc/marketing/${m.id}/publish`, {
                  body: { published: !m.live },
                  ok: m.live ? `${m.title} has been taken down.` : `${m.title} is on the site.`,
                })
              }
            >
              {m.live ? "Take down" : "Put up"}
            </button>
            <button type="button" className="adm-b" onClick={() => setConfirming(m.id)}>
              Delete
            </button>
          </span>
        );
      },
    },
  ];

  const unbuilt = d?.unbuilt || [];

  return (
    <>
      {toast}

      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Marketing</h1>
          <p className="adm-lede">
            The things on the website that change often: testimonials and company logos, free
            resources, and the flyers.
          </p>
        </div>
        <div className="adm-acts">
          {/* One button. The drawer asks what kind on its first field, so three
              buttons would be three ways to open the same form. */}
          <button type="button" className="ds-btn btn-p ds-btn-sm" onClick={() => openForm(null)}>
            + Add to the website
          </button>
        </div>
      </div>

      <AdmFilters
        current={view}
        onPick={setView}
        options={[
          ["all", "All", counts.all],
          ["Testimonial", "Testimonial", counts.Testimonial],
          ["Freebie", "Freebie", counts.Freebie],
          ["Flyer", "Flyer", counts.Flyer],
        ]}
      />

      {!d ? (
        <p className="adm-note">Reading the register…</p>
      ) : (
        <>
          <AdmTable
            cols={cols}
            rows={items}
            rowKey={(m) => m.id}
            empty={["Nothing yet", "Nothing has been put on the website from here."]}
          />

          {unbuilt.length ? (
            <div className="adm-merge">
              <b>
                {unbuilt.length} of these places {unbuilt.length === 1 ? "does" : "do"} not exist
                yet.
              </b>
              <span>
                The website has no {unbuilt.map((s) => s.name).join(", ")}. Anything filed against
                one of those is stored and ready, but a visitor will not see it until the place is
                built into the site.
              </span>
            </div>
          ) : null}
        </>
      )}

      {form ? (
        <AdmDrawer
          title={form.row ? `Edit ${form.row.title}` : "Add to the website"}
          intro={
            form.row
              ? null
              : "A testimonial, a free download or a flyer. Each one appears somewhere on the " +
                "site — pick where, and upload the thing itself."
          }
          onClose={() => setForm(null)}
          foot={
            <>
              <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => setForm(null)}>
                Cancel
              </button>
              <button type="button" className="ds-btn btn-p ds-btn-sm" disabled={busy} onClick={save}>
                {busy ? "Saving…" : form.row ? "Save it" : "Add it"}
              </button>
            </>
          }
        >
          <AdmFields
            fields={FIELDS}
            values={form.values}
            errors={form.errors}
            onChange={(values) => setForm((f) => ({ ...f, values }))}
          />
        </AdmDrawer>
      ) : null}
    </>
  );
}
