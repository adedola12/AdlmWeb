// Courses — the free videos and the paid courses in one register.
//
// His screen, his columns, his row actions. They are one screen because they
// are the same object with a price on one of them: both are a card on the
// public Learn page, both need a cover, and the question asked of both is
// whether anybody is getting through it.
//
// WHY "WHERE THEY STALL" IS A COLUMN AND NOT A TOOL
//
// It is the single most useful thing a course can tell you, and it was buried
// in a separate Course Cockpit screen nobody opened. The server walks each
// course's modules in order and names the one with the largest fall in
// completions from the module before it. Not the module with the fewest
// completions, which is always the last one and says nothing.
//
// THE PUBLISH GUARDS ARE HIS, AND THEY ARE ENFORCED ON BOTH SIDES
//
// A course cannot go live half-recorded — somebody who pays for eight modules
// and finds four is a refund — and cannot go live without a cover, or it is a
// grey box on the Learn page. The button says why it refuses rather than
// failing quietly. The server checks the same two things, because a guard that
// only exists in the browser is a suggestion.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmChip, AdmFilters } from "./adminUi.jsx";
import { useAdmToast, checkFields } from "./adminKit.jsx";
import { AdmDrawer, AdmFields } from "./adminForm.jsx";

const money = (n) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const num = (n) => new Intl.NumberFormat("en-NG").format(Number(n) || 0);

/** His thumb cell: the file, named, so a missing one is obvious at a glance. */
function Thumb({ src }) {
  return (
    <span className="adm-media-cell">
      <span className="adm-thumb">{String(src).split("/").pop()}</span>
    </span>
  );
}

const COURSE_FIELDS = [
  {
    k: "kind",
    label: "Kind",
    type: "select",
    options: [
      ["paid", "Paid course"],
      ["free", "Free video"],
    ],
  },
  {
    k: "sku",
    label: "SKU",
    type: "text",
    when: (v) => v.kind === "paid",
    required: true,
    placeholder: "CRS-BW-01",
    hint: "What the order line says when somebody buys it.",
  },
  { k: "name", label: "Title", type: "text", required: true, wide: true },
  {
    k: "blurb",
    label: "The line on the card",
    type: "textarea",
    wide: true,
    rows: 2,
    required: true,
    hint: "One sentence. It is what a visitor reads before deciding to click.",
  },
  {
    k: "cover",
    label: "Cover image",
    type: "file",
    wide: true,
    accept: "image/*",
    hint:
      "The card on the Learn page. 16:9, at least 1200px wide. Without it the course cannot " +
      "be published.",
  },
  {
    k: "pkind",
    label: "Where the video lives",
    type: "select",
    wide: true,
    options: [
      ["upload", "Uploaded to ADLM"],
      ["youtube", "A YouTube link"],
    ],
    hint: "A paid course should be uploaded — a YouTube link is public however unlisted.",
  },
  {
    k: "psrc",
    label: "Preview clip",
    type: "file",
    wide: true,
    accept: "video/*",
    when: (v) => v.pkind !== "youtube",
    hint: "The short clip that plays on the card. Under a minute, and no sound needed.",
  },
  {
    k: "psrc",
    label: "YouTube link",
    type: "text",
    wide: true,
    when: (v) => v.pkind === "youtube",
    placeholder: "https://youtu.be/…",
    check: (v) => (v && !/^https?:\/\//.test(v) ? "That is not a link." : null),
  },
  {
    k: "price",
    label: "Per seat",
    type: "number",
    prefix: "₦",
    when: (v) => v.kind === "paid",
    required: true,
    reqMsg: "A paid course needs a price.",
  },
  {
    k: "published",
    label: "Show it on the Learn page now",
    type: "check",
    hint: "A course with modules still to record cannot be published.",
  },
];

export default function DsAdminCourses() {
  const { accessToken } = useAuth();
  const [say, toast] = useAdmToast();

  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [view, setView] = React.useState("all");
  const [reload, setReload] = React.useState(0);

  const [form, setForm] = React.useState(null); // { course|null, values, errors }
  const [peek, setPeek] = React.useState(null); // a course, for its modules
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    setD(null);
    apiAuthed("/admin/lc/courses", { token: accessToken })
      .then((r) => alive && setD(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken, reload]);

  const items = (d?.items || []).filter((c) => view === "all" || c.kind === view);
  const counts = d?.counts || {};

  /* ── publishing ───────────────────────────────────────────────────────── */

  async function togglePublish(c) {
    // His two guards, said as sentences rather than as a disabled button with
    // no explanation.
    if (!c.published) {
      if (c.modules && c.recorded < c.modules) {
        const short = c.modules - c.recorded;
        say(
          `Cannot publish ${c.name} — ${short} module${short === 1 ? " has" : "s have"} no video. ` +
            "Somebody would pay for a course that is not there.",
        );
        return;
      }
      if (!c.cover) {
        say(`Cannot publish ${c.name} without a cover — it would be a grey box on the Learn page.`);
        return;
      }
    }
    setBusy(true);
    try {
      await apiAuthed(`/admin/lc/courses/${c.id}/publish`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: c.kind, published: !c.published }),
      });
      setReload((n) => n + 1);
      say(`${c.name} ${c.published ? "is hidden from the site." : "is live on the site."}`);
    } catch (err) {
      say(err?.message || "That could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  /* ── the editor ───────────────────────────────────────────────────────── */

  const openForm = (c) =>
    setForm({
      course: c,
      errors: {},
      values: c
        ? {
            kind: c.kind,
            sku: c.sku,
            name: c.name,
            blurb: c.blurb,
            cover: c.cover || "",
            pkind: c.preview && /youtu/.test(c.preview) ? "youtube" : "upload",
            psrc: c.preview || "",
            price: c.price ?? "",
            published: c.published,
          }
        : { kind: "paid", pkind: "upload", published: false, price: "" },
    });

  async function saveCourse() {
    const errs = checkFields(COURSE_FIELDS, form.values);
    if (Object.keys(errs).length) {
      setForm((f) => ({ ...f, errors: errs }));
      return;
    }
    setBusy(true);
    try {
      const isNew = !form.course;
      await apiAuthed(
        isNew ? "/admin/lc/courses" : `/admin/lc/courses/${form.course.id}`,
        {
          token: accessToken,
          method: isNew ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form.values),
        },
      );
      setForm(null);
      setReload((n) => n + 1);
      say(
        isNew
          ? `${form.values.name} created as a draft. Add its modules, then publish.`
          : `${form.values.name} updated.`,
      );
    } catch (err) {
      say(err?.message || "That could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  if (failed) {
    return <p className="adm-note">Courses could not be loaded just now. Please refresh.</p>;
  }

  /* ── his columns ──────────────────────────────────────────────────────── */

  const cols = [
    {
      h: "Course",
      w: "26%",
      cell: (c) => (
        <AdmTwo
          top={c.name}
          under={
            c.kind === "free"
              ? "Free video"
              : `${c.modules} module${c.modules === 1 ? "" : "s"} · ${c.minutes} min` +
                (c.quizzes ? ` · ${c.quizzes} quizzes` : "")
          }
        />
      ),
    },
    {
      h: "Cover",
      w: "10%",
      // The two things a course cannot go live without, said plainly.
      cell: (c) => (c.cover ? <Thumb src={c.cover} /> : <span className="adm-warn">no cover image</span>),
    },
    {
      h: "Preview",
      w: "10%",
      cell: (c) => {
        if (!c.preview) return <AdmDim>no clip</AdmDim>;
        if (/youtu/.test(c.preview)) {
          return (
            <a className="adm-link" href={c.preview} target="_blank" rel="noopener noreferrer">
              YouTube
            </a>
          );
        }
        return <Thumb src={c.preview} />;
      },
    },
    {
      h: "Video",
      cell: (c) => {
        if (!c.modules) {
          return c.kind === "free" ? (
            <AdmDim>the clip is the course</AdmDim>
          ) : (
            <span className="adm-warn">no modules yet</span>
          );
        }
        const short = c.modules - c.recorded;
        return (
          <span className="adm-two">
            <b>
              {c.recorded} of {c.modules} recorded
            </b>
            {short > 0 ? (
              <span className="adm-warn">
                {short} module{short === 1 ? "" : "s"} still to record
              </span>
            ) : (
              <span>{c.minutes} minutes in total</span>
            )}
          </span>
        );
      },
    },
    {
      h: "Price",
      num: true,
      cell: (c) =>
        c.kind === "paid" ? (
          c.price == null ? (
            // A paid course with no product behind it cannot be bought. That is
            // a fault worth seeing, not a blank.
            <span className="adm-warn">not priced</span>
          ) : (
            money(c.price)
          )
        ) : (
          <AdmDim>free</AdmDim>
        ),
    },
    { h: "Enrolled", num: true, cell: (c) => num(c.enrolled) },
    {
      h: "Finished",
      num: true,
      cell: (c) =>
        c.enrolled ? (
          <AdmTwo top={num(c.finished)} under={`${Math.round((c.finished / c.enrolled) * 100)}%`} />
        ) : (
          <AdmDim>—</AdmDim>
        ),
    },
    {
      h: "Where they stall",
      cell: (c) => (c.stall ? <span className="adm-warn">{c.stall}</span> : <AdmDim>—</AdmDim>),
    },
    {
      h: "State",
      cell: (c) => (
        <AdmChip tone={c.published ? "ok" : "calm"}>{c.published ? "published" : "draft"}</AdmChip>
      ),
    },
    {
      h: "",
      cell: (c) => (
        // His classes exactly: btn-o for the quiet pair, and for the publish
        // toggle his own tone map — btn-o adm-danger to take a live course
        // down, btn-p to put one up.
        <span className="adm-rowacts">
          <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => openForm(c)}>
            Edit
          </button>
          {c.modules ? (
            <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => setPeek(c)}>
              Modules
            </button>
          ) : null}
          <button
            type="button"
            className={`ds-btn ds-btn-sm ${c.published ? "btn-o adm-danger" : "btn-p"}`}
            disabled={busy}
            onClick={() => togglePublish(c)}
          >
            {c.published ? "Unpublish" : "Publish"}
          </button>
        </span>
      ),
    },
  ];

  return (
    <>
      {toast}

      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Courses</h1>
          <p className="adm-lede">
            Everything on demand — the free videos and the paid courses, in one place because they
            are the same object with a price on one of them. The column that matters is where
            people stop.
          </p>
        </div>
        <div className="adm-acts">
          <button type="button" className="ds-btn btn-p ds-btn-sm" onClick={() => openForm(null)}>
            + New course
          </button>
        </div>
      </div>

      <AdmFilters
        current={view}
        onPick={setView}
        options={[
          ["all", "All", counts.all],
          ["paid", "Paid", counts.paid],
          ["free", "Free", counts.free],
        ]}
      />

      {!d ? (
        <p className="adm-note">Reading the courses…</p>
      ) : (
        <AdmTable
          cols={cols}
          rows={items}
          rowKey={(c) => c.id}
          empty={["No courses", "Nothing has been published to sell."]}
        />
      )}

      {form ? (
        <AdmDrawer
          title={form.course ? `Edit ${form.course.name}` : "New course"}
          intro={
            form.course
              ? null
              : "A paid course is a shelf of videos with a price. A free one is a single video. " +
                "Both appear as a card on the public Learn page, so both need a cover."
          }
          note={
            "Video and image uploads are stored on the developer side. Until that exists this " +
            "records the file name, so a course can be set up completely and the files attached " +
            "in one pass later."
          }
          onClose={() => setForm(null)}
          foot={
            <>
              <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => setForm(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="ds-btn btn-p ds-btn-sm"
                disabled={busy}
                onClick={saveCourse}
              >
                {busy ? "Saving…" : form.course ? "Save the course" : "Create the course"}
              </button>
            </>
          }
        >
          <AdmFields
            fields={COURSE_FIELDS}
            values={form.values}
            errors={form.errors}
            onChange={(values) => setForm((f) => ({ ...f, values }))}
          />
        </AdmDrawer>
      ) : null}

      {peek ? (
        <AdmDrawer
          peek
          title={peek.name}
          intro={`${peek.modules} modules · ${peek.minutes} minutes · ${peek.recorded} recorded`}
          onClose={() => setPeek(null)}
        >
          <ModuleList course={peek} token={accessToken} say={say} />
        </AdmDrawer>
      ) : null}
    </>
  );
}

/**
 * The shelf. Each module is a video, and the ones with nothing behind them are
 * exactly what stops a course going live — so they are marked, not listed
 * quietly among the rest.
 */
function ModuleList({ course, token, say }) {
  const [mods, setMods] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    apiAuthed(`/admin/lc/courses/${course.id}/modules`, { token })
      .then((r) => alive && setMods(r.items || []))
      .catch(() => {
        if (!alive) return;
        setMods([]);
        say("The modules could not be read.");
      });
    return () => {
      alive = false;
    };
  }, [course.id, token, say]);

  if (!mods) return <p className="adm-note">Reading the modules…</p>;

  return (
    <AdmTable
      cols={[
        // AdmTable's cell takes the row only, so the number comes from the
        // server rather than from a render index that would read as position
        // in a filtered view.
        { h: "#", cell: (m) => String(m.n) },
        { h: "Module", w: "44%", cell: (m) => m.title || m.code },
        {
          h: "Video",
          cell: (m) =>
            m.video ? (
              <AdmTwo top={String(m.video).split("/").pop()} under={`${m.mins} min`} />
            ) : (
              <span className="adm-warn">not recorded</span>
            ),
        },
        {
          h: "Transcript",
          cell: (m) =>
            m.transcribed ? <AdmChip tone="ok">ready</AdmChip> : <AdmDim>none</AdmDim>,
        },
      ]}
      rows={mods}
      rowKey={(m) => m.code || m.title}
      empty={["No modules", "This course has no lectures yet."]}
    />
  );
}
