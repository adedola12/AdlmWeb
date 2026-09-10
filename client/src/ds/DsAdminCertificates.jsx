// Certificates — what has been issued, and how to withdraw one.
//
// His screen, from admin-catalogue.js: four filters, the mark as a percentage,
// a state chip carrying its reason, and the verbs he named — Reissue, Revoke,
// and Reinstate on one already withdrawn. His note is the whole reason it
// exists: "if I want to revoke a certificate, how do I revoke a certificate."
//
// WHAT REVOKING CAN AND CANNOT DO, SAID ON THE SCREEN
//
// His confirm promises that a revoked certificate stops verifying. Ours does —
// GET /verify/:ref is public and answers "withdrawn" for it.
//
// What neither can do is unpublish the PDF, which sits at a Cloudinary URL
// that whoever downloaded it already has. That is said in the confirm rather
// than left for somebody to assume otherwise, because an administrator who
// believes a document has been recalled will not do the other things that
// actually need doing.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmChip, AdmFilters } from "./adminUi.jsx";
import { useAdmToast, checkFields } from "./adminKit.jsx";
import { AdmDrawer, AdmFields } from "./adminForm.jsx";

const when = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";

const TONE = { issued: "ok", reissued: "calm", revoked: "bad" };

// His form, with one change: he asks for a name, ours asks for the account.
// A certificate that is not attached to an account cannot be verified against
// anybody, and an unverifiable certificate is what the verify page exists to
// prevent.
const ISSUE_FIELDS = [
  {
    k: "email",
    label: "Who",
    type: "text",
    required: true,
    wide: true,
    placeholder: "their@email.com",
    hint: "The account it belongs to. The name on the certificate comes from there, so it matches everything else they hold.",
  },
  { k: "courseSku", label: "Course", type: "select", options: (v) => v._courses || [], required: true },
  {
    k: "mark",
    label: "Mark",
    type: "number",
    required: true,
    hint: "Out of 100. Below the course's pass mark it will be refused.",
  },
  { k: "issued", label: "Issued on", type: "date", required: true },
  {
    k: "why",
    label: "Why by hand",
    type: "textarea",
    wide: true,
    rows: 2,
    required: true,
    placeholder: "Sat the paper offline at the Abuja session; marked on paper.",
    hint: "Every certificate issued outside the normal path needs a reason.",
  },
];

const WHY_ONLY = (label, placeholder, hint) => [
  { k: "why", label, type: "textarea", wide: true, rows: 3, required: true, placeholder, hint },
];

export default function DsAdminCertificates() {
  const { accessToken } = useAuth();
  const [say, toast] = useAdmToast();

  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [view, setView] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [reload, setReload] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [courses, setCourses] = React.useState([]);
  const [open, setOpen] = React.useState(null); // { mode, row, values, errors }

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    setD(null);
    const t = setTimeout(
      () => {
        apiAuthed("/admin/certificates", { token: accessToken, params: q ? { q } : {} })
          .then((r) => alive && setD(r))
          .catch(() => alive && setFailed(true));
      },
      q ? 220 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [accessToken, q, reload]);

  // Only needed by the by-hand form, so it is fetched when that opens rather
  // than on every visit to the register.
  async function loadCourses() {
    if (courses.length) return courses;
    try {
      const r = await apiAuthed("/admin/courses", { token: accessToken });
      const list = (r?.items || r?.courses || r || [])
        .filter((c) => c.sku)
        .map((c) => `${c.sku} — ${c.title}`);
      setCourses(list);
      return list;
    } catch {
      return [];
    }
  }

  async function act(path, { body, ok } = {}) {
    setBusy(true);
    try {
      const r = await apiAuthed(path, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      setReload((n) => n + 1);
      setOpen(null);
      say(typeof ok === "function" ? ok(r) : ok);
      return true;
    } catch (err) {
      say(err?.message || "That did not work.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    const fields =
      open.mode === "issue"
        ? ISSUE_FIELDS.map((f) => (f.k === "courseSku" ? { ...f, options: courses } : f))
        : WHY_ONLY("Why");
    const errs = checkFields(fields, open.values);
    if (Object.keys(errs).length) {
      setOpen((o) => ({ ...o, errors: errs }));
      return;
    }
    const v = open.values;

    if (open.mode === "issue") {
      // The select shows "sku — Title" so an administrator can tell two
      // similarly named courses apart; the server wants the sku alone.
      const sku = String(v.courseSku || "").split(" — ")[0];
      act("/admin/certificates", {
        body: { ...v, courseSku: sku },
        ok: (r) => `Issued to ${r?.who || v.email} as ${r?.ref}.`,
      });
      return;
    }
    if (open.mode === "revoke") {
      act(`/admin/certificates/${open.row.id}/revoke`, {
        body: { why: v.why },
        ok: (r) => `${r?.ref} revoked. It no longer verifies.`,
      });
      return;
    }
    act(`/admin/certificates/${open.row.id}/reissue`, {
      body: { why: v.why },
      ok: (r) => `${r?.ref} reissued. Same pass, same reference.`,
    });
  }

  if (failed) {
    return <p className="adm-note">Certificates could not be loaded just now. Please refresh.</p>;
  }

  const all = d?.items || [];
  const items = view === "all" ? all : all.filter((c) => c.state === view);
  const counts = d?.counts || {};

  const cols = [
    {
      h: "Certificate",
      w: "18%",
      cell: (c) => <AdmTwo top={c.ref} under={c.issued ? `issued ${when(c.issued)}` : ""} />,
    },
    { h: "Who", w: "20%", cell: (c) => <AdmTwo top={c.who} under={c.email} /> },
    { h: "Course", cell: (c) => c.course },
    {
      h: "Mark",
      num: true,
      // Nobody sat a quiz, so there is no mark. An invented one on a
      // certificate is the worst possible place for a made-up number.
      cell: (c) => (c.mark == null ? <AdmDim>not marked</AdmDim> : `${c.mark}%`),
    },
    {
      h: "State",
      cell: (c) => (
        // His chip carries the reason as its tooltip, which is where a
        // withdrawn certificate's explanation belongs: on the thing that says
        // it was withdrawn.
        <span title={c.why || undefined}>
          <AdmChip tone={TONE[c.state] || ""}>{c.state}</AdmChip>
        </span>
      ),
    },
    {
      h: "",
      cell: (c) =>
        c.state === "revoked" ? (
          <span className="adm-rowacts">
            <button
              type="button"
              className="ds-btn btn-o ds-btn-sm"
              disabled={busy}
              onClick={() =>
                act(`/admin/certificates/${c.id}/reinstate`, {
                  ok: (r) => `${r?.ref} reinstated. It verifies again.`,
                })
              }
            >
              Reinstate
            </button>
          </span>
        ) : (
          <span className="adm-rowacts">
            <button
              type="button"
              className="ds-btn btn-o ds-btn-sm"
              onClick={() => setOpen({ mode: "reissue", row: c, errors: {}, values: { why: "" } })}
            >
              Reissue
            </button>
            <button
              type="button"
              className="ds-btn btn-o ds-btn-sm"
              onClick={() => setOpen({ mode: "revoke", row: c, errors: {}, values: { why: "" } })}
            >
              Revoke
            </button>
          </span>
        ),
    },
  ];

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Certificates</h1>
          <p className="adm-lede">
            Every certificate the studio has issued. One normally issues itself when the last
            module passes — this is where they are looked over, and where one is withdrawn when it
            should not have been given.
          </p>
        </div>
        <div id="adm-page-acts">
          <button
            type="button"
            className="ds-btn btn-p ds-btn-sm"
            onClick={async () => {
              const list = await loadCourses();
              setOpen({
                mode: "issue",
                errors: {},
                values: {
                  email: "",
                  courseSku: list[0] || "",
                  mark: 60,
                  issued: new Date().toISOString().slice(0, 10),
                  why: "",
                },
              });
            }}
          >
            + Issue by hand
          </button>
        </div>
      </div>

      <AdmFilters
        current={view}
        onPick={setView}
        options={[
          ["all", "Everything", counts.all],
          ["issued", "Issued", counts.issued],
          ["reissued", "Reissued", counts.reissued],
          ["revoked", "Revoked", counts.revoked],
        ]}
      />

      <label className="adm-find">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by reference, name, address or course"
          aria-label="Search by reference, name, address or course"
        />
      </label>

      {!d ? (
        <p className="adm-note">Reading…</p>
      ) : (
        <>
          <AdmTable
            cols={cols}
            rows={items}
            rowKey={(c) => c.id}
            empty={["Nothing issued", "No certificate has been issued yet."]}
          />

          <div className="adm-merge">
            <b>A reference is what verifies.</b>
            <span>
              Anybody can check one at <code>/verify/&lt;reference&gt;</code> without an account —
              an employer with a CV, a tender board with a submission. A withdrawn certificate
              answers there that it was withdrawn, which is the only part of a recall that actually
              reaches the person asking.
            </span>
          </div>
        </>
      )}

      {open ? (
        <AdmDrawer
          title={
            open.mode === "issue"
              ? "Issue a certificate by hand"
              : open.mode === "revoke"
                ? `Revoke ${open.row.ref}?`
                : `Reissue ${open.row.ref}`
          }
          intro={
            open.mode === "issue"
              ? "Certificates normally issue themselves when the last module passes. Doing it here is for the times that did not happen — so it asks why."
              : open.mode === "revoke"
                ? `${open.row.who} · ${open.row.course}. It stops verifying, and anybody checking it will be told it was withdrawn. They keep their pass; the certificate is what is withdrawn.`
                : "Same pass, same mark, same reference — a fresh copy. The original stays on the record."
          }
          note={
            open.mode === "revoke"
              ? "The PDF itself cannot be recalled: it is a file at a public address and whoever downloaded it still has it. What changes is that it no longer verifies."
              : ""
          }
          onClose={() => setOpen(null)}
          foot={
            <>
              <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => setOpen(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="ds-btn btn-p ds-btn-sm"
                disabled={busy}
                onClick={submit}
              >
                {busy
                  ? "Working…"
                  : open.mode === "issue"
                    ? "Issue it"
                    : open.mode === "revoke"
                      ? "Revoke it"
                      : "Reissue it"}
              </button>
            </>
          }
        >
          <AdmFields
            fields={
              open.mode === "issue"
                ? ISSUE_FIELDS.map((f) => (f.k === "courseSku" ? { ...f, options: courses } : f))
                : WHY_ONLY(
                    "Why",
                    open.mode === "revoke"
                      ? "Issued against the wrong submission."
                      : "Original lost; asked for a copy for a tender submission.",
                    open.mode === "revoke"
                      ? "A revoked certificate without a reason cannot be explained to the person holding it, or to an employer who asks."
                      : "",
                  )
            }
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
