// AI usage — what the studio spends, and what each account is allowed to.
//
// The register half is his: grouped by the FEATURE spending the money, because
// a feature is a thing that can be turned down and a day on a chart is not.
//
// WHY THIS SCREEN HAS BUTTONS ON IT
//
// The quota machinery has existed for a while — AiAllocation carries a per
// account allowance and a platform default, and the API has had full CRUD on
// both. What it lost in the port was the way to reach any of it: the screen
// that carried those controls stopped being routed, and this one replaced it
// with four read-only columns. So "this person is spending too much" became a
// fact with no button on it.
//
// It is back, on the row it belongs to. Three things you can do to an account:
// stop it, set what it may have, or sell it more.
//
// THE THIRD ONE IS NOT THE SECOND ONE
//
// Setting a limit replaces it. Selling somebody more ADDS to it, appends the
// reason to the record instead of overwriting it, and refuses to touch a cap
// of zero — because zero means unlimited, and "adding" a thousand calls to
// unlimited would quietly impose a ceiling on somebody who has just paid to
// have less of one.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmChip } from "./adminUi.jsx";
import { useAdmToast, checkFields } from "./adminKit.jsx";
import { AdmDrawer, AdmFields } from "./adminForm.jsx";

const usd = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    .format(Number(n) || 0);

const num = (n) => new Intl.NumberFormat("en-NG").format(Number(n) || 0);

/** A feature key as written in the code, said in words. */
const FEATURE = {
  "programme-outputs": "Programme — gang outputs",
  "course-quiz-draft": "Quiz drafting",
  agent: "Ada",
  "agent-chat": "Ada",
  "ada-chat": "Ada",
  helpbot: "HelpBot (retired)",
  "boq-check": "BoQ check",
};
const featureName = (k) => FEATURE[k] || k || "Unattributed";

// A cap of nothing is not a cap. Said in words everywhere it is shown, because
// "0" in a limit column reads as "blocked" to everybody who has not read the
// schema.
const cap = (n, unit) => (Number(n) > 0 ? `${num(n)} ${unit}` : "unlimited");

const GOVERNED = {
  own: ["ok", "own limits"],
  default: ["calm", "the default"],
  blocked: ["bad", "blocked"],
  guest: ["", "signed out"],
};

/* ── the forms ─────────────────────────────────────────────────────────── */

// Set what an account may have. Zero means unlimited in every one of these,
// which the hints say out loud rather than leaving to be discovered.
const LIMIT_FIELDS = [
  {
    k: "enabled",
    label: "May use AI at all",
    type: "check",
    hint: "Turn this off to stop the account using any AI feature. A limit of zero does not do this — zero is unlimited.",
  },
  {
    k: "calls",
    label: "Calls",
    type: "number",
    hint: "Requests to the model in the window. 0 for unlimited.",
  },
  {
    k: "tokens",
    label: "Tokens",
    type: "number",
    hint: "Read and written combined. 0 for unlimited.",
  },
  {
    k: "costUsd",
    label: "Spend, US$",
    type: "number",
    hint: "The ceiling in money, which is the one that actually protects the credit. 0 for unlimited.",
  },
  {
    k: "window",
    label: "Counted over",
    type: "select",
    options: ["month", "day"],
    hint: "A month suits the website features. A day suits a desktop tool, where a whole month spent on the first morning reads as the product being broken.",
  },
  {
    k: "notes",
    label: "Note",
    type: "textarea",
    rows: 2,
    wide: true,
    hint: "Why this account is different. It is kept with the allowance.",
  },
];

// Sell somebody more.
const TOPUP_FIELDS = [
  { k: "calls", label: "Add calls", type: "number", hint: "Left alone if their calls are already unlimited." },
  { k: "tokens", label: "Add tokens", type: "number" },
  { k: "costUsd", label: "Add spend, US$", type: "number" },
  {
    k: "why",
    label: "What it was for",
    type: "text",
    wide: true,
    required: true,
    placeholder: "Invoice ADLM-INV-0042",
    hint: "Appended to the record rather than replacing what is there, so the history of who bought what survives.",
  },
];

export default function DsAdminAiUsage() {
  const { accessToken } = useAuth();
  const [say, toast] = useAdmToast();

  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [reload, setReload] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(null); // { mode, row, values, errors }

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    setD(null);
    apiAuthed("/admin/docs/ai-usage", { token: accessToken })
      .then((r) => alive && setD(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken, reload]);

  async function write(path, { method = "PUT", body, ok } = {}) {
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
        err?.status === 403
          ? "Changing an allowance needs the AI usage permission."
          : err?.message || "That did not work.",
      );
      return null;
    } finally {
      setBusy(false);
    }
  }

  /** Open the limits form on a person, or on the platform default. */
  function editLimits(row) {
    const a = row ? row.allowance : d?.fallback;
    const t = a?.total || {};
    setOpen({
      mode: "limits",
      row,
      errors: {},
      values: {
        enabled: a ? a.enabled !== false : true,
        calls: t.calls ?? 0,
        tokens: t.tokens ?? 0,
        costUsd: t.costUsd ?? 0,
        window: t.window || "month",
        notes: a?.notes || "",
      },
    });
  }

  async function saveLimits() {
    const errs = checkFields(LIMIT_FIELDS, open.values);
    if (Object.keys(errs).length) {
      setOpen((o) => ({ ...o, errors: errs }));
      return;
    }
    const v = open.values;
    const body = {
      enabled: !!v.enabled,
      total: {
        enabled: true,
        calls: Number(v.calls) || 0,
        tokens: Number(v.tokens) || 0,
        costUsd: Number(v.costUsd) || 0,
        window: v.window || "month",
      },
      notes: v.notes || "",
    };

    const done = open.row
      ? await write(`/admin/ai-usage/allocations/user/${open.row.userId}`, {
          body,
          ok: v.enabled
            ? `${open.row.who} is on their own allowance now.`
            : `${open.row.who} can no longer use any AI feature.`,
        })
      : await write("/admin/ai-usage/allocations/default", {
          // The default row also carries the shared ceiling for everybody who
          // is signed out, and this form does not edit it — so it is sent back
          // as it came, rather than being blanked by omission.
          body: { ...body, guestTotal: d?.fallback?.guestTotal || {} },
          ok: "Saved. This is what an account gets unless it has its own.",
        });
    if (done) setOpen(null);
  }

  async function saveTopUp() {
    const errs = checkFields(TOPUP_FIELDS, open.values);
    if (Object.keys(errs).length) {
      setOpen((o) => ({ ...o, errors: errs }));
      return;
    }
    const v = open.values;
    const done = await write(`/admin/ai-usage/allocations/user/${open.row.userId}/top-up`, {
      method: "POST",
      body: {
        calls: Number(v.calls) || 0,
        tokens: Number(v.tokens) || 0,
        costUsd: Number(v.costUsd) || 0,
        why: v.why,
      },
      ok: (r) => {
        const skipped = (r?.untouched || []).length;
        return (
          `${open.row.who} has more.` +
          (skipped
            ? ` ${r.untouched.join(" and ")} were already unlimited, so they were left alone.`
            : "")
        );
      },
    });
    if (done) setOpen(null);
  }

  async function dropOverride(row) {
    await write(`/admin/ai-usage/allocations/user/${row.userId}`, {
      method: "DELETE",
      ok: `${row.who} is back on the platform default.`,
    });
  }

  if (failed) {
    return <p className="adm-note">AI usage could not be loaded just now. Please refresh.</p>;
  }

  const t = d?.totals;
  const fb = d?.fallback;

  const featureCols = [
    { h: "Feature", w: "32%", cell: (f) => featureName(f.name) },
    { h: "Calls", num: true, cell: (f) => num(f.calls) },
    { h: "Tokens in", num: true, cell: (f) => num(f.inTokens) },
    { h: "Tokens out", num: true, cell: (f) => num(f.outTokens) },
    { h: "Cost", num: true, cell: (f) => (f.cost ? usd(f.cost) : <AdmDim>—</AdmDim>) },
  ];

  const peopleCols = [
    { h: "Who", w: "26%", cell: (p) => <AdmTwo top={p.who} under={p.email} /> },
    { h: "Calls", num: true, cell: (p) => num(p.calls) },
    { h: "On what", cell: (p) => p.features.map(featureName).join(" · ") },
    { h: "Cost", num: true, cell: (p) => (p.cost ? usd(p.cost) : <AdmDim>—</AdmDim>) },
    {
      h: "Allowed",
      cell: (p) => {
        const [tone, label] = GOVERNED[p.governed] || ["", p.governed];
        // What actually governs this row, said in the same breath as the
        // label — a chip alone says "own limits" without saying what they are.
        const t = p.allowance ? p.allowance.total : fb?.total;
        const detail =
          p.governed === "guest"
            ? "a shared ceiling"
            : t
              ? `${cap(t.calls, "calls")}, ${t.costUsd > 0 ? usd(t.costUsd) : "unlimited spend"} a ${t.window}`
              : "";
        return (
          <span className="adm-allow">
            <AdmChip tone={tone}>{label}</AdmChip>
            {detail ? <span>{detail}</span> : null}
          </span>
        );
      },
    },
    {
      h: "",
      cell: (p) =>
        // A signed-out row is a bucket, not an account. There is nobody to set
        // an allowance on, and the shared guest ceiling is set on the default.
        !p.userId ? (
          <AdmDim>no account</AdmDim>
        ) : (
          <span className="adm-rowacts">
            <button
              type="button"
              className="ds-btn btn-o ds-btn-sm"
              onClick={() => editLimits(p)}
            >
              Limits
            </button>
            <button
              type="button"
              className="ds-btn btn-o ds-btn-sm"
              onClick={() =>
                setOpen({
                  mode: "topup",
                  row: p,
                  errors: {},
                  values: { calls: 0, tokens: 0, costUsd: 0, why: "" },
                })
              }
            >
              They paid for more
            </button>
            {p.allowance ? (
              <button
                type="button"
                className="ds-btn btn-o ds-btn-sm"
                disabled={busy}
                onClick={() => dropOverride(p)}
              >
                Back to default
              </button>
            ) : null}
          </span>
        ),
    },
  ];

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">AI usage</h1>
          <p className="adm-lede">
            What the studio spends on AI, by the feature spending it. A feature is something that
            can be turned down; a day on a chart is not.
          </p>
        </div>
        <div id="adm-page-acts">
          <button
            type="button"
            className="ds-btn btn-p ds-btn-sm"
            onClick={() => editLimits(null)}
            disabled={!d}
          >
            Set the default allowance
          </button>
        </div>
      </div>

      {t ? (
        <div className="adm-kpis">
          <div className="adm-kpi">
            <span className="k">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <use href="#ai-ada" />
              </svg>
              <span>Spent, last {d.days} days</span>
            </span>
            <b>{usd(t.cost)}</b>
            <span className="sub">across {num(t.calls)} calls</span>
          </div>
          <div className="adm-kpi">
            <span className="k">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <use href="#hi-doc" />
              </svg>
              <span>Tokens read</span>
            </span>
            <b>{num(t.inTokens)}</b>
            <span className="sub">what was sent to the model</span>
          </div>
          <div className="adm-kpi">
            <span className="k">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <use href="#hi-doc" />
              </svg>
              <span>Tokens written</span>
            </span>
            <b>{num(t.outTokens)}</b>
            <span className="sub">what it wrote back — the expensive half</span>
          </div>
        </div>
      ) : null}

      {!d ? (
        <p className="adm-note">Reading…</p>
      ) : (
        <>
          <AdmTable
            cols={featureCols}
            rows={d.items || []}
            rowKey={(f) => f.id}
            empty={["Nothing spent", "No AI call has been made in this period."]}
          />

          <div className="adm-pagehead" style={{ marginTop: 28 }}>
            <div>
              <h2 className="adm-h" style={{ fontSize: 20 }}>
                Who spent it
              </h2>
              <p className="adm-lede">
                The same period, by account, and what each one is allowed. Ada answers signed-out
                visitors too, and those land under a single unattributed row rather than being
                dropped — they share one ceiling, set with the default.
              </p>
            </div>
          </div>

          <AdmTable
            cols={peopleCols}
            rows={d.people || []}
            rowKey={(p) => p.id}
            empty={["Nobody", "No account has used an AI feature."]}
          />

          {fb ? (
            <div className="adm-merge">
              <b>Zero means unlimited.</b>
              <span>
                It is not a block — an unconfigured install behaves exactly as it did before any of
                this existed. To stop an account, turn off <i>May use AI at all</i>. Right now every
                account without its own allowance gets {cap(fb.total.calls, "calls")} and{" "}
                {fb.total.costUsd ? usd(fb.total.costUsd) : "unlimited spend"} a {fb.total.window}
                {fb.enabled ? "" : ", and AI is switched off platform-wide"}.
              </span>
            </div>
          ) : null}
        </>
      )}

      {open?.mode === "limits" ? (
        <AdmDrawer
          title={open.row ? `What ${open.row.who} may use` : "The default allowance"}
          intro={
            open.row
              ? "This account only. Removing it later puts them back on the platform default."
              : "What every account gets unless it has its own. The shared ceiling for signed-out visitors is kept as it is."
          }
          note="A limit of 0 is unlimited, not blocked."
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
                onClick={saveLimits}
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <AdmFields
            fields={LIMIT_FIELDS}
            values={open.values}
            errors={open.errors}
            onChange={(values) => setOpen((o) => ({ ...o, values }))}
          />
        </AdmDrawer>
      ) : null}

      {open?.mode === "topup" ? (
        <AdmDrawer
          title={`${open.row.who} paid for more`}
          intro="Added to what they already have, rather than replacing it — so two people topping the same account up in the same minute cannot undo each other."
          note="A dimension that is already unlimited is left alone: adding to unlimited would impose a ceiling on somebody who just paid to avoid one."
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
                onClick={saveTopUp}
              >
                {busy ? "Adding…" : "Add it"}
              </button>
            </>
          }
        >
          <AdmFields
            fields={TOPUP_FIELDS}
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
