// Billboard — the band that rotates low on every public page.
//
// His design, and his reasoning: the band is a SCHEDULE, not a banner editor.
// Every slide carries the window it may run in, the site works out what is
// live when a page loads, and a slide whose end date has passed stops on its
// own. The thing nobody remembers is taking down last month's event, so
// nothing here has to be taken down by hand.
//
// The columns are his: a thumbnail, the slide, when it runs, its state, the
// order it rotates in, and the four things you can do to it.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmChip, AdmFilters } from "./adminUi.jsx";
import { useAdmToast, checkFields } from "./adminKit.jsx";
import { AdmDrawer, AdmFields } from "./adminForm.jsx";

/** His four states, and what each one means to a visitor. */
const TONE = { live: "ok", scheduled: "due", draft: "calm", ended: "calm" };
const SAYS = {
  live: "on the site",
  scheduled: "not yet",
  draft: "draft",
  ended: "finished",
};

const nice = (d) =>
  d
    ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

/** "12 Sep – 4 Oct", or the open-ended halves of it. */
function runs(s) {
  if (!s.from && !s.to) return "whenever it is published";
  if (s.from && !s.to) return `from ${nice(s.from)}`;
  if (!s.from && s.to) return `until ${nice(s.to)}`;
  return `${nice(s.from)} – ${nice(s.to)}`;
}

const isEvent = (v) => v.kind === "event";

const FIELDS = [
  {
    k: "kind",
    label: "What is it",
    type: "select",
    wide: true,
    options: [
      ["notice", "An announcement — a release, a course opening, a price change"],
      ["event", "An event — it has a date, a time and a place"],
    ],
  },
  {
    k: "art",
    label: "Picture",
    type: "text",
    wide: true,
    placeholder: "https://…",
    hint: "Landscape, at least 1600px wide. It fills the left half of the band.",
  },
  {
    k: "tag",
    label: "Eyebrow",
    required: true,
    hint: 'Two or three words above the headline — "New release", "Course open".',
  },
  {
    k: "title",
    label: "Headline",
    required: true,
    wide: true,
    check: (v) =>
      String(v || "").length > 120
        ? "Too long for the band — it wraps to four lines and loses the button."
        : null,
  },
  {
    k: "sub",
    label: "Subtitle",
    type: "textarea",
    rows: 2,
    wide: true,
    hint: "One sentence. The band gives it about two lines.",
  },

  { k: "date", label: "Date of the event", type: "text", when: isEvent, required: true, placeholder: "2026-09-24" },
  { k: "time", label: "Time", when: isEvent, hint: 'As you would say it — "10am", "9:30am – 4pm".' },
  { k: "venue", label: "Where", wide: true, when: isEvent, hint: 'Venue and city, or "Online" and the platform.' },

  { k: "cta", label: "Button says", required: true, hint: '"Reserve a seat", "See what changed".' },
  {
    k: "href",
    label: "Button goes to",
    required: true,
    hint: "A page on this site — /learn, /timepro, /contact — or a full address.",
  },

  { k: "from", label: "Starts showing", type: "text", placeholder: "2026-09-10", hint: "Leave it empty to start now." },
  {
    k: "to",
    label: "Stops showing",
    type: "text",
    placeholder: "2026-10-04",
    hint: "Leave it empty to run until you turn it off. For an event, the day it happens.",
    check: (v, all) => (v && all.from && v < all.from ? "It cannot stop before it starts." : null),
  },

  { k: "on", label: "Published", type: "check", hint: "Off keeps it here as a draft and off the site." },
];

const BLANK = {
  kind: "notice",
  tag: "",
  title: "",
  sub: "",
  art: "",
  cta: "",
  href: "",
  date: "",
  time: "",
  venue: "",
  from: "",
  to: "",
  on: false,
};

export default function DsAdminBillboard() {
  const { accessToken } = useAuth();
  const [say, toast] = useAdmToast();

  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [view, setView] = React.useState("all");
  const [reload, setReload] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(null); // { mode, row, values, errors }
  const [confirming, setConfirming] = React.useState(null);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    setD(null);
    apiAuthed("/admin/billboard", { token: accessToken })
      .then((r) => alive && setD(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken, reload]);

  async function write(path, { method = "POST", body, ok } = {}) {
    setBusy(true);
    try {
      const r = await apiAuthed(path, {
        token: accessToken,
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      setReload((n) => n + 1);
      if (ok) say(typeof ok === "function" ? ok(r) : ok);
      return r || true;
    } catch (err) {
      say(
        err?.status === 401
          ? "Your admin session has expired. Sign in again."
          : err?.message || "That did not work.",
      );
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const errs = checkFields(FIELDS, open.values);
    if (Object.keys(errs).length) {
      setOpen((o) => ({ ...o, errors: errs }));
      return;
    }
    const done = open.row
      ? await write(`/admin/billboard/${open.row.id}`, {
          method: "PUT",
          body: open.values,
          ok: "Saved.",
        })
      : await write("/admin/billboard", {
          body: open.values,
          ok: (r) => `On the billboard as ${SAYS[r?.state] || "a draft"}.`,
        });
    if (done) setOpen(null);
  }

  if (failed) {
    return <p className="adm-note">The billboard could not be loaded just now. Please refresh.</p>;
  }

  const items = (d?.items || []).filter((s) => view === "all" || s.state === view);
  const counts = d?.counts || {};

  const cols = [
    {
      h: "",
      w: "86px",
      cell: (s) =>
        s.art ? (
          <img className="adm-bb-thumb" src={s.art} alt="" loading="lazy" />
        ) : (
          // Not an error: a slide reads perfectly well without one. The band
          // just gives the copy the full width instead.
          <span className="adm-bb-thumb is-none" aria-hidden="true" />
        ),
    },
    {
      h: "Slide",
      w: "34%",
      cell: (s) => (
        <span className="adm-two">
          <b>{s.title}</b>
          <span>
            {s.tag}
            {s.kind === "event" && s.date ? ` · ${nice(s.date)}` : ""}
          </span>
        </span>
      ),
    },
    { h: "Runs", cell: (s) => <AdmTwo top={runs(s)} under={s.kind === "event" ? "event" : "announcement"} /> },
    { h: "State", w: "112px", cell: (s) => <AdmChip tone={TONE[s.state]}>{SAYS[s.state]}</AdmChip> },
    {
      h: "Order",
      w: "92px",
      cell: (s) => (
        <span className="adm-ord">
          {[
            ["↑", -1, "Move up"],
            ["↓", 1, "Move down"],
          ].map(([glyph, dir, label]) => (
            <button
              key={dir}
              type="button"
              className="adm-ord-b"
              title={label}
              aria-label={`${label} — ${s.title}`}
              disabled={busy}
              onClick={() => write(`/admin/billboard/${s.id}/move`, { body: { dir } })}
            >
              {glyph}
            </button>
          ))}
        </span>
      ),
    },
    {
      h: "",
      cell: (s) => {
        if (confirming === s.id) {
          return (
            <span className="adm-log">
              <b>Delete “{s.title}”?</b>
              <span>Taking it down instead keeps it here.</span>
              <span className="adm-rowacts">
                <button
                  type="button"
                  className="ds-btn btn-p ds-btn-sm"
                  disabled={busy}
                  onClick={async () => {
                    const r = await write(`/admin/billboard/${s.id}`, {
                      method: "DELETE",
                      ok: "Gone.",
                    });
                    if (r) setConfirming(null);
                  }}
                >
                  Delete it
                </button>
                <button
                  type="button"
                  className="ds-btn btn-o ds-btn-sm"
                  onClick={() => setConfirming(null)}
                >
                  Keep it
                </button>
              </span>
            </span>
          );
        }

        return (
          <span className="adm-rowacts">
            <button
              type="button"
              className="ds-btn btn-o ds-btn-sm"
              title="Change what it says"
              onClick={() => setOpen({ mode: "edit", row: s, errors: {}, values: { ...s } })}
            >
              Edit
            </button>
            <button
              type="button"
              className="ds-btn btn-o ds-btn-sm"
              title="See it drawn as the band draws it"
              onClick={() => setOpen({ mode: "read", row: s })}
            >
              Preview
            </button>
            <button
              type="button"
              className="ds-btn btn-o ds-btn-sm"
              disabled={busy}
              title={s.on ? "Off the site, kept here" : "Put it back on the site"}
              onClick={() =>
                write(`/admin/billboard/${s.id}/publish`, {
                  body: { on: !s.on },
                  ok: s.on ? "Off the site and kept as a draft." : "Live on the site.",
                })
              }
            >
              {s.on ? "Take down" : "Publish"}
            </button>
            <button
              type="button"
              className="ds-btn btn-o ds-btn-sm"
              title="Remove it for good"
              onClick={() => setConfirming(s.id)}
            >
              Delete
            </button>
          </span>
        );
      },
    },
  ];

  return (
    <>
      {toast}

      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Billboard</h1>
          <p className="adm-lede">
            The band that rotates low on every page of the public site. A slide runs between the
            dates you give it and stops on its own, so nothing here has to be taken down by hand.
            Order is the order it rotates in.
          </p>
        </div>
        <div className="adm-acts">
          <button
            type="button"
            className="ds-btn btn-p ds-btn-sm"
            onClick={() => setOpen({ mode: "edit", row: null, errors: {}, values: { ...BLANK } })}
          >
            + Put something on the billboard
          </button>
        </div>
      </div>

      <AdmFilters
        current={view}
        onPick={setView}
        options={[
          ["all", "Everything", counts.all],
          ["live", "On the site", counts.live],
          ["scheduled", "Not yet", counts.scheduled],
          ["draft", "Drafts", counts.draft],
          ["ended", "Finished", counts.ended],
        ]}
      />

      {!d ? (
        <p className="adm-note">Reading…</p>
      ) : (
        <>
          <AdmTable
            cols={cols}
            rows={items}
            rowKey={(s) => s.id}
            empty={[
              "Nothing on the billboard",
              "The band does not appear on the site at all until something is live in it.",
            ]}
          />

          <div className="adm-merge">
            <b>A slide stops on its own.</b>
            <span>
              The site works out what is live when a page loads, so an event that has passed
              disappears without anybody taking it down — which is the one thing nobody ever
              remembers to do. Today is {nice(d.today)}.
            </span>
          </div>
        </>
      )}

      {open?.mode === "edit" ? (
        <AdmDrawer
          title={open.row ? "Edit this slide" : "Put something on the billboard"}
          intro={
            open.row
              ? open.row.state === "live"
                ? "This one is on the site now. Saving changes it there."
                : "This one is not showing at the moment."
              : "It appears in the band low on every page of the public site, between the dates you give it."
          }
          onClose={() => setOpen(null)}
          foot={
            <>
              <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => setOpen(null)}>
                Cancel
              </button>
              <button type="button" className="ds-btn btn-p ds-btn-sm" disabled={busy} onClick={save}>
                {busy ? "Saving…" : open.row ? "Save" : "Add it"}
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

      {open?.mode === "read" ? (
        <AdmDrawer
          title="On the site it looks like this"
          intro="Drawn the way the band draws it, so what you approve here is what a visitor gets."
          onClose={() => setOpen(null)}
          foot={
            <button type="button" className="ds-btn btn-p ds-btn-sm" onClick={() => setOpen(null)}>
              Close
            </button>
          }
        >
          <div className="adm-bb-preview">
            {open.row.art ? <img src={open.row.art} alt="" /> : null}
            <div className="adm-bb-copy">
              <span className="tag">{open.row.tag}</span>
              <b>{open.row.title}</b>
              {open.row.kind === "event" ? (
                <span className="when">
                  {[nice(open.row.date), open.row.time, open.row.venue].filter(Boolean).join(" · ")}
                </span>
              ) : null}
              {open.row.sub ? <p>{open.row.sub}</p> : null}
              <span className="ds-btn btn-p ds-btn-sm">{open.row.cta}</span>
            </div>
          </div>
          <p className="adm-note" style={{ marginTop: 14 }}>
            The button goes to <code>{open.row.href}</code>.
          </p>
        </AdmDrawer>
      ) : null}
    </>
  );
}
