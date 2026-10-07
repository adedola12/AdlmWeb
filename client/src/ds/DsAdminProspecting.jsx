// Prospecting: the review queue for outbound cold email, and everything
// around it.
//
// Richard drew no screen for this, so it is built in his grammar, the same
// way Follow-ups was: his page head, his filter tabs, his register table, his
// KPI tiles, and his drawer for the one record being worked on. A reviewer
// works DOWN a list, so a row opens beside the list rather than on its own
// page, which is his stated preference for registers.
//
// FOUR VIEWS ON ONE PAGE
//   Review      drafts waiting for a person: approve, edit then approve,
//               reject with a reason, or mark the firm a bad fit
//   Prospects   every firm found, filtered by profile, status and date
//   Profiles    the ideal customer profiles the daily finder searches for
//   Suppression admin only: the permanent do-not-contact list
//
// WHAT THE REVIEWER CANNOT BREAK
//   The sign-off and the opt-out line are not editable. The server adds them
//   back to every email whatever is sent, so the editor shows only the text
//   above them and the footer as a fixed note underneath. An em dash blocks
//   the save; the style rules come back as warnings and the reviewer decides.
//
// Nothing on this screen sends mail. Approved drafts wait for the phase 2
// sender.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { can } from "../utils/roles.js";
import { AdmTable, AdmTwo, AdmDim, AdmFilters, AdmChip } from "./adminUi.jsx";
import { useAdmToast } from "./adminKit.jsx";
import { AdmDrawer, AdmFields } from "./adminForm.jsx";

// The footer the server appends to every email (util/prospecting/writer.js).
const SIGN_OFF = "Adedolapo Quasim\nCEO, ADLM Studio";
const OPT_OUT = "Reply 'stop' and I won't email again.";
const FOOTER = `\n\n${SIGN_OFF}\n\n${OPT_OUT}`;
const EM_DASH = String.fromCharCode(0x2014);

const PRODUCT = { quiv: "QUIV", heron: "HERON", mep: "MEP", rategen: "RateGen" };
const STATUS = {
  new: ["Found", ""],
  drafted: ["Waiting for review", "due"],
  approved: ["Approved", "ok"],
  rejected: ["Draft rejected", "bad"],
  bad_fit: ["Bad fit", "bad"],
  contacted: ["Contacted", ""],
  replied: ["Replied", "ok"],
  booked: ["Call booked", "ok"],
  opted_out: ["Opted out", "bad"],
};
const DAY_LABEL = ["First email", "Day 3 follow-up", "Day 7 follow-up"];
const RANGES = [
  ["7", "Last 7 days"],
  ["30", "Last 30 days"],
  ["90", "Last 90 days"],
  ["all", "All time"],
];

const when = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
const ageDays = (d) => Math.max(0, Math.floor((Date.now() - new Date(d)) / 86400000));
const statusChip = (s) => {
  const [label, tone] = STATUS[s] || [s, ""];
  return <AdmChip tone={tone}>{label}</AdmChip>;
};
const bodyText = (body) => (String(body || "").endsWith(FOOTER) ? body.slice(0, -FOOTER.length) : String(body || ""));
const lines = (v) => (Array.isArray(v) ? v.join("\n") : String(v || ""));

// His stylesheet has no general link or list rule inside a drawer (the reset
// strips both), so the research reads as plain text without these.
const LINK = { color: "var(--action)", textDecoration: "underline", textUnderlineOffset: 2 };
const LIST = { margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, listStyle: "disc" };

/** The screen's API, bound to the signed-in token. */
function useApi() {
  const { accessToken } = useAuth();
  return React.useCallback(
    (path, { method = "GET", body, params } = {}) =>
      apiAuthed(`/admin/prospecting${path}`, {
        token: accessToken,
        method,
        params,
        ...(body !== undefined
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
          : {}),
      }),
    [accessToken],
  );
}

/* ─────────────────────────────────────────────────────────── small parts ── */

function Section({ title, children }) {
  return (
    <div style={{ margin: "0 0 18px" }}>
      <span className="adm-f-l" style={{ display: "block", marginBottom: 6 }}>
        {title}
      </span>
      {children}
    </div>
  );
}

function Sources({ items }) {
  if (!items?.length) return <AdmDim>None recorded</AdmDim>;
  return (
    <ul style={LIST}>
      {items.map((s) => {
        const url = typeof s === "string" ? s : s.url;
        return (
          <li key={url}>
            <a href={url} target="_blank" rel="noopener noreferrer" style={LINK}>
              {(typeof s === "object" && s.title) || url}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function Research({ p }) {
  return (
    <>
      <Section title="The firm">
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>
          <b>{p.companyName}</b>
          {p.location ? `, ${p.location}` : ""}
          {p.website ? (
            <>
              {" · "}
              <a href={p.website.startsWith("http") ? p.website : `https://${p.website}`} target="_blank" rel="noopener noreferrer" style={LINK}>
                {p.domain}
              </a>
            </>
          ) : null}
        </p>
        <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.55 }}>{p.whatTheyDo || <AdmDim>No description found</AdmDim>}</p>
      </Section>
      <Section title="Recent work">
        {p.recentProjects?.length ? (
          <ul style={LIST}>
            {p.recentProjects.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        ) : (
          <AdmDim>Nothing specific found</AdmDim>
        )}
      </Section>
      <Section title="Where this came from">
        <Sources items={p.sources} />
      </Section>
    </>
  );
}

function Contact({ c }) {
  if (!c) return <AdmDim>No contact</AdmDim>;
  return (
    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>
      <b>{c.name || "Name not known"}</b>
      {c.title ? `, ${c.title}` : ""}
      <br />
      {c.email}
      {c.confidence ? <AdmDim>{` · ${c.confidence}% confident`}</AdmDim> : null}
      {c.source?.urls?.length ? (
        <>
          <br />
          <AdmDim>Found on: </AdmDim>
          {c.source.urls.slice(0, 3).map((u, i) => (
            <React.Fragment key={u}>
              {i ? ", " : ""}
              <a href={u} target="_blank" rel="noopener noreferrer" style={LINK}>
                {u.replace(/^https?:\/\//, "")}
              </a>
            </React.Fragment>
          ))}
        </>
      ) : null}
    </p>
  );
}

/* ──────────────────────────────────────────────────────── review drawer ── */

function ReviewDrawer({ draft, onClose, onDone, say }) {
  const api = useApi();
  const start = React.useMemo(() => {
    const v = {};
    draft.emails.forEach((e, i) => {
      v[`s${i}`] = e.subject;
      v[`b${i}`] = bodyText(e.body);
    });
    return v;
  }, [draft]);
  const [values, setValues] = React.useState(start);
  const [mode, setMode] = React.useState("review"); // review | reject | badfit
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [problems, setProblems] = React.useState([]);

  const dirty = Object.keys(start).some((k) => start[k] !== values[k]);
  const dashes = Object.values(values).some((v) => String(v).includes(EM_DASH));

  const fields = draft.emails.flatMap((e, i) => [
    { k: `s${i}`, label: `${DAY_LABEL[i]}: subject`, wide: true },
    {
      k: `b${i}`,
      label: `${DAY_LABEL[i]}: text`,
      type: "textarea",
      rows: i === 0 ? 9 : 6,
      wide: true,
      hint: i === 0 ? "Your sign-off and the opt-out line are added below every email automatically." : undefined,
    },
  ]);

  async function act(kind) {
    if (busy) return;
    setBusy(true);
    setProblems([]);
    try {
      if (kind === "approve") {
        const body = dirty ? { emails: draft.emails.map((_, i) => ({ subject: values[`s${i}`], body: values[`b${i}`] })) } : {};
        const r = await api(`/drafts/${draft._id}/approve`, { method: "POST", body });
        say(
          r.warnings?.length
            ? `Approved, with ${r.warnings.length} note${r.warnings.length === 1 ? "" : "s"}: ${r.warnings[0]}`
            : dirty
              ? "Your edits were saved and the draft approved."
              : "Approved as written.",
        );
      } else if (kind === "reject") {
        await api(`/drafts/${draft._id}/reject`, { method: "POST", body: { reason } });
        say("Rejected. The reason is kept with the draft.");
      } else {
        await api(`/prospects/${draft.prospectId}/bad-fit`, { method: "POST", body: { reason } });
        say(`${draft.prospect?.companyName || "The firm"} is marked a bad fit and will not be drafted again.`);
      }
      onDone();
    } catch (e) {
      const extra = e?.data?.problems;
      if (Array.isArray(extra) && extra.length) setProblems(extra);
      say(e?.message || "The server refused that. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  const p = draft.prospect || {};
  const foot =
    mode === "review" ? (
      <>
        <button type="button" className="ds-btn btn-o ds-btn-sm" disabled={busy} onClick={() => setMode("badfit")}>
          Bad fit
        </button>
        <button type="button" className="ds-btn btn-o ds-btn-sm" disabled={busy} onClick={() => setMode("reject")}>
          Reject
        </button>
        <button type="button" className="ds-btn btn-p ds-btn-sm" disabled={busy || dashes} onClick={() => act("approve")}>
          {dirty ? "Save edits and approve" : "Approve"}
        </button>
      </>
    ) : (
      <>
        <button type="button" className="ds-btn btn-o ds-btn-sm" disabled={busy} onClick={() => { setMode("review"); setReason(""); }}>
          Back
        </button>
        <button
          type="button"
          className="ds-btn btn-p ds-btn-sm"
          disabled={busy || !reason.trim()}
          onClick={() => act(mode === "reject" ? "reject" : "badfit")}
        >
          {mode === "reject" ? "Reject this draft" : "Mark as a bad fit"}
        </button>
      </>
    );

  return (
    <AdmDrawer
      wide
      title={p.companyName || "Draft"}
      intro={`${PRODUCT[draft.product] || draft.product} · written ${when(draft.createdAt)}${draft.model ? ` · ${draft.model}` : ""}`}
      onClose={onClose}
      foot={foot}
      note="Nothing is sent from here. An approved draft waits for the sender, which is not switched on yet."
    >
      <Research p={p} />
      <Section title="Writing to">
        <Contact c={draft.contact} />
      </Section>

      {mode === "review" ? (
        <>
          <AdmFields fields={fields} values={values} onChange={setValues} />
          <p className="adm-drawer-note" style={{ whiteSpace: "pre-line" }}>
            {`Every email ends:\n\n${SIGN_OFF}\n\n${OPT_OUT}`}
          </p>
          {dashes ? (
            <p className="adm-note" role="alert">
              There is an em dash in the text. Use a comma, a full stop or a hyphen instead; it can&rsquo;t be saved with one.
            </p>
          ) : null}
        </>
      ) : (
        <AdmFields
          fields={[
            {
              k: "reason",
              type: "textarea",
              rows: 4,
              wide: true,
              required: true,
              label: mode === "reject" ? "Why is this draft rejected?" : "Why is this firm a bad fit?",
              hint:
                mode === "reject"
                  ? "Kept with the draft, so the writer's mistakes can be seen over time."
                  : "The firm stays on file so it is never found and drafted again.",
            },
          ]}
          values={{ reason }}
          onChange={(v) => setReason(v.reason)}
        />
      )}

      {problems.length ? (
        <ul className="adm-note" role="alert" style={{ paddingLeft: 18 }}>
          {problems.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : null}
    </AdmDrawer>
  );
}

/* ─────────────────────────────────────────────────────── prospect drawer ── */

function ProspectDrawer({ id, isAdmin, onClose, onDone, say }) {
  const api = useApi();
  const [p, setP] = React.useState(null);
  const [mode, setMode] = React.useState("view"); // view | badfit | delete
  const [text, setText] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    api(`/prospects/${id}`)
      .then((r) => alive && setP(r.prospect))
      .catch((e) => alive && say(e?.message || "That prospect could not be loaded."));
    return () => {
      alive = false;
    };
  }, [api, id, say]);

  async function run(fn, done) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      say(done);
      onDone();
    } catch (e) {
      say(e?.message || "The server refused that. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  if (!p) {
    return (
      <AdmDrawer title="Prospect" onClose={onClose}>
        <p className="adm-note">Reading…</p>
      </AdmDrawer>
    );
  }

  const closed = ["opted_out", "bad_fit"].includes(p.status);
  const foot =
    mode === "view" ? (
      <>
        {isAdmin ? (
          <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => setMode("delete")}>
            Delete on request
          </button>
        ) : null}
        {!closed ? (
          <>
            <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => setMode("badfit")}>
              Bad fit
            </button>
            <button
              type="button"
              className="ds-btn btn-o ds-btn-sm"
              disabled={busy}
              onClick={() => run(() => api(`/prospects/${p._id}/outcome`, { method: "POST", body: { outcome: "replied" } }), "Recorded as replied.")}
            >
              They replied
            </button>
            <button
              type="button"
              className="ds-btn btn-p ds-btn-sm"
              disabled={busy}
              onClick={() => run(() => api(`/prospects/${p._id}/outcome`, { method: "POST", body: { outcome: "booked" } }), "Recorded as a booked call.")}
            >
              Call booked
            </button>
          </>
        ) : null}
      </>
    ) : mode === "badfit" ? (
      <>
        <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => setMode("view")}>
          Back
        </button>
        <button
          type="button"
          className="ds-btn btn-p ds-btn-sm"
          disabled={busy || !text.trim()}
          onClick={() => run(() => api(`/prospects/${p._id}/bad-fit`, { method: "POST", body: { reason: text } }), "Marked a bad fit.")}
        >
          Mark as a bad fit
        </button>
      </>
    ) : (
      <>
        <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => setMode("view")}>
          Back
        </button>
        <button
          type="button"
          className="ds-btn btn-p ds-btn-sm"
          disabled={busy || !text.trim() || confirm.trim().toLowerCase() !== p.domain}
          onClick={() =>
            run(
              () => api(`/prospects/${p._id}`, { method: "DELETE", body: { note: text } }),
              `${p.companyName}'s data is deleted. They stay on the suppression list and will not be found again.`,
            )
          }
        >
          Delete their data
        </button>
      </>
    );

  return (
    <AdmDrawer
      wide
      title={p.companyName}
      intro={`${p.profile?.segment || "Profile"} · ${PRODUCT[p.matchedProduct] || p.matchedProduct} · found ${when(p.createdAt)}`}
      onClose={onClose}
      foot={foot}
    >
      <Section title="Status">
        {statusChip(p.status)}
        {p.statusNote ? <p style={{ margin: "6px 0 0", fontSize: 12.5 }}>{p.statusNote}</p> : null}
      </Section>

      {mode === "delete" ? (
        <>
          <p className="adm-note" role="alert" style={{ marginBottom: 16 }}>
            This permanently deletes the firm, every contact and every draft. Only a scrambled fingerprint of each email
            address and the firm&rsquo;s domain are kept, so they are never found and contacted again. It cannot be undone.
          </p>
          <AdmFields
            fields={[
              {
                k: "note",
                type: "textarea",
                rows: 3,
                wide: true,
                required: true,
                label: "Where did the request come from?",
                hint: "For example: the email it arrived in, and the date. Kept in the audit log.",
              },
              { k: "confirm", wide: true, required: true, label: `Type ${p.domain} to confirm` },
            ]}
            values={{ note: text, confirm }}
            onChange={(v) => {
              setText(v.note);
              setConfirm(v.confirm);
            }}
          />
        </>
      ) : mode === "badfit" ? (
        <AdmFields
          fields={[{ k: "reason", type: "textarea", rows: 4, wide: true, required: true, label: "Why is this firm a bad fit?" }]}
          values={{ reason: text }}
          onChange={(v) => setText(v.reason)}
        />
      ) : (
        <>
          <Research p={p} />
          <Section title={`People (${p.contacts?.length || 0})`}>
            {p.contacts?.length ? (
              p.contacts.map((c) => (
                <div key={c._id} style={{ marginBottom: 10 }}>
                  {c.primary ? <AdmChip tone="ok">Writing to</AdmChip> : null} <Contact c={c} />
                </div>
              ))
            ) : (
              <AdmDim>Nobody found</AdmDim>
            )}
          </Section>
          <Section title="Drafts">
            {p.drafts?.length ? (
              p.drafts.map((d) => (
                <p key={d._id} style={{ margin: "0 0 6px", fontSize: 12.5 }}>
                  {statusChip(d.status === "pending_review" ? "drafted" : d.status)} {when(d.createdAt)}
                  {d.reviewedBy ? ` · ${d.reviewedBy}` : ""}
                  {d.edited ? " · edited" : ""}
                  {d.rejectReason ? ` · ${d.rejectReason}` : ""}
                </p>
              ))
            ) : (
              <AdmDim>None yet</AdmDim>
            )}
          </Section>
        </>
      )}
    </AdmDrawer>
  );
}

/* ──────────────────────────────────────────────────────── profile drawer ── */

const PROFILE_FIELDS = [
  { k: "segment", label: "Segment name", required: true, wide: true, placeholder: "QS consultancies in Lagos and Abuja" },
  { k: "targetProduct", label: "Product to pitch", type: "select", options: Object.entries(PRODUCT) },
  { k: "active", label: "Search for this profile every day", type: "check" },
  { k: "locations", label: "Locations", type: "textarea", rows: 3, hint: "One per line." },
  { k: "companyTypes", label: "Kinds of organisation", type: "textarea", rows: 3, hint: "One per line." },
  { k: "jobTitles", label: "Job titles to reach", type: "textarea", rows: 4, hint: "One per line. The best match is the person written to." },
  { k: "keywords", label: "Search terms", type: "textarea", rows: 3, hint: "One per line." },
  { k: "exclusions", label: "Exclude", type: "textarea", rows: 3, hint: "One per line, for example: recruitment agencies." },
  { k: "notes", label: "Why this segment buys", type: "textarea", rows: 3, wide: true, hint: "Context for the search. Not shown to anyone." },
];

function ProfileDrawer({ profile, onClose, onDone, say }) {
  const api = useApi();
  const isNew = !profile?._id;
  const [values, setValues] = React.useState(() => ({
    segment: profile?.segment || "",
    targetProduct: profile?.targetProduct || "heron",
    active: profile?.active ?? true,
    locations: lines(profile?.locations),
    companyTypes: lines(profile?.companyTypes),
    jobTitles: lines(profile?.jobTitles),
    keywords: lines(profile?.keywords),
    exclusions: lines(profile?.exclusions),
    notes: profile?.notes || "",
  }));
  const [busy, setBusy] = React.useState(false);

  async function save() {
    if (busy || !values.segment.trim()) return;
    setBusy(true);
    try {
      await api(isNew ? "/profiles" : `/profiles/${profile._id}`, { method: isNew ? "POST" : "PATCH", body: values });
      say(isNew ? "Profile added. The finder will search for it tomorrow morning." : "Profile saved.");
      onDone();
    } catch (e) {
      say(e?.message || "The server refused that. Nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdmDrawer
      title={isNew ? "New profile" : profile.segment}
      intro="Who the daily finder looks for, and which product their emails propose."
      onClose={onClose}
      foot={
        <button type="button" className="ds-btn btn-p ds-btn-sm" disabled={busy || !values.segment.trim()} onClick={save}>
          {isNew ? "Add profile" : "Save"}
        </button>
      }
    >
      <AdmFields fields={PROFILE_FIELDS} values={values} onChange={setValues} />
    </AdmDrawer>
  );
}

/* ─────────────────────────────────────────────────────────── the screen ── */

export default function DsAdminProspecting() {
  const { user, accessToken } = useAuth();
  const api = useApi();
  const isAdmin = can(user, "prospecting_admin");
  const [say, toast] = useAdmToast(6000);

  const [view, setView] = React.useState("review");
  const [range, setRange] = React.useState("30");
  const [reload, setReload] = React.useState(0);
  const [failed, setFailed] = React.useState(false);

  const [stats, setStats] = React.useState(null);
  const [queue, setQueue] = React.useState(null);
  const [profiles, setProfiles] = React.useState([]);
  const [list, setList] = React.useState(null);
  const [filters, setFilters] = React.useState({ profile: "", status: "", from: "", to: "", q: "" });
  const [page, setPage] = React.useState(1);

  const [openDraft, setOpenDraft] = React.useState(null);
  const [openProspect, setOpenProspect] = React.useState(null);
  const [openProfile, setOpenProfile] = React.useState(null);

  const refresh = React.useCallback(() => setReload((n) => n + 1), []);

  // Stats and profiles: always.
  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    const from = range === "all" ? undefined : new Date(Date.now() - Number(range) * 86400000).toISOString();
    Promise.all([api("/stats", { params: from ? { from } : {} }), api("/profiles")])
      .then(([s, p]) => {
        if (!alive) return;
        setStats(s.stats);
        setProfiles(p.profiles || []);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken, api, range, reload]);

  // The queue.
  React.useEffect(() => {
    if (!accessToken || view !== "review") return undefined;
    let alive = true;
    setQueue(null);
    api("/queue", { params: { limit: 100 } })
      .then((r) => alive && setQueue(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken, api, view, reload]);

  // The prospect table.
  React.useEffect(() => {
    if (!accessToken || view !== "prospects") return undefined;
    let alive = true;
    setList(null);
    const params = { page, limit: 50 };
    for (const [k, v] of Object.entries(filters)) if (v) params[k] = v;
    api("/prospects", { params })
      .then((r) => alive && setList(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken, api, view, filters, page, reload]);

  if (failed) {
    return <p className="adm-note">Prospecting could not be loaded just now. Please refresh.</p>;
  }

  const profileName = (id) => profiles.find((p) => p._id === id)?.segment || "";
  const setFilter = (k, v) => {
    setPage(1);
    setFilters((f) => ({ ...f, [k]: v }));
  };

  const kpi = (icon, label, value, sub, warn) => (
    <div className={`adm-kpi${warn ? " warn" : ""}`} key={label}>
      <span className="k">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <use href={`#${icon}`} />
        </svg>
        <span>{label}</span>
      </span>
      <b>{value ?? "–"}</b>
      <span className="ds-sub">{sub}</span>
    </div>
  );

  const queueCols = [
    { h: "Firm", w: "28%", cell: (d) => <AdmTwo top={d.prospect?.companyName} under={d.prospect?.location || d.prospect?.domain} /> },
    { h: "Writing to", w: "24%", cell: (d) => <AdmTwo top={d.contact?.name || d.contact?.email} under={d.contact?.title} /> },
    { h: "Product", cell: (d) => PRODUCT[d.product] || d.product },
    { h: "Subject", w: "26%", cell: (d) => d.emails?.[0]?.subject },
    {
      h: "Waiting",
      num: true,
      cell: (d) => {
        const n = ageDays(d.createdAt);
        return <AdmChip tone={n >= 3 ? "due" : ""}>{n === 0 ? "today" : `${n}d`}</AdmChip>;
      },
    },
  ];

  const prospectCols = [
    { h: "Firm", w: "26%", cell: (p) => <AdmTwo top={p.companyName} under={p.domain} /> },
    { h: "Location", cell: (p) => p.location || <AdmDim>–</AdmDim> },
    { h: "Profile", w: "20%", cell: (p) => <AdmTwo top={profileName(p.profileId) || <AdmDim>–</AdmDim>} under={PRODUCT[p.matchedProduct]} /> },
    { h: "Writing to", cell: (p) => (p.contact ? <AdmTwo top={p.contact.name || p.contact.email} under={p.contact.title} /> : <AdmDim>nobody found</AdmDim>) },
    { h: "Status", cell: (p) => statusChip(p.status) },
    { h: "Found", num: true, cell: (p) => when(p.createdAt) },
  ];

  const profileCols = [
    { h: "Segment", w: "34%", cell: (p) => <AdmTwo top={p.segment} under={(p.locations || []).join(", ")} /> },
    { h: "Product", cell: (p) => PRODUCT[p.targetProduct] || p.targetProduct },
    { h: "Reaching", w: "30%", cell: (p) => (p.jobTitles || []).slice(0, 3).join(", ") || <AdmDim>–</AdmDim> },
    { h: "Found so far", num: true, cell: (p) => p.prospects ?? 0 },
    { h: "Searching", cell: (p) => (p.active ? <AdmChip tone="ok">Daily</AdmChip> : <AdmChip>Paused</AdmChip>) },
  ];

  const tabs = [
    ["review", "Review", stats?.pendingReview],
    ["prospects", "Prospects", null],
    ["profiles", "Profiles", profiles.length],
    ...(isAdmin ? [["suppression", "Suppression", null]] : []),
  ];

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Prospecting</h1>
          <p className="adm-lede">
            Firms the daily finder turned up, and the emails written to them. Nothing is sent until a person approves it
            here, and the sender is not switched on yet. Every firm shows the pages it was found on.
          </p>
        </div>
        <label className="adm-f" style={{ minWidth: 170, marginBottom: 16 }}>
          <span className="adm-f-l">Figures for</span>
          <select value={range} onChange={(e) => setRange(e.target.value)}>
            {RANGES.map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="adm-kpis">
        {kpi("hi-search", "Found", stats?.found, "new firms in the period")}
        {kpi("hi-alert", "Waiting for review", stats?.pendingReview, "drafts nobody has decided on", (stats?.pendingReview || 0) > 20)}
        {kpi("hi-check", "Approved", stats?.approved, `${stats?.rejected ?? "–"} rejected in the period`)}
        {kpi("ai-mail", "Replied / booked", stats ? `${stats.replied} / ${stats.booked}` : null, "recorded by hand until replies are read automatically")}
      </div>

      <AdmFilters options={tabs} current={view} onPick={setView} />

      {view === "review" ? (
        !queue ? (
          <p className="adm-note">Reading the queue…</p>
        ) : (
          <AdmTable
            cols={queueCols}
            rows={queue.items || []}
            rowKey={(d) => d._id}
            onRow={setOpenDraft}
            empty={[
              "Nothing to review",
              "Every draft has been decided. New ones arrive after the finder's morning run.",
            ]}
          />
        )
      ) : null}

      {view === "prospects" ? (
        <>
          <div className="adm-fs" style={{ marginBottom: 12 }}>
            <label className="adm-f">
              <span className="adm-f-l">Profile</span>
              <select value={filters.profile} onChange={(e) => setFilter("profile", e.target.value)}>
                <option value="">All profiles</option>
                {profiles.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.segment}
                  </option>
                ))}
              </select>
            </label>
            <label className="adm-f">
              <span className="adm-f-l">Status</span>
              <select value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
                <option value="">Any status</option>
                {Object.entries(STATUS).map(([k, [label]]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="adm-f">
              <span className="adm-f-l">Found from</span>
              <input type="date" value={filters.from} onChange={(e) => setFilter("from", e.target.value)} />
            </label>
            <label className="adm-f">
              <span className="adm-f-l">Found before</span>
              <input type="date" value={filters.to} onChange={(e) => setFilter("to", e.target.value)} />
            </label>
            <label className="adm-f wide">
              <span className="adm-f-l">Search</span>
              <input
                type="text"
                placeholder="Firm, domain or place"
                value={filters.q}
                onChange={(e) => setFilter("q", e.target.value)}
              />
            </label>
          </div>
          {!list ? (
            <p className="adm-note">Reading the list…</p>
          ) : (
            <>
              <AdmTable
                cols={prospectCols}
                rows={list.items || []}
                rowKey={(p) => p._id}
                onRow={(p) => setOpenProspect(p._id)}
                empty={["No firms match", "Nothing found yet, or nothing matches these filters."]}
              />
              {list.total > list.limit ? (
                <p className="adm-foot-note">
                  {list.total} firms · page {list.page} of {Math.ceil(list.total / list.limit)}{" "}
                  <button type="button" className="adm-b" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>
                    previous
                  </button>{" "}
                  <button
                    type="button"
                    className="adm-b"
                    disabled={page >= Math.ceil(list.total / list.limit)}
                    onClick={() => setPage((n) => n + 1)}
                  >
                    next
                  </button>
                </p>
              ) : null}
            </>
          )}
        </>
      ) : null}

      {view === "profiles" ? (
        <>
          {isAdmin ? (
            <p style={{ margin: "0 0 12px" }}>
              <button type="button" className="ds-btn btn-p ds-btn-sm" onClick={() => setOpenProfile({})}>
                New profile
              </button>
            </p>
          ) : null}
          <AdmTable
            cols={profileCols}
            rows={profiles}
            rowKey={(p) => p._id}
            onRow={isAdmin ? setOpenProfile : undefined}
            empty={["No profiles yet", "Profiles tell the finder who to look for. Seed the starting three or add one."]}
          />
        </>
      ) : null}

      {view === "suppression" && isAdmin ? <Suppression say={say} onDone={refresh} /> : null}

      <p className="adm-foot-note">
        Every decision is recorded against your name. A person who replies &ldquo;stop&rdquo;, or asks for their data to be
        deleted, is never found or written to again.
      </p>

      {openDraft ? (
        <ReviewDrawer
          draft={openDraft}
          say={say}
          onClose={() => setOpenDraft(null)}
          onDone={() => {
            setOpenDraft(null);
            refresh();
          }}
        />
      ) : null}
      {openProspect ? (
        <ProspectDrawer
          id={openProspect}
          isAdmin={isAdmin}
          say={say}
          onClose={() => setOpenProspect(null)}
          onDone={() => {
            setOpenProspect(null);
            refresh();
          }}
        />
      ) : null}
      {openProfile ? (
        <ProfileDrawer
          profile={openProfile}
          say={say}
          onClose={() => setOpenProfile(null)}
          onDone={() => {
            setOpenProfile(null);
            refresh();
          }}
        />
      ) : null}

      {toast}
    </>
  );
}

/* ──────────────────────────────────────────────────────────── suppression ── */

function Suppression({ say, onDone }) {
  const api = useApi();
  const [v, setV] = React.useState({ target: "", note: "" });
  const [busy, setBusy] = React.useState(false);
  const [answer, setAnswer] = React.useState(null);

  const body = () => {
    const t = v.target.trim();
    return t.includes("@") && !t.includes("/") ? { email: t } : { domain: t };
  };

  async function check() {
    if (busy || !v.target.trim()) return;
    setBusy(true);
    setAnswer(null);
    try {
      const r = await api("/suppressions/check", { method: "POST", body: body() });
      setAnswer(r.suppressed ? "Already on the list. They will not be contacted." : "Not on the list.");
    } catch (e) {
      say(e?.message || "That could not be checked.");
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (busy || !v.target.trim()) return;
    setBusy(true);
    try {
      await api("/suppressions", { method: "POST", body: { ...body(), note: v.note } });
      say("Added. They will never be found or written to again, and any waiting draft is withdrawn.");
      setV({ target: "", note: "" });
      setAnswer(null);
      onDone();
    } catch (e) {
      say(e?.message || "The server refused that. Nothing was added.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <p className="adm-lede" style={{ marginBottom: 12 }}>
        The permanent do-not-contact list. Add a person who asked not to be emailed by phone or from another inbox, or a whole
        firm by its domain. There is no remove: an opt-out is for good. Addresses are kept only as a scrambled fingerprint, so
        this list can answer &ldquo;is this person on it?&rdquo; but can&rsquo;t show who is.
      </p>
      <AdmFields
        fields={[
          { k: "target", label: "Email address or domain", wide: true, placeholder: "name@firm.com or firm.com" },
          { k: "note", label: "Where the request came from", type: "textarea", rows: 2, wide: true },
        ]}
        values={v}
        onChange={setV}
      />
      <p style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" className="ds-btn btn-o ds-btn-sm" disabled={busy || !v.target.trim()} onClick={check}>
          Check
        </button>
        <button type="button" className="ds-btn btn-p ds-btn-sm" disabled={busy || !v.target.trim()} onClick={add}>
          Add to the list
        </button>
        {answer ? <span className="adm-dim">{answer}</span> : null}
      </p>
    </div>
  );
}
